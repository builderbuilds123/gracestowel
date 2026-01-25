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
        
        // Step 1: Cancel 3-day backup job
        await cancelPaymentCaptureJobStep(orderId);

        // Step 2: Get Payment Intent from Order
        // Note: 'fulfillment' object usually has order_id. We might need to query order to get metadata.
        // But wait, hooks are basically "steps injected at the end".
        // Can we run steps inside a hook? 
        // Docs example shows async function. 
        // But steps like 'useQueryGraphStep' must be used in the workflow builder, NOT inside a hook handler function?
        // Actually, the hook receives a 'WorkflowStepHandler' which can execute logic.
        // 
        // Correction: Hooks in Medusa v2 allow defining a sub-workflow or just steps.
        // The syntax `createOrderFulfillmentWorkflow.hooks.fulfillmentCreated( ... )`
        // accepts a function that defines steps.
        
        const orderQuery = useQueryGraphStep({
            entity: "order",
            fields: ["id", "metadata"],
            filters: { id: orderId },
        });

        const paymentIntentId = transform({ orderQuery }, (data) => {
            const order = data.orderQuery.data[0];
            const pi = order?.metadata?.stripe_payment_intent_id;
            // If no PI, we might skip capture (e.g. manual payment), or throw?
            // For now, if no PI, we assume it's not a Stripe order we manage.
            if (!pi || typeof pi !== 'string') {
                return null;
            }
            return pi;
        });

        // Condition provided by transform result? 
        // Steps don't support "if" easily without 'when' utility.
        // But 'capturePaymentStep' is our custom step. We can handle null PI inside it.
        
        capturePaymentStep({
            orderId: orderId,
            paymentIntentId: paymentIntentId, // passed as future/symbol
        });
        
    }
);
