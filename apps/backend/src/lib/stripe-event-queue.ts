
import { Queue, Worker, Job } from "bullmq";
import { MedusaContainer } from "@medusajs/framework/types";
import Stripe from "stripe";
import Redis from "ioredis";

/**
 * Stripe Event Queue - Story 6.1
 * 
 * Provides robust, idempotent processing of Stripe webhook events with:
 * - Exponential backoff retry (5 attempts)
 * - Distributed Idempotency using Redis (SETNX)
 * - DLQ for failed events
 */

export interface StripeEventJobData {
    eventId: string;
    eventType: string;
    eventData: Stripe.Event;
    receivedAt: number;
}

const IS_JEST = process.env.JEST_WORKER_ID !== undefined;

const PROCESSED_EVENT_TTL_SECONDS = 24 * 60 * 60; // 24 hours
const PROCESSING_LOCK_TTL_SECONDS = 10 * 60; // 10 minutes for processing lock (shorter than retry window)
const IDEMPOTENCY_PREFIX = "stripe:processed:";

/**
 * Get Redis connection options from environment
 */
const getRedisConnection = () => {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
        throw new Error("REDIS_URL is not configured");
    }
    
    const url = new URL(redisUrl);
    return {
        host: url.hostname,
        port: parseInt(url.port || "6379"),
        password: url.password || undefined,
        username: url.username || undefined,
        tls: url.protocol === "rediss:" ? {} : undefined,
    };
};

// Singleton Redis client for idempotency checks
let redisClient: Redis | null = null;

function getRedisClient(): Redis {
    if (!redisClient) {
        const config = getRedisConnection();
        // ioredis constructor expects options
        redisClient = new Redis({
            host: config.host,
            port: config.port,
            password: config.password,
            username: config.username,
            tls: config.tls,
        });
    }
    return redisClient;
}

export const STRIPE_EVENT_QUEUE = "stripe-events";

let queue: Queue<StripeEventJobData> | null = null;
let worker: Worker<StripeEventJobData> | null = null;
let containerRef: MedusaContainer | null = null;
let eventHandler: ((event: Stripe.Event, container: MedusaContainer) => Promise<void>) | null = null;

// Track shutdown handlers to prevent listener leaks
let shutdownHandler: (() => Promise<void>) | null = null;

/**
 * Check if an event has already been processed (idempotency)
 * Story 6.1 AC8: Ensure Idempotency deduplication using event.id
 * Uses Redis SETNX to atomically set if not exists
 * 
 * @param eventId - Stripe event ID
 * @returns true if event was already processed (or concurrently locked)
 */
export async function isEventProcessed(eventId: string): Promise<boolean> {
    const key = `${IDEMPOTENCY_PREFIX}${eventId}`;

    try {
        const redis = getRedisClient();
        // Only treat an event as processed if we explicitly marked it as processed.
        // This avoids suppressing retries when a short-lived "processing" lock exists.
        const value = await redis.get(key);
        return value === "processed";
    } catch (error) {
        console.error(`[StripeEventQueue] Redis idempotency check failed for ${eventId}:`, error);
        // Fail-open: assume not processed to ensure at-least-once delivery
        return false;
    }
}

/**
 * Atomic acquire lock mechanism for processing
 * Returns true if lock acquired (new event), false if already locked/processed
 * 
 * Uses a shorter TTL for the processing lock so that if processing fails permanently,
 * the lock expires and allows Stripe to retry the event delivery.
 */
export async function acquireProcessingLock(eventId: string): Promise<boolean> {
    const redis = getRedisClient();
    const key = `${IDEMPOTENCY_PREFIX}${eventId}`;
    
    try {
        // Check if already marked as "processed" (permanent state)
        const currentValue = await redis.get(key);
        if (currentValue === "processed") {
            return false; // Already successfully processed
        }
        
        // SETNX key "processing" EX ttl (short TTL for lock)
        // If key exists with "processing" value, it will fail (NX)
        // This prevents concurrent processing but allows retry after lock expires
        const result = await redis.set(key, "processing", "EX", PROCESSING_LOCK_TTL_SECONDS, "NX");
        return result === "OK";
    } catch (error) {
        console.error(`[StripeEventQueue] Failed to acquire lock for ${eventId}:`, error);
        // Fail-open: allow processing to ensure at-least-once delivery
        return true;
    }
}

/**
 * Release processing lock on permanent failure
 * Called when job exhausts all retries to allow Stripe to re-deliver
 */
export async function releaseProcessingLock(eventId: string): Promise<void> {
    const redis = getRedisClient();
    const key = `${IDEMPOTENCY_PREFIX}${eventId}`;
    
    try {
        // Only delete if still in "processing" state (not "processed")
        const currentValue = await redis.get(key);
        if (currentValue === "processing") {
            await redis.del(key);
            console.log(`[StripeEventQueue] Released lock for failed event ${eventId}`);
        }
    } catch (error) {
        console.error(`[StripeEventQueue] Failed to release lock for ${eventId}:`, error);
    }
}

/**
 * Mark an event as successfully processed (update status)
 * @param eventId - Stripe event ID
 */
export async function markEventProcessed(eventId: string): Promise<void> {
    const redis = getRedisClient();
    const key = `${IDEMPOTENCY_PREFIX}${eventId}`;
    try {
        // Update value to "processed" (extends TTL)
        await redis.set(key, "processed", "EX", PROCESSED_EVENT_TTL_SECONDS);
    } catch (error) {
        console.error(`[StripeEventQueue] Failed to mark event ${eventId} as processed:`, error);
        // Graceful degradation: log error but don't crash
    }
}

/**
 * Get or create the Stripe event queue
 */
