import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { getStripeEventQueue } from "../../../../lib/stripe-event-queue";
import { getRedisConnection } from "../../../../lib/redis";
import Redis from "ioredis";

/**
 * Debug endpoint to check Stripe webhook flow status
 * GET /store/debug/stripe-flow?payment_intent_id=pi_xxx
 * 
 * This helps diagnose where in the flow a payment got stuck:
 * 1. Was the webhook received?
 * 2. Was it queued in BullMQ?
 * 3. Was it processed by the worker?
 * 4. Was an order created?
 * 
 * NOTE: Remove or protect this endpoint in production!
 */
export async function GET(
    req: MedusaRequest,
    res: MedusaResponse
): Promise<void> {
    const paymentIntentId = req.query.payment_intent_id as string;

    if (!paymentIntentId) {
        res.status(400).json({
            error: "Missing payment_intent_id query parameter",
            usage: "GET /store/debug/stripe-flow?payment_intent_id=pi_xxx",
        });
        return;
    }

    const diagnostics: Record<string, any> = {
        paymentIntentId,
        timestamp: new Date().toISOString(),
        checks: {},
    };

    // Check 1: Redis idempotency key status
    try {
        const redisUrl = process.env.REDIS_URL;
        if (redisUrl) {
            const redis = new Redis(getRedisConnection());

            const idempotencyKey = `stripe:processed:${paymentIntentId}`;
            const value = await redis.get(idempotencyKey);
            
            diagnostics.checks.redisIdempotency = {
                key: idempotencyKey,
                value: value,
                status: value === "processed" ? "✅ Marked as processed" :
                        value === "processing" ? "⏳ Currently processing" :
                        "❌ Not found (not received or lock expired)",
            };

            await redis.quit();
        } else {
            diagnostics.checks.redisIdempotency = {
                status: "⚠️ REDIS_URL not configured",
            };
        }
    } catch (error) {
        diagnostics.checks.redisIdempotency = {
            status: "❌ Redis check failed",
            error: (error as Error).message,
        };
    }

    // Check 2: BullMQ job status
    try {
        const queue = getStripeEventQueue();
        const job = await queue.getJob(paymentIntentId);

        if (job) {
            const state = await job.getState();
            diagnostics.checks.bullmqJob = {
                jobId: job.id,
                state,
                eventType: job.data.eventType,
                receivedAt: new Date(job.data.receivedAt).toISOString(),
                attempts: job.attemptsMade,
                maxAttempts: job.opts.attempts,
                failedReason: job.failedReason || null,
                status: state === "completed" ? "✅ Job completed" :
                        state === "failed" ? "❌ Job failed" :
                        state === "active" ? "⏳ Job processing" :
                        state === "waiting" ? "⏳ Job waiting" :
                        state === "delayed" ? "⏳ Job delayed (retry)" :
                        `⚠️ Unknown state: ${state}`,
            };
        } else {
            diagnostics.checks.bullmqJob = {
                status: "❌ Job not found in queue",
                hint: "Either webhook wasn't received, or job was cleaned up after completion",
            };
        }
    } catch (error) {
        diagnostics.checks.bullmqJob = {
            status: "❌ Queue check failed",
            error: (error as Error).message,
        };
    }

    // Check 3: Order existence
    try {
        const query = req.scope.resolve("query");
        const { data: orders } = await query.graph({
            entity: "order",
            fields: ["id", "metadata", "created_at", "email", "status"],
            pagination: { take: 100, skip: 0 },
        });

        const matchingOrder = orders.find((order: any) =>
            order.metadata?.stripe_payment_intent_id === paymentIntentId
        );

        if (matchingOrder) {
            diagnostics.checks.orderCreated = {
                status: "✅ Order exists",
                orderId: matchingOrder.id,
                email: matchingOrder.email,
                orderStatus: matchingOrder.status,
                createdAt: matchingOrder.created_at,
            };
        } else {
            diagnostics.checks.orderCreated = {
                status: "❌ No order found for this PaymentIntent",
                ordersChecked: orders.length,
            };
        }
    } catch (error) {
        diagnostics.checks.orderCreated = {
            status: "❌ Order check failed",
            error: (error as Error).message,
        };
    }

    // Summary
    const allPassed = 
        diagnostics.checks.redisIdempotency?.value === "processed" &&
        diagnostics.checks.bullmqJob?.state === "completed" &&
        diagnostics.checks.orderCreated?.orderId;

    diagnostics.summary = allPassed 
        ? "✅ Flow completed successfully"
        : "❌ Flow incomplete - check individual steps above";

    res.json(diagnostics);
}
