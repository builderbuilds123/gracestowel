import { Queue, Worker, Job } from "bullmq";
import { getStripeClient } from "../utils/stripe";
import { MedusaContainer } from "@medusajs/framework/types";
import Stripe from "stripe";

/**
 * Payment capture job data
 */
export interface PaymentCaptureJobData {
    orderId: string;
    paymentIntentId: string;
    scheduledAt: number;
}

/**
 * Get Redis connection options from environment
 */
const getRedisConnection = () => {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
        throw new Error("REDIS_URL is not configured");
    }
    
    // Parse Redis URL for connection options
    const url = new URL(redisUrl);
    return {
        host: url.hostname,
        port: parseInt(url.port || "6379"),
        password: url.password || undefined,
        username: url.username || undefined,
        tls: url.protocol === "rediss:" ? {} : undefined,
    };
};

// Stripe client imported from ../utils/stripe

// Queue name for payment capture
export const PAYMENT_CAPTURE_QUEUE = "payment-capture";

// Delay for payment capture - configurable via env, defaults to 1 hour (3600000ms)
export const PAYMENT_CAPTURE_DELAY_MS = parseInt(
    process.env.PAYMENT_CAPTURE_DELAY_MS || String(60 * 60 * 1000),
    10
);

// Worker concurrency - configurable via env, defaults to 5
export const PAYMENT_CAPTURE_WORKER_CONCURRENCY = parseInt(
    process.env.PAYMENT_CAPTURE_WORKER_CONCURRENCY || "5",
    10
);

let queue: Queue<PaymentCaptureJobData> | null = null;
let worker: Worker<PaymentCaptureJobData> | null = null;

// Store container reference for use in worker
let containerRef: MedusaContainer | null = null;

/**
 * Get or create the payment capture queue
 */
export function getPaymentCaptureQueue(): Queue<PaymentCaptureJobData> {
    if (!queue) {
        const connection = getRedisConnection();
        queue = new Queue<PaymentCaptureJobData>(PAYMENT_CAPTURE_QUEUE, {
            connection,
            defaultJobOptions: {
                attempts: 3,
                backoff: {
                    type: "exponential",
                    delay: 5000,
                },
                removeOnComplete: {
                    count: 1000,
                    age: 24 * 60 * 60, // Keep completed jobs for 24 hours
                },
                removeOnFail: {
                    count: 5000,
                    age: 7 * 24 * 60 * 60, // Keep failed jobs for 7 days
                },
            },
        });
    }
    return queue;
}

/**
 * Schedule a payment capture job for an order
 * @param orderId - The Medusa order ID
 * @param paymentIntentId - The Stripe PaymentIntent ID
 */
export async function schedulePaymentCapture(
    orderId: string,
    paymentIntentId: string
): Promise<Job<PaymentCaptureJobData>> {
    const queue = getPaymentCaptureQueue();
    
    const jobData: PaymentCaptureJobData = {
        orderId,
        paymentIntentId,
        scheduledAt: Date.now(),
    };

    const job = await queue.add(
        `capture-${orderId}`,
        jobData,
        {
            delay: PAYMENT_CAPTURE_DELAY_MS,
            jobId: `capture-${orderId}`, // Unique job ID to prevent duplicates
        }
    );

    console.log(`Scheduled payment capture for order ${orderId} in 1 hour (job ${job.id})`);
    return job;
}

/**
 * Cancel a scheduled payment capture job (e.g., when order is canceled)
 * @param orderId - The Medusa order ID
 */
export async function cancelPaymentCaptureJob(orderId: string): Promise<boolean> {
    const queue = getPaymentCaptureQueue();
    const job = await queue.getJob(`capture-${orderId}`);
    
    if (job) {
        await job.remove();
        console.log(`Canceled payment capture job for order ${orderId}`);
        return true;
    }
    
    return false;
}

/**
 * Get the state of a capture job for an order
 * Used by fallback cron to check if job exists and its status
 * @param orderId - The Medusa order ID
 */
export async function getJobState(orderId: string): Promise<"waiting" | "active" | "delayed" | "failed" | "completed" | "unknown" | "missing"> {
    const queue = getPaymentCaptureQueue();
    const job = await queue.getJob(`capture-${orderId}`);
    if (!job) return "missing";
    return await job.getState() as any;
}

/**
 * Fetch the current order data from Medusa
 * Story 2.3: Ensures we capture the ACTUAL order total, not the original PaymentIntent amount
 * Exported for unit testing
 * 
 * @param orderId - The Medusa order ID
 * @returns Object with total in cents, currency code, and status, or null if order not found
 */
