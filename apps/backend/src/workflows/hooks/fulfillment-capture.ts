/**
 * Workflow Hook: Payment Capture on Fulfillment
 * 
 * Attaches to the native createOrderFulfillmentWorkflow to execute payment capture
 * immediately after a fulfillment is created.
 * 
 * Replaces the need for a custom Admin Widget or API route.
 */

import { createOrderFulfillmentWorkflow } from "@medusajs/core-flows";
import { executePaymentCapture } from "../../services/payment-capture-core";
import { cancelPaymentCaptureJob } from "../../lib/payment-capture-queue";

createOrderFulfillmentWorkflow.hooks.fulfillmentCreated(
    async ({ fulfillment }, { container }) => {
        const logger = container.resolve("logger");
        const query = container.resolve("query");
        // Cast to any to avoid strict type checks on DTO properties that exist at runtime
        const orderId = (fulfillment as any).order_id;

        try {
            // Step 1: Get Payment Intent from Order (Runtime Query)
            const { data: orders } = await query.graph({
                entity: "order",
                fields: ["metadata"],
                filters: { id: orderId },
            });

            const order = orders[0];
            const paymentIntentId = order?.metadata?.stripe_payment_intent_id as string | undefined;

            if (!paymentIntentId) {
                logger.info("fulfillment-hook", "Skipping capture: No Stripe Payment Intent found", { orderId });
                return;
            }

            // Step 2: Capture Payment (Direct Service Call)
            // We use a unique idempotency key for this hook execution
            const idempotencyKey = `hook_capture_${orderId}_${paymentIntentId}`;
            
            await executePaymentCapture(container, orderId, paymentIntentId, idempotencyKey);

            // Step 3: Cancel 3-day backup job
            // Only runs if capture succeeds
            await cancelPaymentCaptureJob(orderId);
            
            logger.info("fulfillment-hook", "Successfully captured payment and cancelled backup job", { orderId });

        } catch (error) {
            logger.error("fulfillment-hook", "Failed to execute payment capture in hook", { orderId }, error);
            // CRUDELY RE-THROW to ensure Workflow Rollback
            throw error; 
        }
    }
);
