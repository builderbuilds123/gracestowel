/**
 * Payment Capture Queue
 * 
 * Queue operations for scheduling and managing payment capture jobs.
 * Worker logic is in workers/payment-capture-worker.ts
 */

import { Queue, Job } from "bullmq";
import { PaymentCaptureJobData, JobActiveError } from "../types/queue-types";
import { logger } from "../utils/logger";

// Re-export types for backwards compatibility
export { PaymentCaptureJobData, JobActiveError } from "../types/queue-types";

// Queue name for payment capture
export const PAYMENT_CAPTURE_QUEUE = "payment-capture";

/**
 * Calculate the payment capture delay based on buffer configuration.
 * Exported for unit testing without module resets.
 *
 * @param bufferSeconds - Buffer time before grace period ends
 * @param graceHours - Total grace period in hours (default: 1)
 * @returns Delay in milliseconds
 */
export function calculateCaptureDelayMs(bufferSeconds: number, graceHours: number = 1): number {
    return (graceHours * 60 * 60 - bufferSeconds) * 1000;
}

// Story 6.3: Capture buffer - start capture 30s before grace period ends (59:30)
// This prevents race conditions where edits arrive just as capture starts
export const CAPTURE_BUFFER_SECONDS = parseInt(
    process.env.CAPTURE_BUFFER_SECONDS || "30",
    10
);

// Story 1.1: Payment capture delay - configurable via env, defaults to 3 days (259200000ms)
// Using 3 days as conservative window to accommodate shorter card network periods (e.g., Visa's 5-day window)
export const DEFAULT_CAPTURE_DELAY_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

const envDelay = process.env.PAYMENT_CAPTURE_DELAY_MS;

// DEBUG: Log environment variable state at module load time
logger.debug("capture-queue", "Module loading", {
    timestamp: new Date().toISOString(),
    envDelay: envDelay,
    envDelayType: typeof envDelay,
    nodeEnv: process.env.NODE_ENV,
    bufferSeconds: CAPTURE_BUFFER_SECONDS
});

let parsedDelay = DEFAULT_CAPTURE_DELAY_MS;

if (!envDelay) {
    logger.info("capture-queue", "PAYMENT_CAPTURE_DELAY_MS not set, using default", {
        delayMs: DEFAULT_CAPTURE_DELAY_MS,
        delayDays: DEFAULT_CAPTURE_DELAY_MS / (1000 * 60 * 60 * 24)
    });
} else {
    const parsed = parseInt(envDelay, 10);
    if (isNaN(parsed)) {
        logger.error("capture-queue", "PAYMENT_CAPTURE_DELAY_MS environment variable is invalid - using default", {
            invalidValue: envDelay,
            defaultMs: DEFAULT_CAPTURE_DELAY_MS
        });
    } else {
        parsedDelay = parsed;
    }
}

export const PAYMENT_CAPTURE_DELAY_MS = parsedDelay;

// Log at module load for debugging
const delayDays = PAYMENT_CAPTURE_DELAY_MS / (1000 * 60 * 60 * 24);
logger.info("capture-queue", "Capture delay configured", {
    delayMs: PAYMENT_CAPTURE_DELAY_MS,
    delayDays
});

// DEBUG: Log final computed value (inline calculation to avoid forward reference)
const _debugDelaySeconds = Math.floor(PAYMENT_CAPTURE_DELAY_MS / 1000);
const _debugDelayMinutes = Math.floor(_debugDelaySeconds / 60);
const _debugDelayRemainingSeconds = _debugDelaySeconds % 60;
const _debugDelayHours = Math.floor(_debugDelayMinutes / 60);
const _debugDelayDays = Math.floor(_debugDelayHours / 24);

logger.debug("capture-queue", "Final delay configuration details", {
    days: _debugDelayDays,
    hours: _debugDelayHours % 24,
    minutes: _debugDelayMinutes % 60,
    seconds: _debugDelayRemainingSeconds,
    totalMs: PAYMENT_CAPTURE_DELAY_MS
});

/**
 * Get the modification window duration in seconds
 * Derived from PAYMENT_CAPTURE_DELAY_MS
 */
export function getModificationWindowSeconds(): number {
    return Math.floor(PAYMENT_CAPTURE_DELAY_MS / 1000);
}

/**
 * Format the modification window duration for user-facing messages
 * Returns human-readable string like "1 hour", "30 minutes", "10 seconds"
 */
export function formatModificationWindow(): string {
    const totalSeconds = getModificationWindowSeconds();

    if (totalSeconds >= 3600) {
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        if (minutes > 0) {
            return hours === 1 ? `1 hour ${minutes} minutes` : `${hours} hours ${minutes} minutes`;
        }
        return hours === 1 ? "1 hour" : `${hours} hours`;
    }

    if (totalSeconds >= 60) {
        const minutes = Math.floor(totalSeconds / 60);
        return minutes === 1 ? "1 minute" : `${minutes} minutes`;
    }

    return totalSeconds === 1 ? "1 second" : `${totalSeconds} seconds`;
}

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
/**
 * Custom error for when Redis is not configured
 * Used for type-safe error checking instead of string matching
 */
export class RedisNotConfiguredError extends Error {
    constructor(message: string = "REDIS_URL is not configured") {
        super(message);
        this.name = "RedisNotConfiguredError";
    }
}

export function getRedisConnection() {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
        throw new RedisNotConfiguredError("REDIS_URL is not configured");
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

    logger.info("capture-queue", "Scheduling payment capture", { orderId, paymentIntentId });

    // DEBUG: Log delay configuration
    logger.debug("capture-queue", "Scheduling capture job", {
        orderId,
        paymentCaptureDelayMs: PAYMENT_CAPTURE_DELAY_MS,
        delayOverride: delayOverride !== undefined ? delayOverride : undefined,
    });

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

    // DEBUG: Log final delay being used
    logger.debug("capture-queue", "Final delay configuration", {
        finalDelay,
        delaySeconds,
        delayMinutes,
        currentTime: new Date().toISOString(),
        expectedCaptureTime: captureTime,
    });

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
    } catch (err: unknown) {
        const error = err instanceof Error ? err : new Error(String(err));
        const message = error.message || "";
        const isDuplicate = error.name === "JobIdAlreadyExistsError" || message.includes("already exists");
        if (isDuplicate) {
            const existing = await queue.getJob(`capture-${orderId}`);
            if (existing) {
                job = existing as Job<PaymentCaptureJobData>;
            } else {
                throw error;
            }
        } else {
            throw error;
        }
    }

    if (!job) {
        throw new Error(`Failed to schedule payment capture job for order ${orderId}`);
    }

    logger.info("capture-queue", "Payment capture scheduled successfully", {
        orderId,
        paymentIntentId,
        jobId: job.id,
        delayMinutes,
        delaySeconds,
        scheduledCaptureTime: captureTime,
    });

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
            logger.warn("capture-queue", "Cannot cancel capture job - job is active/processing", {
                orderId,
                jobState: state,
            });
            throw new JobActiveError(orderId);
        }

        await job.remove();
        logger.info("capture-queue", "Canceled payment capture job", {
            orderId,
            jobState: state,
        });
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
    const state = await job.getState();
    // BullMQ returns specific state types, but we need to handle all possible values
    const validStates = ["waiting", "active", "delayed", "failed", "completed", "unknown"] as const;
    if (validStates.includes(state as typeof validStates[number])) {
        return state as typeof validStates[number];
    }
    return "unknown";
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
