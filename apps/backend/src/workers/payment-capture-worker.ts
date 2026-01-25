/**
 * Payment Capture Worker
 * 
 * Processes scheduled payment capture jobs using Stripe.
 * Delegates core logic to payment-capture-core.ts to share with Workflow.
 * 
 * Features:
 * - Story 2.3: Dynamic order total capture
 * - Story 3.2: Metadata updated_total support
 * - Story 6.3: Edit status locking for race condition handling
 */

import { Worker, Job } from "bullmq";
import { MedusaContainer } from "@medusajs/framework/types";
import { PaymentCaptureJobData } from "../types/queue-types";
import {
    PAYMENT_CAPTURE_QUEUE,
    PAYMENT_CAPTURE_WORKER_CONCURRENCY,
    getRedisConnection,
} from "../lib/payment-capture-queue";
import { sendAdminNotification, AdminNotificationType } from "../lib/admin-notifications";
import { logger } from "../utils/logger";
import { executePaymentCapture, setOrderEditStatus } from "../services/payment-capture-core";

// Re-export specific functions for backward compatibility in testing if needed
export { fetchOrderTotal, setOrderEditStatus } from "../services/payment-capture-core";

// Avoid accumulating process signal listeners during Jest runs.
const IS_JEST = process.env.JEST_WORKER_ID !== undefined;

let worker: Worker<PaymentCaptureJobData> | null = null;
let shutdownHandler: (() => Promise<void>) | null = null;
let containerRef: MedusaContainer | null = null;

/**
 * Process a payment capture job
 */
export async function processPaymentCapture(job: Job<PaymentCaptureJobData>): Promise<void> {
    const { orderId, paymentIntentId, scheduledAt, source } = job.data as PaymentCaptureJobData & { source?: string };
    
    if (!containerRef) {
        throw new Error("Container not initialized");
    }

    // DEBUG: Log detailed job information
    const now = Date.now();
    const scheduledDelay = now - scheduledAt;
    
    logger.info("payment-capture-worker", "Processing capture job", { 
        orderId, 
        jobId: job.id,
        source: source || "normal",
        delayMs: scheduledDelay
    });

    if (!orderId || !orderId.startsWith("order_")) {
        logger.critical("payment-capture-worker", "Invalid orderId in job", { jobId: job.id, orderId });
        return;
    }

    try {
        // Story 6.3: Optimistic Locking
        // We attempt to lock ONLY if we are the worker. The workflow handles its own locking/transaction.
        const lockAcquired = await setOrderEditStatus(containerRef, orderId, "locked_for_capture");
        if (!lockAcquired) {
             logger.warn("payment-capture-worker", "Could not acquire lock - skipping execution", { orderId });
             // If we can't lock, it means another process (Workflow or another Worker) is handling it
             return;
        }

        // DELEGATE TO CORE SERVICE
        // Use job ID as idempotency key part to ensure safe retries
        const idempotencyKey = `worker_capture_${orderId}_${job.id}`;
        
        await executePaymentCapture(containerRef, orderId, paymentIntentId, idempotencyKey);
        
        logger.info("payment-capture-worker", "Job completed successfully", { orderId });

        // Release lock
        await setOrderEditStatus(containerRef, orderId, "idle");

    } catch (error) {
        // Handle locking cleanup in case of error
        try {
            if (containerRef) await setOrderEditStatus(containerRef, orderId, "idle");
        } catch (cleanupError) {
            logger.error("payment-capture-worker", "Failed to release lock after error", { orderId }, cleanupError instanceof Error ? cleanupError : new Error(String(cleanupError)));
        }

        logger.error("payment-capture-worker", "Job failed", { orderId }, error instanceof Error ? error : new Error(String(error)));
        throw error;
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
        logger.info("payment-capture-worker", "Job completed", {
            jobId: job.id,
            orderId: job.data?.orderId,
        });
    });

    worker.on("failed", async (job, err) => {
        const attemptsMade = job?.attemptsMade || 0;
        const maxAttempts = job?.opts?.attempts || 3;
        const orderId = job?.data?.orderId;
        const paymentIntentId = job?.data?.paymentIntentId;

        if (attemptsMade >= maxAttempts) {
            // CRITICAL: Job has exhausted all retries - revenue at risk
            logger.critical("payment-capture-worker", "Payment capture permanently failed - manual intervention required", {
                orderId,
                paymentIntentId,
                attemptsMade,
                maxAttempts,
            }, err instanceof Error ? err : new Error(String(err)));

            // Send admin notification
            if (containerRef) {
                try {
                    await sendAdminNotification(containerRef, {
                        type: AdminNotificationType.PAYMENT_FAILED,
                        title: "Payment Capture Failed",
                        description: `Payment capture failed for order ${orderId} after ${attemptsMade} attempts. Manual intervention required.`,
                        metadata: {
                            order_id: orderId,
                            payment_intent_id: paymentIntentId,
                            attempts: attemptsMade,
                            error: err instanceof Error ? err.message : String(err),
                        },
                    });
                } catch (notifError) {
                    logger.error("payment-capture-worker", "Failed to send admin notification", {}, notifError instanceof Error ? notifError : new Error(String(notifError)));
                }
            }
        } else {
            logger.error("payment-capture-worker", "Job failed", {
                jobId: job?.id,
                orderId,
                attemptsMade,
                maxAttempts,
            }, err instanceof Error ? err : new Error(String(err)));
        }
    });

    logger.info("payment-capture-worker", "Worker started", {});

    // Graceful shutdown (register once)
    if (!shutdownHandler && !IS_JEST) {
        shutdownHandler = async () => {
            logger.info("payment-capture-worker", "Shutting down worker");
            await worker?.close();
        };
        process.on("SIGTERM", shutdownHandler);
        process.on("SIGINT", shutdownHandler);
    }

    return worker;
}

/**
 * Shuts down the payment capture worker.
 * Essential for testing.
 */
export async function shutdownPaymentCaptureWorker() {
    if (worker) {
        await worker.close();
        worker = null;
    }
}

/**
 * Set container reference (for testing)
 */
export function setContainerRef(container: MedusaContainer | null) {
    containerRef = container;
}
