import { Worker, Job } from "bullmq";
import { MedusaContainer, INotificationModuleService } from "@medusajs/framework/types";
import { getRedisConnection } from "../lib/redis";
import { EmailJobPayload } from "../lib/email-queue";
import { maskEmail } from "../utils/email-masking";
// We need a redis client for LPUSH operations
import Redis from "ioredis";

const QUEUE_NAME = "email-queue";
const DLQ_KEY = "email:dlq";

let emailWorker: Worker | null = null;
let dlqRedis: Redis | null = null;

/**
 * Checks if an error is retryable (transient) or permanent.
 *
 * @param error - The error object
 * @returns true if retryable, false if permanent
 */
export function isRetryableError(error: any): boolean {
  // Resend API errors have status codes
  const status = error.statusCode || error.status || error.response?.status;

  // 4xx errors (except rate limit) are not retryable
  if (status && status >= 400 && status < 500 && status !== 429) {
    return false;
  }

  // Check for specific invalid email error messages
  const message = (error.message || "").toLowerCase();
  if (message.includes("invalid email") ||
      message.includes("invalid recipient") ||
      message.includes("email address is not valid")) {
    return false;
  }

  // Everything else is retryable (5xx, 429, network errors)
  return true;
}

/**
 * Moves a job directly to DLQ without further retries.
 */
async function moveToDLQDirectly(
  job: Job<EmailJobPayload>,
  error: Error,
  redis: Redis,
  logger: any
) {
  const { orderId, template, recipient } = job.data;

  const errorMessage = error.message || "unknown_error";
  const dlqEntry = {
    jobId: job.id,
    orderId,
    template,
    recipient: maskEmail(recipient),
    error: `Invalid email address: ${maskEmail(recipient)} - ${errorMessage}`,
    failedAt: new Date().toISOString(),
    attempts: job.attemptsMade + 1,
    reason: "invalid_email",
  };

  try {
    await redis.lpush(DLQ_KEY, JSON.stringify(dlqEntry));
    logger.warn(`[EMAIL][INVALID] Invalid email address for order ${orderId}, moved to DLQ`);

    const timestamp = new Date().toISOString();
    const sanitizedError = errorMessage.replace(/\|/g, "-").replace(/\s/g, "_");
    logger.error(
        `[EMAIL][ALERT] Email delivery failed | ` +
        `order=${orderId} ` +
        `template=${template} ` +
        `error=Invalid_email_${sanitizedError} ` +
        `attempts=${job.attemptsMade + 1} ` +
        `timestamp=${timestamp}`
    );

    logger.error(`[EMAIL][DLQ] Job ${job.id} moved to DLQ after ${job.attemptsMade + 1} attempts`);
    logger.info(`[METRIC] email_dlq template=${template} order=${orderId} reason=invalid_email`);
    logger.info(`[METRIC] email_alert order=${orderId} template=${template}`);
  } catch (dlqError: any) {
    logger.error(`[EMAIL][DLQ_ERROR] Failed to store job ${job.id} in DLQ: ${dlqError.message}`);
    // Re-throw to prevent silent data loss - BullMQ will retry the job
    throw new Error(`Failed to store invalid email in DLQ: ${dlqError.message}`);
  }
}

import fs from 'fs';
import path from 'path';

/**
 * Starts the email worker to process email jobs from the queue.
 *
 * @param container - The Medusa container to resolve services
 * @returns The started worker instance
 */
import { initEmailQueue } from "../lib/email-queue";

let shutdownHandler: (() => Promise<void>) | null = null;

// ... existing code ...

/**
 * Starts the email worker to process email jobs from the queue.
 *
 * @param container - The Medusa container to resolve services
 * @returns The started worker instance
 */
