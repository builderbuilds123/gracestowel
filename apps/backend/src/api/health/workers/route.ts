import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { logger } from "../../../utils/logger";
import { getStripeEventQueue } from "../../../lib/stripe-event-queue";
import { getPaymentCaptureQueue } from "../../../lib/payment-capture-queue";
import { startPaymentCaptureWorker } from "../../../workers/payment-capture-worker";

/**
 * GET /health/workers
 * 
 * Health check endpoint for BullMQ workers and Redis connectivity.
 * Shows queue depths, worker status, and recent job activity.
 * 
 * Use this to diagnose:
 * - Is Redis connected?
 * - Are workers running?
 * - Are events being queued but not processed?
 */
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  if (process.env.REDIS_URL) {
    startPaymentCaptureWorker(req.scope as any)
  }

  const status: {
    redis: { connected: boolean; error?: string };
    stripeEventQueue: {
      waiting: number;
      active: number;
      delayed: number;
      completed: number;
      failed: number;
    } | null;
    paymentCaptureQueue: {
      waiting: number;
      active: number;
      delayed: number;
      completed: number;
      failed: number;
    } | null;
    paymentCaptureDelayedJobs?: Array<{
      id: string | number | null;
      orderId?: string;
      paymentIntentId?: string;
      attemptsMade: number;
      scheduledFor?: string;
      delayMs?: number;
    }>;
    errors: string[];
  } = {
    redis: { connected: false },
    stripeEventQueue: null,
    paymentCaptureQueue: null,
    errors: [],
  };

  // Check Redis connectivity and queue status

  // Test Stripe Event Queue
  try {
    const stripeQueue = getStripeEventQueue();
    const [waiting, active, delayed, completed, failed] = await Promise.all([
      stripeQueue.getWaitingCount(),
      stripeQueue.getActiveCount(),
      stripeQueue.getDelayedCount(),
      stripeQueue.getCompletedCount(),
      stripeQueue.getFailedCount(),
    ]);

    status.stripeEventQueue = { waiting, active, delayed, completed, failed };
    status.redis.connected = true;

    logger.info("health", "Stripe event queue status", {
      waiting,
      active,
      delayed,
      completed,
      failed,
    });
  } catch (stripeQueueError: any) {
    status.errors.push(`Stripe queue error: ${stripeQueueError.message}`);
    logger.error("health", "Failed to get stripe queue status", {}, stripeQueueError);
  }

  // Test Payment Capture Queue
  try {
    const captureQueue = getPaymentCaptureQueue();
    const [waiting, active, delayed, completed, failed] = await Promise.all([
      captureQueue.getWaitingCount(),
      captureQueue.getActiveCount(),
      captureQueue.getDelayedCount(),
      captureQueue.getCompletedCount(),
      captureQueue.getFailedCount(),
    ]);

    const delayedJobs = await captureQueue.getDelayed(0, 9);

    status.paymentCaptureDelayedJobs = delayedJobs.map((job) => {
      const delayMs = job.opts.delay || 0;
      const scheduledFor = delayMs
        ? new Date(job.timestamp + delayMs).toISOString()
        : undefined;

      return {
        id: job.id ?? null,
        orderId: job.data?.orderId,
        paymentIntentId: job.data?.paymentIntentId,
        attemptsMade: job.attemptsMade,
        scheduledFor,
        delayMs,
      };
    });

    status.paymentCaptureQueue = { waiting, active, delayed, completed, failed };
    status.redis.connected = true;

    logger.info("health", "Payment capture queue status", {
      waiting,
      active,
      delayed,
      completed,
      failed,
    });
  } catch (captureQueueError: any) {
    status.errors.push(`Capture queue error: ${captureQueueError.message}`);
    logger.error("health", "Failed to get capture queue status", {}, captureQueueError);
  }

  // Determine overall health
  const isHealthy =
    status.redis.connected &&
    status.errors.length === 0;

  // Log summary
  logger.info("health", "Worker health check", {
    healthy: isHealthy,
    redisConnected: status.redis.connected,
    stripeQueueActive: status.stripeEventQueue?.active ?? 0,
    stripeQueueWaiting: status.stripeEventQueue?.waiting ?? 0,
    captureQueueDelayed: status.paymentCaptureQueue?.delayed ?? 0,
    errorCount: status.errors.length,
  });

  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    ...status,
    summary: {
      stripeEventsWaiting: status.stripeEventQueue?.waiting ?? "unknown",
      stripeEventsProcessing: status.stripeEventQueue?.active ?? "unknown",
      stripeEventsFailed: status.stripeEventQueue?.failed ?? "unknown",
      captureJobsScheduled: status.paymentCaptureQueue?.delayed ?? "unknown",
    },
  });
}
