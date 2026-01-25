/**
 * Workflow Hook: Payment Capture on Fulfillment
 * 
 * Attaches to the native createOrderFulfillmentWorkflow to execute payment capture
 * immediately after a fulfillment is created.
 * 
 * Replaces the need for a custom Admin Widget or API route.
 */

import { createOrderFulfillmentWorkflow } from "@medusajs/core-flows";
import { StepResponse } from "@medusajs/framework/workflows-sdk";
import { cancelPaymentCaptureJobStep } from "../steps/cancel-capture-job";
import { capturePaymentStep } from "../steps/capture-payment-step";
import { useQueryGraphStep } from "@medusajs/core-flows";
import { transform } from "@medusajs/framework/workflows-sdk";

createOrderFulfillmentWorkflow.hooks.fulfillmentCreated(
    async ({ fulfillment, additional_data }, { container }) => {
        const orderId = fulfillment.order_id;
        
        // This hook runs inside the workflow transaction.
        // If we throw here, the fulfillment creation effectively rolls back (due to workflow failure).
        
        // Step 1: Get Payment Intent from Order
        const orderQuery = useQueryGraphStep({
            entity: "order",
            fields: ["id", "metadata"],
            filters: { id: orderId },
        });

        const paymentIntentId = transform({ orderQuery }, (data) => {
            const order = data.orderQuery.data[0];
            const pi = order?.metadata?.stripe_payment_intent_id;
            if (!pi || typeof pi !== 'string') {
                return null;
            }
            return pi;
        });

        // Step 2: Capture Payment
        capturePaymentStep({
            orderId: orderId,
            paymentIntentId: paymentIntentId, 
        });

        // Step 3: Cancel 3-day backup job
        // Only executed if capture succeeds (as capture throws on failure)
        // This ensures the safety net job remains if native capture fails.
        cancelPaymentCaptureJobStep(orderId);
        
    }
);
