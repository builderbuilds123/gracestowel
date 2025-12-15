import { Worker, Job } from "bullmq";
import { MedusaContainer } from "@medusajs/framework/types";
import { getRedisConnection } from "../lib/redis";
import { getEmailQueue, EmailJobPayload } from "../lib/email-queue";
import { maskEmail } from "../utils/email-masking";
// We need a redis client for LPUSH operations
import Redis from "ioredis";

const QUEUE_NAME = "email-queue";
const DLQ_KEY = "email:dlq";

let emailWorker: Worker | null = null;
let dlqRedis: Redis | null = null;

// Define a minimal interface for the Resend service to satisfy type checking
interface ResendService {
  send(notification: { to: string; template: string; data: unknown }): Promise<{ id: string } | undefined>;
}

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

  const dlqEntry = {
    jobId: job.id,
    orderId,
    template,
    recipient: maskEmail(recipient),
    error: `Invalid email address: ${maskEmail(recipient)} - ${error.message}`,
    failedAt: new Date().toISOString(),
    attempts: job.attemptsMade + 1,
    reason: "invalid_email",
  };

  try {
    await redis.lpush(DLQ_KEY, JSON.stringify(dlqEntry));
    logger.warn(`[EMAIL][INVALID] Invalid email address for order ${orderId}, moved to DLQ`);

    const timestamp = new Date().toISOString();
    logger.error(
        `[EMAIL][ALERT] Email delivery failed | ` +
        `order=${orderId} ` +
        `template=${template} ` +
        `error=Invalid_email_${error.message.replace(/\|/g, "-").replace(/\s/g, "_")} ` +
        `attempts=${job.attemptsMade + 1} ` +
        `timestamp=${timestamp}`
    );

    logger.error(`[EMAIL][DLQ] Job ${job.id} moved to DLQ after ${job.attemptsMade + 1} attempts`);
    logger.info(`[METRIC] email_dlq template=${template} order=${orderId} reason=invalid_email`);
    logger.info(`[METRIC] email_alert order=${orderId} template=${template}`);
  } catch (dlqError: any) {
    logger.error(`[EMAIL][DLQ_ERROR] Failed to store job ${job.id} in DLQ: ${dlqError.message}`);
  }
}

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

  const logger = container.resolve("logger");
  const resendService = container.resolve("resendNotificationProviderService") as ResendService;

  // Create a separate Redis connection for DLQ operations
  if (!dlqRedis) {
      dlqRedis = new Redis(getRedisConnection());
  }

  emailWorker = new Worker(
    QUEUE_NAME,
    async (job: Job<EmailJobPayload>) => {
      const { orderId, template, recipient, data } = job.data;
      const maskedRecipient = maskEmail(recipient);
      const attemptNum = job.attemptsMade + 1;

      if (job.attemptsMade > 0) {
        logger.info(`[EMAIL][RETRY] Attempt ${attemptNum}/3 for order ${orderId}`);
      } else {
        logger.info(`[EMAIL][PROCESS] Processing ${template} for order ${orderId}, attempt ${attemptNum}/3`);
      }

      try {
        await resendService.send({
          to: recipient,
          template: template,
          data: data,
        });

        logger.info(`[EMAIL][SENT] Sent ${template} to ${maskedRecipient} for order ${orderId}`);
        logger.info(`[METRIC] email_sent template=${template} order=${orderId}`);
      } catch (error: any) {
        // Check if error is retryable
        if (!isRetryableError(error)) {
          // Invalid email - move directly to DLQ, don't retry
          await moveToDLQDirectly(job, error, dlqRedis!, logger);
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

        try {
            await dlqRedis!.lpush(DLQ_KEY, JSON.stringify(dlqEntry));
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

  return emailWorker;
}
