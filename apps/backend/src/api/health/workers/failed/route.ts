import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { logger } from "../../../../utils/logger";
import { getStripeEventQueue } from "../../../../lib/stripe-event-queue";
import { getPaymentCaptureQueue } from "../../../../lib/payment-capture-queue";

/**
 * GET /health/workers/failed
 * 
 * Returns recent failed jobs from both queues for debugging.
 * Limited to last 10 failed jobs per queue.
 */
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const result: {
    stripeEventQueue: any[];
    paymentCaptureQueue: any[];
    errors: string[];
  } = {
    stripeEventQueue: [],
    paymentCaptureQueue: [],
    errors: [],
  };

  // Get failed Stripe events
  try {
    const stripeQueue = getStripeEventQueue();
    const failedJobs = await stripeQueue.getFailed(0, 10);

    result.stripeEventQueue = failedJobs.map((job) => ({
      id: job.id,
      name: job.name,
      eventId: job.data?.eventId,
      eventType: job.data?.eventType,
      failedReason: job.failedReason,
      attemptsMade: job.attemptsMade,
      timestamp: job.timestamp,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
    }));
  } catch (err: any) {
    result.errors.push(`Stripe queue: ${err.message}`);
  }

  // Get failed payment captures
  try {
    const captureQueue = getPaymentCaptureQueue();
    const failedJobs = await captureQueue.getFailed(0, 10);

    result.paymentCaptureQueue = failedJobs.map((job) => ({
      id: job.id,
      name: job.name,
      orderId: job.data?.orderId,
      paymentIntentId: job.data?.paymentIntentId,
      failedReason: job.failedReason,
      attemptsMade: job.attemptsMade,
      timestamp: job.timestamp,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
    }));
  } catch (err: any) {
    result.errors.push(`Capture queue: ${err.message}`);
  }

  logger.info("health", "Failed jobs retrieved", {
    stripeFailedCount: result.stripeEventQueue.length,
    captureFailedCount: result.paymentCaptureQueue.length,
  });

  res.status(200).json({
    timestamp: new Date().toISOString(),
    ...result,
  });
}