export function getStripeEventQueue(): Queue<StripeEventJobData> {
    if (!queue) {
        const connection = getRedisConnection();
        queue = new Queue<StripeEventJobData>(STRIPE_EVENT_QUEUE, {
            connection,
            defaultJobOptions: {
                attempts: 5,
                backoff: {
                    type: "exponential",
                    delay: 1000,
                },
                removeOnComplete: {
                    count: 1000,
                    age: 24 * 60 * 60, 
                },
                removeOnFail: {
                    count: 5000,
                    age: 7 * 24 * 60 * 60,
                },
            },
        });
    }
    return queue;
}

/**
 * Queue a Stripe event for processing
 * @param event - Stripe event object
 * @returns Job if queued, null if already processed
 */
export async function queueStripeEvent(
    event: Stripe.Event
): Promise<Job<StripeEventJobData> | null> {
    
    // Try to acquire lock - if fail, it's duplicate
    const locked = await acquireProcessingLock(event.id);
    if (!locked) {
        console.log(`[StripeEventQueue] Skipping duplicate event ${event.id}`);
        return null;
    }

    const queue = getStripeEventQueue();
    
    const jobData: StripeEventJobData = {
        eventId: event.id,
        eventType: event.type,
        eventData: event,
        receivedAt: Date.now(),
    };

    try {
        const job = await queue.add(
            `event-${event.id}`,
            jobData,
            {
                jobId: event.id, // BullMQ deduplication based on Job ID
            }
        );

        console.log(`[StripeEventQueue] Queued event ${event.id} (${event.type})`);
        return job;
    } catch (error) {
        // If enqueue fails, release the short-lived processing lock so Stripe can retry
        // without being suppressed by a stale lock.
        await releaseProcessingLock(event.id);
        throw error;
    }
}


/**
 * Process a Stripe event job
 */
export async function processStripeEvent(job: Job<StripeEventJobData>): Promise<void> {
    const { eventId, eventType, eventData } = job.data;
    
    console.log(`[StripeEventQueue] Processing event ${eventId} (${eventType})`);
    
    if (!containerRef || !eventHandler) {
        throw new Error("Stripe event worker not properly initialized");
    }

    try {
        await eventHandler(eventData, containerRef);
        
        // Mark as finalized "processed"
        await markEventProcessed(eventId);
        console.log(`[StripeEventQueue] Successfully processed event ${eventId}`);
    } catch (error) {
        console.error(`[StripeEventQueue] Error processing event ${eventId}:`, error);
        throw error; // Trigger retry
    }
}

/**
 * Set the event handler function
 */
export function setEventHandler(
    handler: (event: Stripe.Event, container: MedusaContainer) => Promise<void>
): void {
    eventHandler = handler;
}

/**
 * Start the Stripe event worker
 */
export function startStripeEventWorker(
    container: MedusaContainer,
    handler: (event: Stripe.Event, container: MedusaContainer) => Promise<void>
): Worker<StripeEventJobData> {
    if (worker) {
        return worker;
    }

    containerRef = container;
    eventHandler = handler;

    const connection = getRedisConnection();
    
    worker = new Worker<StripeEventJobData>(
        STRIPE_EVENT_QUEUE,
        processStripeEvent,
        {
            connection,
            concurrency: 5,
        }
    );

    worker.on("completed", (job) => {
        console.log(`[StripeEventQueue] Job ${job.id} completed`);
    });

    worker.on("failed", async (job, err) => {
        const attemptsMade = job?.attemptsMade || 0;
        const maxAttempts = job?.opts?.attempts || 5;
        
        if (attemptsMade >= maxAttempts) {
            // CRITICAL: Job exhausted all retries
            console.error(
                `[CRITICAL][DLQ] Stripe event processing PERMANENTLY FAILED for event ${job?.data?.eventId}. ` +
                `Type: ${job?.data?.eventType}.`,
                err
            );
            console.log(`[METRIC] webhook_processing_failure_rate event=${job?.data?.eventId}`);
            
            // Release the processing lock so Stripe can re-deliver the event
            // This ensures AC5/6 compliance - failed events can be retried
            if (job?.data?.eventId) {
                await releaseProcessingLock(job.data.eventId);
            }
        } else {
            console.warn(
                `[StripeEventQueue] Job ${job?.id} failed (attempt ${attemptsMade}/${maxAttempts}), will retry`,
                err
            );
        }
    });

    console.log("[StripeEventQueue] Worker started");

    // Only register shutdown handlers once (prevent listener leak)
    // Skip in Jest to avoid process listener accumulation across test suites.
    if (!shutdownHandler && !IS_JEST) {
        shutdownHandler = async () => {
            console.log("[StripeEventQueue] Shutting down worker...");
            await worker?.close();
            await redisClient?.quit();
        };
        process.on("SIGTERM", shutdownHandler);
        process.on("SIGINT", shutdownHandler);
    }

    return worker;
}

/**
 * Reset module state (for testing)
 */
export function resetStripeEventQueue(): void {
    // Remove shutdown handlers to prevent listener leak in tests
    if (shutdownHandler) {
        process.removeListener("SIGTERM", shutdownHandler);
        process.removeListener("SIGINT", shutdownHandler);
        shutdownHandler = null;
    }
    queue = null;
    worker = null;
    containerRef = null;
    eventHandler = null;
}
/**
 * Close Redis client (for graceful shutdown)
 */
export async function closeStripeEventQueue(): Promise<void> {
    if (redisClient) {
        await redisClient.quit();
        redisClient = null;
    }
    if (worker) {
        await worker.close();
        worker = null;
    }
    if (queue) {
        await queue.close();
        queue = null;
    }
}
