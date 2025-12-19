/**
 * Payment Capture Queue
 * 
 * Queue operations for scheduling and managing payment capture jobs.
 * Worker logic is in workers/payment-capture-worker.ts
 */

import { Queue, Job } from "bullmq";
import { PaymentCaptureJobData, JobActiveError } from "../types/queue-types";

// Re-export types for backwards compatibility
export { PaymentCaptureJobData, JobActiveError } from "../types/queue-types";

// Queue name for payment capture
export const PAYMENT_CAPTURE_QUEUE = "payment-capture";

// Story 6.3: Capture buffer - start capture 30s before grace period ends (59:30)
// This prevents race conditions where edits arrive just as capture starts
export const CAPTURE_BUFFER_SECONDS = parseInt(
    process.env.CAPTURE_BUFFER_SECONDS || "30",
    10
);

// Delay for payment capture - configurable via env, defaults to 59:30 (3570000ms)
// Story 6.3: Uses 30s buffer before full hour to prevent edit/capture race
export const PAYMENT_CAPTURE_DELAY_MS = parseInt(
    process.env.PAYMENT_CAPTURE_DELAY_MS || String((60 * 60 - CAPTURE_BUFFER_SECONDS) * 1000),
    10
);

// Worker concurrency - configurable via env, defaults to 5
export const PAYMENT_CAPTURE_WORKER_CONCURRENCY = parseInt(
    process.env.PAYMENT_CAPTURE_WORKER_CONCURRENCY || "5",
    10
);

let queue: Queue<PaymentCaptureJobData> | null = null;

/**
 * Get Redis connection options from environment
 * Exported for use by worker
 */
export function getRedisConnection() {
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
}

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
 * @param delayOverride - Optional delay override in ms (Story 6.3)
 */
export async function schedulePaymentCapture(
    orderId: string,
    paymentIntentId: string,
    delayOverride?: number
): Promise<Job<PaymentCaptureJobData>> {
    if (!orderId || typeof orderId !== "string" || !orderId.startsWith("order_")) {
        throw new Error(`Invalid orderId for scheduling payment capture: ${orderId}`);
    }

    if (!paymentIntentId || typeof paymentIntentId !== "string" || !paymentIntentId.startsWith("pi_")) {
        throw new Error(`Invalid paymentIntentId for scheduling payment capture: ${paymentIntentId}`);
    }

    console.log(`[CAPTURE_QUEUE] 📋 Scheduling payment capture for order ${orderId}, PI: ${paymentIntentId}`);

    const queue = getPaymentCaptureQueue();

    const jobData: PaymentCaptureJobData = {
        orderId,
        paymentIntentId,
        scheduledAt: Date.now(),
    };

    const finalDelay = delayOverride !== undefined ? delayOverride : PAYMENT_CAPTURE_DELAY_MS;
    const delaySeconds = Math.round(finalDelay / 1000);
    const delayMinutes = Math.round(delaySeconds / 60);
    const captureTime = new Date(Date.now() + finalDelay).toISOString();

    let job: Job<PaymentCaptureJobData> | null = null;
    try {
        job = await queue.add(
            `capture-${orderId}`,
            jobData,
            {
                delay: finalDelay,
                jobId: `capture-${orderId}`, // Unique job ID to prevent duplicates
            }
        );
    } catch (err: any) {
        const message = err?.message || "";
        const isDuplicate = err?.name === "JobIdAlreadyExistsError" || message.includes("already exists");
        if (isDuplicate) {
            const existing = await queue.getJob(`capture-${orderId}`);
            if (existing) {
                job = existing as any;
            } else {
                throw err;
            }
        } else {
            throw err;
        }
    }

    if (!job) {
        throw new Error(`Failed to schedule payment capture job for order ${orderId}`);
    }

    console.log(`[CAPTURE_QUEUE] ✅ Payment capture scheduled successfully!`);
    console.log(`[CAPTURE_QUEUE]   Order: ${orderId}`);
    console.log(`[CAPTURE_QUEUE]   Payment Intent: ${paymentIntentId}`);
    console.log(`[CAPTURE_QUEUE]   Job ID: ${job.id}`);
    console.log(`[CAPTURE_QUEUE]   Delay: ${delayMinutes} minutes (${delaySeconds} seconds)`);
    console.log(`[CAPTURE_QUEUE]   Scheduled capture time: ${captureTime}`);

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
        const state = await job.getState();
        
        // Story 3.4 AC4: Race Condition Handling
        // If job is already active (being processed), we cannot safely remove it.
        // The worker is running concurrently. We must abort cancellation.
        if (state === "active") {
            console.warn(`[CancelOrder] Cannot cancel capture job for ${orderId}: Job is active/processing`);
            throw new JobActiveError(orderId);
        }

        await job.remove();
        console.log(`Canceled payment capture job for order ${orderId} (state: ${state})`);
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
 * Shuts down the payment capture queue.
 * Essential for testing to prevent open handles.
 */
export async function shutdownPaymentCaptureQueue() {
    if (queue) {
        await queue.close();
        queue = null;
    }
}
