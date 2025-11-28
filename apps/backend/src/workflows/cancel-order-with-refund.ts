import {
    createStep,
    createWorkflow,
    StepResponse,
    WorkflowResponse,
    transform,
} from "@medusajs/framework/workflows-sdk";
import { cancelOrderWorkflow, adjustInventoryLevelsStep, emitEventStep } from "@medusajs/medusa/core-flows";
import type { InventoryTypes } from "@medusajs/framework/types";
import Stripe from "stripe";

/**
 * Input for the cancel order workflow
 */
export interface CancelOrderWithRefundInput {
    orderId: string;
    paymentIntentId: string;
    reason?: string;
}

/**
 * Get Stripe client
 */
const getStripeClient = () => {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
        throw new Error("STRIPE_SECRET_KEY is not configured");
    }
    return new Stripe(secretKey, {
        apiVersion: "2025-10-29.clover",
    });
};

/**
 * Payment cancellation result type
 */
interface PaymentCancellationResult {
    action: "voided" | "refunded" | "none";
    paymentIntentId: string;
    status: string;
    refundId?: string;
    message?: string;
}

/**
 * Step to void or refund the payment
 * - If payment is only authorized (not captured): void it
 * - If payment is captured: refund it
 */
const handlePaymentCancellationStep = createStep(
    "handle-payment-cancellation",
    async (input: { paymentIntentId: string }): Promise<StepResponse<PaymentCancellationResult>> => {
        const stripe = getStripeClient();

        try {
            // Get the current state of the payment intent
            const paymentIntent = await stripe.paymentIntents.retrieve(input.paymentIntentId);

            console.log(`Payment Intent ${input.paymentIntentId} status: ${paymentIntent.status}`);

            if (paymentIntent.status === "requires_capture") {
                // Payment is authorized but not captured - cancel/void it
                console.log("Payment is authorized, canceling...");
                const canceled = await stripe.paymentIntents.cancel(input.paymentIntentId);
                return new StepResponse<PaymentCancellationResult>({
                    action: "voided",
                    paymentIntentId: input.paymentIntentId,
                    status: canceled.status,
                });
            } else if (paymentIntent.status === "succeeded") {
                // Payment is captured - refund it
                console.log("Payment is captured, refunding...");
                const refund = await stripe.refunds.create({
                    payment_intent: input.paymentIntentId,
                    reason: "requested_by_customer",
                });
                return new StepResponse<PaymentCancellationResult>({
                    action: "refunded",
                    paymentIntentId: input.paymentIntentId,
                    refundId: refund.id,
                    status: refund.status || "pending",
                });
            } else {
                // Payment in unexpected state
                console.log(`Payment in unexpected state: ${paymentIntent.status}`);
                return new StepResponse<PaymentCancellationResult>({
                    action: "none",
                    paymentIntentId: input.paymentIntentId,
                    status: paymentIntent.status,
                    message: `Payment already in state: ${paymentIntent.status}`,
                });
            }
        } catch (error) {
            console.error("Error handling payment cancellation:", error);
            throw error;
        }
    }
);

/**
 * Step to prepare inventory restocking adjustments
 */
const prepareRestockingAdjustmentsStep = createStep(
    "prepare-restocking-adjustments",
    async (input: { orderId: string }, { container }) => {
        const query = container.resolve("query");
        const adjustments: InventoryTypes.BulkAdjustInventoryLevelInput[] = [];

        try {
            // Get order items
            const { data: orders } = await query.graph({
                entity: "order",
                fields: [
                    "items.*",
                    "items.variant_id",
                    "items.quantity",
                ],
                filters: { id: input.orderId },
            });

            if (!orders.length) {
                return new StepResponse(adjustments);
            }

            const order = orders[0];

            for (const item of order.items || []) {
                if (!item || !item.variant_id) continue;

                // Get the inventory item linked to this variant
                const { data: variants } = await query.graph({
                    entity: "product_variant",
                    fields: ["id", "inventory_items.inventory_item_id"],
                    filters: { id: item.variant_id },
                });

                if (!variants.length) continue;

                const variant = variants[0];
                const inventoryItemId = variant.inventory_items?.[0]?.inventory_item_id;

                if (!inventoryItemId) continue;

                // Get the stock location
                const { data: inventoryLevels } = await query.graph({
                    entity: "inventory_level",
                    fields: ["id", "location_id", "inventory_item_id"],
                    filters: { inventory_item_id: inventoryItemId },
                });

                if (!inventoryLevels.length) continue;

                // Add adjustment (positive to increment/restock)
                adjustments.push({
                    inventory_item_id: inventoryItemId,
                    location_id: inventoryLevels[0].location_id,
                    adjustment: item.quantity, // Positive to restock
                });
            }
        } catch (error) {
            console.error("Error preparing restocking adjustments:", error);
        }

        return new StepResponse(adjustments);
    }
);

/**
 * Step to cancel the order in Medusa
 */
const cancelMedusaOrderStep = createStep(
    "cancel-medusa-order",
    async (input: { orderId: string }, { container }) => {
        const orderService = container.resolve("order");

        try {
            // Update order status to canceled
            // Note: canceled_at is set automatically by Medusa when status is changed to canceled
            await orderService.updateOrders([{
                id: input.orderId,
                status: "canceled",
            }]);

            console.log(`Order ${input.orderId} canceled in Medusa`);
            return new StepResponse({ success: true });
        } catch (error) {
            console.error("Error canceling order in Medusa:", error);
            throw error;
        }
    }
);

/**
 * Workflow to cancel an order with refund and inventory restocking
 *
 * This workflow:
 * 1. Voids or refunds the payment in Stripe
 * 2. Restocks inventory
 * 3. Cancels the order in Medusa
 * 4. Emits order.canceled event
 */
export const cancelOrderWithRefundWorkflow = createWorkflow(
    "cancel-order-with-refund",
    (input: CancelOrderWithRefundInput) => {
        // Step 1: Handle payment cancellation (void or refund)
        const paymentInput = transform({ input }, (data) => ({
            paymentIntentId: data.input.paymentIntentId,
        }));
        const paymentResult = handlePaymentCancellationStep(paymentInput);

        // Step 2: Prepare inventory restocking adjustments
        const restockInput = transform({ input }, (data) => ({
            orderId: data.input.orderId,
        }));
        const restockAdjustments = prepareRestockingAdjustmentsStep(restockInput);

        // Step 3: Apply inventory adjustments (restock items)
        const shouldRestock = transform({ restockAdjustments }, (data) =>
            data.restockAdjustments.length > 0
        );

        const adjustedInventory = transform({ restockAdjustments, shouldRestock }, (data) => {
            if (data.shouldRestock) {
                return data.restockAdjustments;
            }
            return [];
        });

        adjustInventoryLevelsStep(adjustedInventory);

        // Step 4: Cancel the order in Medusa
        const cancelInput = transform({ input }, (data) => ({
            orderId: data.input.orderId,
        }));
        cancelMedusaOrderStep(cancelInput);

        // Step 5: Emit order.canceled event
        const eventData = transform({ input }, (data) => ({
            eventName: "order.canceled" as const,
            data: {
                id: data.input.orderId,
                reason: data.input.reason,
            },
        }));
        emitEventStep(eventData);

        // Return result
        const result = transform({ input, paymentResult, shouldRestock }, (data) => ({
            orderId: data.input.orderId,
            paymentAction: data.paymentResult.action,
            inventoryRestocked: data.shouldRestock,
        }));

        return new WorkflowResponse(result);
    }
);

export default cancelOrderWithRefundWorkflow;