export async function fetchOrderTotal(orderId: string): Promise<{ totalCents: number; currencyCode: string; status: string } | null> {
    if (!containerRef) {
        console.error("[PaymentCapture] Container not initialized - cannot fetch order");
        return null;
    }

    try {
        const query = containerRef.resolve("query");
        const { data: orders } = await query.graph({
            entity: "order",
            fields: ["id", "total", "currency_code", "status"],
            filters: { id: orderId },
        });

        if (orders.length === 0) {
            console.error(`[PaymentCapture] Order ${orderId} not found`);
            return null;
        }

        const order = orders[0];
        
        const total = order.total;
        if (typeof total !== "number") {
            console.error(`[PaymentCapture] Order ${orderId} has invalid total: ${total}`);
            return null;
        }

        // Support both integer (cents) and float (dollars) totals (Story 2.3 AC #2)
        const totalCents = Number.isInteger(total) ? total : Math.round(total * 100);

        // M1: Fail if currency is missing instead of falling back to USD
        if (!order.currency_code) {
            console.error(`[PaymentCapture] Order ${orderId} has no currency code`);
            return null;
        }

        return {
            totalCents: totalCents,
            currencyCode: order.currency_code,
            status: order.status || "unknown",
        };
    } catch (error) {
        console.error(`[PaymentCapture] Error fetching order ${orderId}:`, error);
        return null;
    }
}

/**
 * Update order metadata to track payment capture status in Medusa
 * Uses metadata since payment_status is not in UpdateOrderDTO
 * @param orderId - The Medusa order ID
 * @param capturedAt - Timestamp when payment was captured
 * @param amountCaptured - Amount captured in cents
 */
async function updateOrderAfterCapture(orderId: string, amountCaptured: number): Promise<void> {
    if (!containerRef) {
        console.error("[PaymentCapture] Container not initialized - cannot update order");
        return;
    }

    try {
        const orderService = containerRef.resolve("order");
        await orderService.updateOrders([{
            id: orderId,
            metadata: {
                payment_captured_at: new Date().toISOString(),
                payment_amount_captured: amountCaptured,
            },
        }]);
        console.log(`[PaymentCapture] Order ${orderId}: Updated metadata with capture info`);
    } catch (error) {
        console.error(`[PaymentCapture] Error updating order ${orderId} after capture:`, error);
        // Don't throw - payment was captured, metadata update is secondary
    }
}

/**
 * Process a payment capture job
 * Story 2.3: Enhanced to capture dynamic order total instead of static PaymentIntent amount
 * Exported for unit testing
 */
