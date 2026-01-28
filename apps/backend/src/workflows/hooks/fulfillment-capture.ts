/**
 * Workflow Hook: Payment Capture on Fulfillment
 *
 * Attaches to the native createOrderFulfillmentWorkflow to execute payment capture
 * immediately after a fulfillment is created.
 *
 * IMPORTANT: This hook captures ALL payments for the order when ANY items are fulfilled:
 * - Original PaymentCollection(s)
 * - Supplementary PaymentCollections (created during order modifications)
 *
 * For partial fulfillments, subsequent fulfillments will:
 * - Detect payments are already captured (by the previous fulfillment)
 * - Log info and skip (idempotent behavior)
 *
 * If payments are NOT captured during a partial fulfillment (which shouldn't happen),
 * this indicates a previous fulfillment failed - we'll attempt capture again.
 *
 * After successful capture, the 3-day fallback capture job is removed from the queue.
 *
 * On failure: The fulfillment workflow is rolled back and an admin notification is sent.
 */

import { createOrderFulfillmentWorkflow } from "@medusajs/core-flows";
import { captureAllOrderPayments } from "../../services/payment-capture-core";
import { cancelPaymentCaptureJob } from "../../lib/payment-capture-queue";
import { sendAdminNotification, AdminNotificationType } from "../../lib/admin-notifications";

createOrderFulfillmentWorkflow.hooks.fulfillmentCreated(
    async ({ fulfillment }, { container }) => {
        const logger = container.resolve("logger");
        const query = container.resolve("query");

        logger.info(`[fulfillment-hook] Hook triggered for fulfillment ${fulfillment.id}`);

        // The FulfillmentDTO doesn't include order_id directly.
        // We need to query the link table to get the associated order.
        let orderId: string | undefined;
        try {
            const { data: fulfillments } = await query.graph({
                entity: "fulfillment",
                fields: ["order.id"],
                filters: { id: fulfillment.id }
            });

            orderId = fulfillments?.[0]?.order?.id;
            logger.info(`[fulfillment-hook] Resolved order ID: ${orderId} for fulfillment ${fulfillment.id}`);
        } catch (queryError) {
            logger.error(`[fulfillment-hook] Failed to query order for fulfillment ${fulfillment.id}`, queryError);
            throw new Error(`Cannot determine order ID for fulfillment ${fulfillment.id}`);
        }

        if (!orderId) {
            logger.warn(`[fulfillment-hook] No order found for fulfillment ${fulfillment.id} - skipping payment capture`);
            return;
        }

        try {
            // Step 1: Capture ALL payments for the order
            // This includes both original and supplementary PaymentCollections
            // The function is idempotent - already captured payments are skipped
            const idempotencyKey = `hook_capture_${orderId}_${fulfillment.id}`;

            const result = await captureAllOrderPayments(container, orderId, idempotencyKey);

            if (!result.hasPayments) {
                logger.info(`[fulfillment-hook] Skipping capture: No payments found for order ${orderId}`);
                return;
            }

            // Log capture results
            if (result.allAlreadyCaptured) {
                // This is the expected case for partial fulfillment - previous fulfillment already captured
                logger.info(`[fulfillment-hook] All payments already captured for order ${orderId} - previous fulfillment handled capture (skipped: ${result.skippedCount})`);
            } else if (result.capturedCount > 0) {
                logger.info(`[fulfillment-hook] Payment capture completed for order ${orderId} (captured: ${result.capturedCount}, skipped: ${result.skippedCount})`);
            }

            // If any captures failed, throw to trigger rollback and send admin notification
            if (result.failedCount > 0) {
                const errorDetails = result.errors.join("; ");

                // Send admin notification about the failure
                await sendAdminNotification(container, {
                    type: AdminNotificationType.PAYMENT_FAILED,
                    title: `Payment Capture Failed`,
                    description: `Failed to capture ${result.failedCount} payment(s) for order ${orderId} during fulfillment. Fulfillment has been rolled back.`,
                    metadata: {
                        orderId,
                        fulfillmentId: fulfillment.id,
                        failedCount: result.failedCount,
                        capturedCount: result.capturedCount,
                        errors: errorDetails,
                    },
                });

                throw new Error(`Failed to capture ${result.failedCount} payment(s) for order ${orderId}: ${errorDetails}`);
            }

            // Step 2: Remove 3-day fallback job from queue
            // Do this if any capture succeeded OR all were already captured
            if (result.capturedCount > 0 || result.allAlreadyCaptured) {
                try {
                    const removed = await cancelPaymentCaptureJob(orderId);
                    if (removed) {
                        logger.info(`[fulfillment-hook] Removed fallback capture job from queue for order ${orderId}`);
                    }
                } catch (removeError) {
                    // Don't fail the fulfillment if job removal fails
                    // The job will just run and find payments already captured (idempotent)
                    logger.warn(`[fulfillment-hook] Failed to remove fallback capture job for order ${orderId}: ${removeError instanceof Error ? removeError.message : String(removeError)}`);
                }
            }

        } catch (error) {
            logger.error(`[fulfillment-hook] Failed to execute payment capture for order ${orderId}, fulfillment ${fulfillment.id}`, error);

            // Send admin notification if not already sent (check if it's our thrown error)
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (!errorMessage.includes("Failed to capture")) {
                // This is an unexpected error, send notification
                await sendAdminNotification(container, {
                    type: AdminNotificationType.PAYMENT_FAILED,
                    title: `Payment Capture Error`,
                    description: `Unexpected error during payment capture for order ${orderId}. Fulfillment has been rolled back.`,
                    metadata: {
                        orderId,
                        fulfillmentId: fulfillment.id,
                        error: errorMessage,
                    },
                });
            }

            // RE-THROW to ensure Workflow Rollback
            throw error;
        }
    }
);
