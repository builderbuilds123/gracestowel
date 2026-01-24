/**
 * Stripe Event Queue - Story 6.1
 * 
 * Queue operations for Stripe webhook event processing.
 * Worker logic is in workers/stripe-event-worker.ts
 * 
 * Provides robust, idempotent processing with:
 * - Distributed Idempotency using Redis (SETNX)
 * - Lock management for concurrent processing
 */

import { Queue, Job } from "bullmq";
import Stripe from "stripe";
import Redis from "ioredis";
import { StripeEventJobData } from "../types/queue-types";
import { logger } from "../utils/logger";

// Re-export type for backwards compatibility
export { StripeEventJobData } from "../types/queue-types";

export const STRIPE_EVENT_QUEUE = "stripe-events";

const PROCESSED_EVENT_TTL_SECONDS = 24 * 60 * 60; // 24 hours
const PROCESSING_LOCK_TTL_SECONDS = 10 * 60; // 10 minutes for processing lock
const IDEMPOTENCY_PREFIX = "stripe:processed:";

let queue: Queue<StripeEventJobData> | null = null;
let redisClient: Redis | null = null;

/**
 * Get Redis connection options from environment
 * Exported for use by worker
 */
export function getRedisConnection() {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
        throw new Error("REDIS_URL is not configured");
    }
    
    try {
        const url = new URL(redisUrl);
        return {
            host: url.hostname,
            port: parseInt(url.port || "6379"),
            password: url.password || undefined,
            username: url.username || undefined,
            tls: url.protocol === "rediss:" ? {} : undefined,
        };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error("stripe-event-queue", "Invalid REDIS_URL format", {
            error: errorMessage,
        });
        throw new Error(`Invalid REDIS_URL format: ${errorMessage}`);
    }
}

function getRedisClient(): Redis {
    if (!redisClient) {
        const config = getRedisConnection();
        redisClient = new Redis({
            host: config.host,
            port: config.port,
            password: config.password,
            username: config.username,
            tls: config.tls,
            retryStrategy: (times: number) => {
                // Exponential backoff: 50ms, 100ms, 200ms, 400ms, 800ms, max 3s
                const delay = Math.min(times * 50, 3000);
                if (times > 10) {
                    logger.error("stripe-event-queue", "Redis connection retry limit exceeded", {
                        retryAttempts: times,
                    });
                    return null; // Stop retrying after 10 attempts
                }
                return delay;
            },
            maxRetriesPerRequest: 3,
            enableReadyCheck: true,
            lazyConnect: false,
        });

        // Handle connection errors
        redisClient.on("error", (error: Error) => {
            logger.error("stripe-event-queue", "Redis client error", {}, error);
        });

        redisClient.on("connect", () => {
            logger.info("stripe-event-queue", "Redis client connected");
        });
    }
    return redisClient;
}

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
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error("stripe-event-queue", "Redis idempotency check failed", {
            eventId,
            error: errorMessage,
        }, error instanceof Error ? error : new Error(errorMessage));
        // Fail-open: assume not processed to ensure at-least-once delivery
        // This is acceptable for idempotency checks as duplicate processing is handled downstream
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
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error("stripe-event-queue", "Failed to acquire processing lock", {
            eventId,
            error: errorMessage,
        }, error instanceof Error ? error : new Error(errorMessage));
        // Fail-open: allow processing to ensure at-least-once delivery
        // This is acceptable as downstream processing has its own idempotency checks
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
            logger.info("stripe-event-queue", "Released lock for failed event", { eventId });
        }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error("stripe-event-queue", "Failed to release processing lock", {
            eventId,
            error: errorMessage,
        }, error instanceof Error ? error : new Error(errorMessage));
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
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error("stripe-event-queue", "Failed to mark event as processed", {
            eventId,
            error: errorMessage,
        }, error instanceof Error ? error : new Error(errorMessage));
        // Graceful degradation: log error but don't crash
        // Event may be reprocessed, but downstream has idempotency checks
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
        logger.info("stripe-event-queue", "Skipping duplicate event", {
            eventId: event.id,
            eventType: event.type,
        });
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

        logger.info("stripe-event-queue", "Queued event for processing", {
            eventId: event.id,
            eventType: event.type,
            jobId: job.id,
        });
        return job;
    } catch (error) {
        // If enqueue fails, release the short-lived processing lock so Stripe can retry
        // without being suppressed by a stale lock.
        await releaseProcessingLock(event.id);
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error("stripe-event-queue", "Failed to queue event", {
            eventId: event.id,
            eventType: event.type,
            error: errorMessage,
        }, error instanceof Error ? error : new Error(errorMessage));
        throw error;
    }
}

/**
 * Reset queue state (for testing)
 */
export function resetStripeEventQueue(): void {
    queue = null;
}

/**
 * Close Redis client and queue (for graceful shutdown)
 */
export async function closeStripeEventQueue(): Promise<void> {
    if (redisClient) {
        await redisClient.quit();
        redisClient = null;
    }
    if (queue) {
        await queue.close();
        queue = null;
    }
}
