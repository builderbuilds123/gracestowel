import { Queue, Job } from "bullmq";
import { randomUUID } from "crypto";
import { getRedisConnection } from "./redis";
import type { MedusaContainer, Logger } from "@medusajs/framework/types";
import { maskEmail } from "../utils/email-masking";

const QUEUE_NAME = "email-queue";

let emailQueue: Queue | null = null;
type MinimalLogger = Pick<Logger, "info" | "error">;
let logger: MinimalLogger = console; // Default to console, replaced by initEmailQueue

import { Templates } from "../modules/resend/service";

export interface EmailJobPayload {
  entityId: string; // e.g. order ID, customer ID
  template: Templates; // matches Templates enum in resend service
  recipient: string;
  data: Record<string, unknown>;
}

/**
 * Initializes the email queue with the Medusa container to access the logger.
 * Should be called during application startup.
 */
export function initEmailQueue(container: MedusaContainer) {
  try {
    logger = container.resolve("logger");
  } catch (e) {
    // Fallback if logger resolution fails (e.g. testing)
    logger = console;
  }
}

/**
 * Returns the singleton email queue instance.
 * Creates it if it doesn't exist.
 */
export function getEmailQueue(): Queue {
  if (!emailQueue) {
    emailQueue = new Queue(QUEUE_NAME, {
      connection: getRedisConnection(),
    });
  }
  return emailQueue;
}

/**
 * Enqueues an email job.
 *
 * @param payload - The email job payload
 * @returns The created job, or null if queuing failed (should catch error in caller)
 */
export async function enqueueEmail(payload: EmailJobPayload): Promise<Job | null> {
  try {
    const queue = getEmailQueue();
    const jobName = `email-${payload.template}`;
    const jobId = `${jobName}-${payload.entityId}-${randomUUID()}`;

    const job = await queue.add(jobName, payload, {
      jobId, // idempotency key
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 1000, // 1s, 2s, 4s
      },
    });

    const safeTemplate =
      payload.template === Templates.PASSWORD_RESET ? "password_reset" : payload.template;
    logger.info(`[EMAIL][QUEUE] Enqueued ${safeTemplate} for entity ${payload.entityId}`);
    return job;
  } catch (error: unknown) {
    // CRITICAL: Catch all errors - never throw from email queue
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`[EMAIL][ERROR] Failed to queue email for entity ${payload.entityId}: ${message}`);
    return null;
  }
}
