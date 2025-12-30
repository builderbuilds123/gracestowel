/**
 * Stripe Event Worker
 * 
 * Processes Stripe webhook events from the BullMQ queue.
 * 
 * Features:
 * - Story 6.1: Robust event processing with retries
 * - Automatic lock release on permanent failure
 * - Graceful shutdown handling
 */

import { Worker, Job } from "bullmq";
import { MedusaContainer } from "@medusajs/framework/types";
import Stripe from "stripe";
import { StripeEventJobData } from "../types/queue-types";
import { 
    STRIPE_EVENT_QUEUE,
    getRedisConnection,
    markEventProcessed,
    releaseProcessingLock,
} from "../lib/stripe-event-queue";

// Avoid accumulating process signal listeners during Jest runs.
const IS_JEST = process.env.JEST_WORKER_ID !== undefined;

let worker: Worker<StripeEventJobData> | null = null;
let shutdownHandler: (() => Promise<void>) | null = null;
let containerRef: MedusaContainer | null = null;
let eventHandler: ((event: Stripe.Event, container: MedusaContainer) => Promise<void>) | null = null;

/**
 * Set the event handler function
 */
export function setEventHandler(
    handler: (event: Stripe.Event, container: MedusaContainer) => Promise<void>
): void {
    eventHandler = handler;
}

/**
 * Process a Stripe event job
 * Exported for unit testing
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
        };
        process.on("SIGTERM", shutdownHandler);
        process.on("SIGINT", shutdownHandler);
    }

    return worker;
}

/**
 * Shuts down the Stripe event worker.
 * Essential for testing to prevent open handles.
 */
export async function shutdownStripeEventWorker(): Promise<void> {
    if (worker) {
        await worker.close();
        worker = null;
    }
}

/**
 * Reset worker state (for testing)
 */
export function resetStripeEventWorker(): void {
    // Remove shutdown handlers to prevent listener leak in tests
    if (shutdownHandler) {
        process.removeListener("SIGTERM", shutdownHandler);
        process.removeListener("SIGINT", shutdownHandler);
        shutdownHandler = null;
    }
    worker = null;
    containerRef = null;
    eventHandler = null;
}

/**
 * Set container reference (for testing)
 */
export function setContainerRef(container: MedusaContainer | null): void {
    containerRef = container;
}
