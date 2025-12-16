import { Queue, Job } from "bullmq";
import { getRedisConnection } from "./redis";
import { MedusaContainer } from "@medusajs/framework/types";
import { maskEmail } from "../utils/email-masking";

const QUEUE_NAME = "email-queue";

let emailQueue: Queue | null = null;
let logger: any = console; // Default to console, replaced by initEmailQueue

export interface EmailJobPayload {
  orderId: string;
  template: "order-placed"; // matches Templates.ORDER_PLACED enum in resend service
  recipient: string;
  data: {
    order: {
      id: string;
      display_id?: string;
      email?: string;
      currency_code?: string;
      total?: number;
      subtotal?: number;
      shipping_total?: number;
      tax_total?: number;
      items?: Array<{
        title: string;
        variant_title?: string;
        quantity: number;
        unit_price: number;
      }>;
      shipping_address?: {
        first_name?: string;
        last_name?: string;
        address_1?: string;
        address_2?: string;
        city?: string;
        province?: string;
        postal_code?: string;
        country_code?: string;
      };
    };
    modification_token?: string;
  };
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
    const jobId = `email-${payload.orderId}`;

    const job = await queue.add(jobId, payload, {
      jobId, // idempotency key
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 1000, // 1s, 2s, 4s
      },
    });

    logger.info(`[EMAIL][QUEUE] Enqueued ${payload.template} for order ${payload.orderId} to ${maskEmail(payload.recipient)}`);
    return job;
  } catch (error: any) {
    // CRITICAL: Catch all errors - never throw from email queue
    logger.error(`[EMAIL][ERROR] Failed to queue email for order ${payload.orderId}: ${error.message}`);
    return null;
  }
}
