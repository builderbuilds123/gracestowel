import { Queue, Worker, Job } from "bullmq";
import { getStripeClient } from "../utils/stripe";

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
 * Process a payment capture job
 */
async function processPaymentCapture(job: Job<PaymentCaptureJobData>): Promise<void> {
    const { orderId, paymentIntentId } = job.data;
    
    console.log(`Processing payment capture for order ${orderId}`);
    
    const stripe = getStripeClient();
    
    try {
        // Get the current state of the payment intent
        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
        
        if (paymentIntent.status === "requires_capture") {
            // Capture the payment
            const captured = await stripe.paymentIntents.capture(paymentIntentId);
            console.log(`Payment captured for order ${orderId}: ${captured.status}`);
        } else if (paymentIntent.status === "canceled") {
            // Order was canceled, nothing to do
            console.log(`Payment for order ${orderId} was already canceled`);
        } else if (paymentIntent.status === "succeeded") {
            // Already captured
            console.log(`Payment for order ${orderId} was already captured`);
        } else {
            console.log(`Payment for order ${orderId} in unexpected state: ${paymentIntent.status}`);
        }
    } catch (error) {
        console.error(`Error capturing payment for order ${orderId}:`, error);
        throw error; // Re-throw to trigger retry
    }
}

/**
 * Start the payment capture worker
 */
export function startPaymentCaptureWorker(): Worker<PaymentCaptureJobData> {
    if (worker) {
        return worker;
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
        console.log(`Payment capture job ${job.id} completed`);
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
                `Payment capture job ${job?.id} failed (attempt ${attemptsMade}/${maxAttempts}):`,
                err
            );
        }
    });

    console.log("Payment capture worker started");

    // Graceful shutdown
    const shutdown = async () => {
        console.log("Shutting down payment capture worker...");
        await worker?.close();
    };
    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);

    return worker;
}