export function startEmailWorker(container: MedusaContainer): Worker {
  if (emailWorker) {
    return emailWorker;
  }

  // Ensure queue logger is initialized (matches payment worker not exposing init logic)
  initEmailQueue(container);

  const logger = container.resolve("logger");
  const notificationService = container.resolve("notification") as INotificationModuleService;

  // Create a separate Redis connection for DLQ operations
  if (!dlqRedis) {
      dlqRedis = new Redis(getRedisConnection());
  }

  emailWorker = new Worker(
    QUEUE_NAME,
    async (job: Job<EmailJobPayload>) => {
      // ... existing processor logic ...
      const { orderId, template, recipient, data } = job.data;
      const maskedRecipient = maskEmail(recipient);
      const attemptNum = job.attemptsMade + 1;

      if (job.attemptsMade > 0) {
        logger.info(`[EMAIL][RETRY] Attempt ${attemptNum}/3 for order ${orderId}`);
      } else {
        logger.info(`[EMAIL][PROCESS] Processing ${template} for order ${orderId}, attempt ${attemptNum}/3`);
      }

      try {
        const notification = await notificationService.createNotifications({
          to: recipient,
          channel: "email",
          template: template,
          data: data as Record<string, unknown>,
        });
        
        const notificationId = notification?.id || "sent";

        logger.info(`[EMAIL][SENT] Sent ${template} to ${maskedRecipient} for order ${orderId}. ID: ${notificationId}`);
        logger.info(`[METRIC] email_sent template=${template} order=${orderId}`);
      } catch (error: any) {
        // Check if error is retryable
        if (!isRetryableError(error)) {
          // Invalid email - move directly to DLQ, don't retry
          if (!dlqRedis) {
            logger.error(`[EMAIL][DLQ_ERROR] DLQ Redis client not initialized, cannot store failed job`);
            throw new Error("DLQ Redis client not initialized");
          }
          await moveToDLQDirectly(job, error, dlqRedis, logger);
          return; // Don't throw - job completes (but email not sent)
        }

        logger.error(`[EMAIL][FAILED] Failed ${template} for order ${orderId} (attempt ${attemptNum}/3): ${error.message}`);
        logger.info(`[METRIC] email_failed template=${template} order=${orderId} error=${error.code || "unknown"}`);
        throw error; // Re-throw to trigger BullMQ retry
      }
    },
    {
      connection: getRedisConnection(),
      concurrency: 5,
    }
  );

  emailWorker.on("completed", (job) => {
    logger.info(`[EMAIL][COMPLETE] Job ${job.id} completed`);
  });

  emailWorker.on("failed", async (job, error) => {
    logger.error(`[EMAIL][JOB_FAILED] Job ${job?.id} failed: ${error.message}`);

    if (job) {
        const { orderId, template, recipient } = job.data;
        const timestamp = new Date().toISOString();

        const dlqEntry = {
            jobId: job.id,
            orderId,
            template,
            recipient: maskEmail(recipient),
            error: error.message,
            failedAt: timestamp,
            attempts: job.attemptsMade,
        };

        if (!dlqRedis) {
            logger.error(`[EMAIL][DLQ_ERROR] DLQ Redis client not initialized, cannot store failed job ${job.id}`);
            return;
        }

        try {
            await dlqRedis.lpush(DLQ_KEY, JSON.stringify(dlqEntry));
            logger.error(`[EMAIL][DLQ] Job ${job.id} moved to DLQ after ${job.attemptsMade} attempts: ${error.message}`);

            // ALERT log (parseable format)
            logger.error(
                `[EMAIL][ALERT] Email delivery failed | ` +
                `order=${orderId} ` +
                `template=${template} ` +
                `error=${error.message.replace(/\|/g, "-").replace(/\s/g, "_")} ` +
                `attempts=${job.attemptsMade} ` +
                `timestamp=${timestamp}`
            );

            logger.info(`[METRIC] email_dlq template=${template} order=${orderId}`);
            logger.info(`[METRIC] email_alert order=${orderId} template=${template}`);
        } catch (dlqError: any) {
            logger.error(`[EMAIL][DLQ_ERROR] Failed to store job ${job.id} in DLQ: ${dlqError.message}`);
        }
    }
  });

  console.log("[EMAIL] Email worker started");

  // Graceful shutdown (register once)
  if (!shutdownHandler) {
      shutdownHandler = async () => {
          console.log("[EMAIL] Shutting down email worker...");
          await emailWorker?.close();
          if (dlqRedis) {
              await dlqRedis.quit();
              dlqRedis = null;
          }
      };
      process.on("SIGTERM", shutdownHandler);
      process.on("SIGINT", shutdownHandler);
  }

  return emailWorker;
}

/**
 * Shuts down the email worker and closes the DLQ Redis connection.
 * Essential for testing to prevent open handles.
 */
export async function shutdownEmailWorker() {
  if (emailWorker) {
    await emailWorker.close();
    emailWorker = null;
  }
  if (dlqRedis) {
    await dlqRedis.quit();
    dlqRedis = null;
  }
}
