import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { getStripeEventQueue } from "../../../lib/stripe-event-queue";

/**
 * Admin endpoint to check BullMQ queue status
 * GET /admin/stripe-queue-status
 * 
 * Returns:
 * - waiting: Jobs waiting to be processed
 * - active: Jobs currently being processed
 * - completed: Recently completed jobs
 * - failed: Failed jobs (in DLQ)
 * - delayed: Jobs scheduled for retry
 */
export async function GET(
    req: MedusaRequest,
    res: MedusaResponse
): Promise<void> {
    // Security: Block access in production (stacktraces and internal state exposed)
    if (process.env.NODE_ENV === "production") {
        res.status(404).json({ error: "Endpoint not available in production" });
        return;
    }

    try {
        const queue = getStripeEventQueue();
        
        const [waiting, active, completed, failed, delayed] = await Promise.all([
            queue.getWaiting(0, 10),
            queue.getActive(0, 10),
            queue.getCompleted(0, 10),
            queue.getFailed(0, 10),
            queue.getDelayed(0, 10),
        ]);

        const counts = await queue.getJobCounts();

        res.json({
            status: "ok",
            counts,
            jobs: {
                waiting: waiting.map(j => ({
                    id: j.id,
                    eventId: j.data.eventId,
                    eventType: j.data.eventType,
                    receivedAt: new Date(j.data.receivedAt).toISOString(),
                    attempts: j.attemptsMade,
                })),
                active: active.map(j => ({
                    id: j.id,
                    eventId: j.data.eventId,
                    eventType: j.data.eventType,
                    receivedAt: new Date(j.data.receivedAt).toISOString(),
                    attempts: j.attemptsMade,
                    processedOn: j.processedOn ? new Date(j.processedOn).toISOString() : null,
                })),
                completed: completed.map(j => ({
                    id: j.id,
                    eventId: j.data.eventId,
                    eventType: j.data.eventType,
                    finishedOn: j.finishedOn ? new Date(j.finishedOn).toISOString() : null,
                })),
                failed: failed.map(j => ({
                    id: j.id,
                    eventId: j.data.eventId,
                    eventType: j.data.eventType,
                    attempts: j.attemptsMade,
                    failedReason: j.failedReason,
                    // Removed: stacktrace - exposes internal implementation details
                })),
                delayed: delayed.map(j => ({
                    id: j.id,
                    eventId: j.data.eventId,
                    eventType: j.data.eventType,
                    attempts: j.attemptsMade,
                    delay: j.opts.delay,
                })),
            },
        });
    } catch (error) {
        res.status(500).json({
            status: "error",
            message: (error as Error).message,
            hint: "Is REDIS_URL configured? Is Redis running?",
        });
    }
}