export async function processPaymentCapture(job: Job<PaymentCaptureJobData>): Promise<void> {
    const { orderId, paymentIntentId, scheduledAt } = job.data;
    
    console.log(`[PaymentCapture] Processing capture for order ${orderId}`);
    
    const stripe = getStripeClient();
    
    try {
        // Step 1: Get the current state of the payment intent
        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
        
        if (paymentIntent.status === "canceled") {
            console.log(`[PaymentCapture] Order ${orderId}: Payment was already canceled`);
            return;
        }
        
        if (paymentIntent.status === "succeeded") {
            console.log(`[PaymentCapture] Order ${orderId}: Payment was already captured`);
            return;
        }
        
        if (paymentIntent.status !== "requires_capture") {
            console.log(`[PaymentCapture] Order ${orderId}: Unexpected status: ${paymentIntent.status}`);
            return;
        }

        // Step 2: Fetch fresh order total from Medusa (Story 2.3)
        const orderData = await fetchOrderTotal(orderId);
        
        if (!orderData) {
            // Do NOT capture if order data is unavailable; fail for manual review to avoid charging canceled/missing orders
            console.error(`[PaymentCapture][CRITICAL] Order ${orderId}: Could not fetch order details. Aborting capture.`);
            throw new Error(`Could not fetch order details for order ${orderId}`);
        }

        // Guard: Skip capture if order is canceled in Medusa
        if (orderData.status === "canceled") {
            console.error(
                `[PaymentCapture][CRITICAL] Order ${orderId} is canceled in Medusa ` +
                `but PI ${paymentIntentId} still requires capture. Skipping capture.`
            );
            console.log(`[METRIC] capture_blocked_canceled_order order=${orderId}`);
            return;
        }

        const { totalCents, currencyCode } = orderData;
        const authorizedAmount = paymentIntent.amount;

        // M2: Validate currency match
        if (currencyCode.toLowerCase() !== paymentIntent.currency.toLowerCase()) {
            console.error(
                `[PaymentCapture][CRITICAL] Order ${orderId}: Currency mismatch! ` +
                `Order: ${currencyCode}, PaymentIntent: ${paymentIntent.currency}. ` +
                `Cannot capture.`
            );
            throw new Error(`Currency mismatch: Order ${currencyCode} vs PaymentIntent ${paymentIntent.currency}`);
        }

        console.log(`[PaymentCapture] Order ${orderId}: Authorized=${authorizedAmount} cents, Order Total=${totalCents} cents`);

        // Step 3: Handle different capture scenarios
        if (totalCents > authorizedAmount) {
            // EXCESS: Order total increased beyond authorized amount
            // This should not happen normally - would require increment_authorization
            console.error(
                `[PaymentCapture][CRITICAL] Order ${orderId}: Total (${totalCents}) exceeds authorized amount (${authorizedAmount}). ` +
                `Manual intervention required!`
            );
            throw new Error(`Amount to capture (${totalCents}) exceeds authorized amount (${authorizedAmount})`);
        }

        // Step 4: Capture the dynamic amount with idempotency
        const captured = await stripe.paymentIntents.capture(
            paymentIntentId,
            {
                amount_to_capture: totalCents,
            },
            {
                idempotencyKey: `capture_${orderId}_${scheduledAt}`,
            }
        );

        if (totalCents < authorizedAmount) {
            // PARTIAL: Order total decreased (items removed during grace period)
            // Stripe automatically releases the uncaptured portion
            const released = authorizedAmount - totalCents;
            console.log(
                `[PaymentCapture] Order ${orderId}: Captured ${totalCents} cents, released ${released} cents (${captured.status})`
            );
        } else {
            console.log(`[PaymentCapture] Order ${orderId}: Captured ${totalCents} cents (${captured.status})`);
        }

        // Step 5: Update Medusa order with capture metadata
        await updateOrderAfterCapture(orderId, totalCents);

    } catch (error: any) {
        // Handle specific Stripe errors using property checks (more robust than instanceof)
        if (error?.type === "invalid_request_error" && error?.code === "amount_too_large") {
            console.error(
                `[PaymentCapture][CRITICAL] Order ${orderId}: Amount too large error. ` +
                `The order total exceeds authorized amount. Manual intervention required!`,
                error
            );
        } else {
            console.error(`[PaymentCapture] Error capturing payment for order ${orderId}:`, error);
        }
        
        throw error; // Re-throw to trigger retry
    }
}

/**
 * Start the payment capture worker
 * @param container - Optional Medusa container for accessing services
 */
export function startPaymentCaptureWorker(container?: MedusaContainer): Worker<PaymentCaptureJobData> {
    if (worker) {
        return worker;
    }

    // Store container reference for use in processPaymentCapture
    if (container) {
        containerRef = container;
    }

    const connection = getRedisConnection();
    
    worker = new Worker<PaymentCaptureJobData>(
        PAYMENT_CAPTURE_QUEUE,
        processPaymentCapture,
        {
            connection,
            concurrency: PAYMENT_CAPTURE_WORKER_CONCURRENCY,
        }
    );

    worker.on("completed", (job) => {
        console.log(`[PaymentCapture] Job ${job.id} completed`);
    });

    worker.on("failed", (job, err) => {
        const attemptsMade = job?.attemptsMade || 0;
        const maxAttempts = job?.opts?.attempts || 3;
        
        if (attemptsMade >= maxAttempts) {
            // CRITICAL: Job has exhausted all retries - revenue at risk
            console.error(
                `[CRITICAL][DLQ] Payment capture PERMANENTLY FAILED for order ${job?.data?.orderId}. ` +
                `PaymentIntent: ${job?.data?.paymentIntentId}. Attempts: ${attemptsMade}/${maxAttempts}. ` +
                `Manual intervention required!`,
                err
            );
            // TODO: Integrate with alerting service (PagerDuty, Slack webhook, etc.)
        } else {
            console.error(
                `[PaymentCapture] Job ${job?.id} failed (attempt ${attemptsMade}/${maxAttempts}):`,
                err
            );
        }
    });

    console.log("[PaymentCapture] Worker started");

    // Graceful shutdown
    const shutdown = async () => {
        console.log("[PaymentCapture] Shutting down worker...");
        await worker?.close();
    };
    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);

    return worker;
}
