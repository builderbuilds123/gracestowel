/**
 * Stripe Capture Service
 * 
 * Story 1.3: Fulfillment-triggered capture
 * Provides service function for capturing payments immediately when fulfillment is created.
 * 
 * Note: This service schedules an immediate capture job rather than calling Stripe directly,
 * to reuse all the existing logic in payment-capture-worker (Payment Module support, 
 * order total fetching, error handling, etc.)
 */

import { MedusaContainer } from "@medusajs/medusa";
import { schedulePaymentCapture } from "../lib/payment-capture-queue";
import { cancelPaymentCaptureJob } from "../lib/payment-capture-queue";
import { logger } from "../utils/logger";

/**
 * Capture payment immediately (used by fulfillment-triggered capture)
 * 
 * Story 1.3: When fulfillment is created, capture payment immediately and remove scheduled job.
 * 
 * @param orderId - The Medusa order ID
 * @param paymentIntentId - The Stripe PaymentIntent ID
 * @param container - Medusa container for accessing services
 */
export async function capturePayment(
  orderId: string,
  paymentIntentId: string,
  container: MedusaContainer
): Promise<void> {
  const idempotencyKey = `capture_${orderId}_${paymentIntentId}`;

  logger.info("stripe-capture", "Triggering immediate capture on fulfillment", {
    orderId,
    paymentIntentId,
    idempotencyKey,
  });

  // Story 1.3 AC1: Remove scheduled fallback job
  const jobRemoved = await cancelPaymentCaptureJob(orderId);
  logger.info("stripe-capture", `Fallback job ${jobRemoved ? "removed" : "not found"}`, {
    orderId,
  });

  // Story 1.3 AC2: Schedule immediate capture (delay: 0)
  // This reuses all existing worker logic (Payment Module, order total fetching, etc.)
  try {
    await schedulePaymentCapture(orderId, paymentIntentId, 0);
    logger.info("stripe-capture", "Immediate capture job scheduled successfully", {
      orderId,
      paymentIntentId,
    });
  } catch (error) {
    logger.error("stripe-capture", "Failed to schedule immediate capture", {
      orderId,
      paymentIntentId,
      error: error instanceof Error ? error.message : String(error),
    });
    // Do NOT swallow - let it propagate for alerting
    throw error;
  }
}
