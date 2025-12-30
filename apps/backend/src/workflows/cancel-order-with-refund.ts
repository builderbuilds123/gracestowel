import {
    createStep,
    createWorkflow,
    StepResponse,
    WorkflowResponse,
    transform,
} from "@medusajs/framework/workflows-sdk";
import { updateInventoryLevelsStep } from "@medusajs/core-flows";
import type { UpdateInventoryLevelInput, MedusaContainer } from "@medusajs/types";
import Stripe from "stripe";
import { getStripeClient } from "../utils/stripe";
import { cancelPaymentCaptureJob, JobActiveError } from "../lib/payment-capture-queue";

/**
 * Story 3.4: Custom error classes for cancel workflow
 */
export class LateCancelError extends Error {
    code = "LATE_CANCEL";
    constructor(message: string = "Order is already being processed. Please contact support for refund.") {
        super(message);
        this.name = "LateCancelError";
    }
}

export class PartialCaptureError extends Error {
    code = "PARTIAL_CAPTURE";
    constructor(message: string = "Cannot cancel partially captured order. Manual refund required.") {
        super(message);
        this.name = "PartialCaptureError";
    }
}

export class OrderAlreadyCanceledError extends Error {
    code = "ALREADY_CANCELED";
    constructor(orderId: string) {
        super(`Order ${orderId} is already canceled`);
        this.name = "OrderAlreadyCanceledError";
    }
}

export class QueueRemovalError extends Error {
    code = "QUEUE_REMOVAL_FAILED";
    cause?: Error;
    constructor(orderId: string, cause?: Error) {
        super(`Failed to remove capture job for order ${orderId}. Cancellation aborted to prevent zombie payment.`);
        this.name = "QueueRemovalError";
        this.cause = cause;
    }
}

export class OrderNotFoundError extends Error {
    code = "ORDER_NOT_FOUND";
    constructor(orderId: string) {
        super(`Order ${orderId} not found`);
        this.name = "OrderNotFoundError";
    }
}

/**
 * Input for the cancel order workflow
 */
export interface CancelOrderWithRefundInput {
    orderId: string;
    paymentIntentId: string;
    reason?: string;
}

// Stripe client imported from ../utils/stripe

/**
 * Payment cancellation result type
 */
interface PaymentCancellationResult {
    action: "voided" | "refunded" | "none";
    paymentIntentId: string;
    status: string;
    refundId?: string;
    message?: string;
    voidFailed?: boolean; // Story 3.4: Flag for zombie case
}

/**
 * Story 3.4: Step to remove the capture job from BullMQ queue
 * Step 2 in the CAS transaction - prevents capture from running during cancel
 * 
 * REVIEW FIX: Now fails hard on Redis errors to prevent zombie payments.
 * If we can't confirm the capture job is stopped, we must abort cancellation.
 * 
 * Handler exported for unit testing.
 */
export async function removeCaptureJobHandler(
    input: { orderId: string }
): Promise<{ removed: boolean; orderId: string; notFound?: boolean }> {
    console.log(`[CancelOrder] Attempting to remove capture job for order ${input.orderId}`);
    
    const removed = await cancelPaymentCaptureJob(input.orderId);
    
    if (!removed) {
        // Job not found is OK - it either doesn't exist or already completed
        console.log(`[CancelOrder] Capture job not found for order ${input.orderId} (this is OK)`);
        return { removed: false, orderId: input.orderId, notFound: true };
    }
    
    console.log(`[CancelOrder] Capture job removed for order ${input.orderId}`);
    return { removed: true, orderId: input.orderId };
}

const removeCaptureJobStep = createStep(
    "remove-capture-job",
    async (input: { orderId: string }) => {
        try {
            const result = await removeCaptureJobHandler(input);
            return new StepResponse(result);
        } catch (error) {
            // Story 3.4 AC4: Race Condition Handling
            // If job is active, the capture worker is already processing it.
            // We must consider this "Too Late" and return 409 Conflict.
            if (error instanceof JobActiveError) {
                console.error(`[CancelOrder][ABORT] Capture job is ACTIVE for ${input.orderId}. Too late to cancel.`);
                throw new LateCancelError("Payment capture is already in progress");
            }

            // REVIEW FIX: Fail hard on Redis errors
            // If we can't confirm the job is stopped, we must abort to prevent zombie payment
            console.error(`[CancelOrder][ABORT] Redis error removing capture job for ${input.orderId}:`, error);
            throw new QueueRemovalError(input.orderId, error as Error);
        }
    }
);

/**
 * Story 3.4: Lock order step - validates order state before proceeding
 * Implements optimistic concurrency control (OCC) pattern
 * Throws LateCancelError if order is already captured/canceled
 * Throws PartialCaptureError if payment is partially captured (requires manual refund)
 */
interface LockOrderResult {
    orderId: string;
    canCancel: boolean;
    previousStatus: string;
}

export const lockOrderHandler = async (input: { orderId: string; paymentIntentId: string }, container: MedusaContainer): Promise<LockOrderResult> => {
    console.log(`[CancelOrder] Locking order ${input.orderId} for cancellation`);
    
    const query = container.resolve("query");
    const stripe = getStripeClient();
    
    // PAY-01: Fetch order with PaymentCollection status (canonical) and metadata (backward compatibility)
    const { data: orders } = await query.graph({
        entity: "order",
        fields: [
            "id",
            "status",
            "payment_status",
            "metadata",
            "payment_collections.id",
            "payment_collections.status",
        ],
        filters: { id: input.orderId },
    });
    
    if (!orders.length) {
        throw new OrderNotFoundError(input.orderId);
    }
    
    const order = orders[0];
    
    // Check if order is already in a terminal state
    if (order.status === "canceled") {
        console.log(`[CancelOrder] Order ${input.orderId} is already canceled`);
        throw new OrderAlreadyCanceledError(input.orderId);
    }
    
    // PAY-01: Check payment status from PaymentCollection (canonical) first
    // Fall back to metadata for pre-PAY-01 orders (backward compatibility)
    const paymentCollection = order.payment_collections?.[0];
    let paymentStatus: string | undefined;
    
    if (paymentCollection) {
        // Use canonical PaymentCollection status
        paymentStatus = paymentCollection.status as string;
        console.log(`[PAY-01][CancelOrder] Order ${input.orderId} has PaymentCollection status: ${paymentStatus}`);
    } else {
        // Fallback to metadata for pre-PAY-01 orders
        paymentStatus = (order.metadata as Record<string, unknown>)?.payment_status as string | undefined;
        if (paymentStatus) {
            console.log(`[PAY-01][CancelOrder] Order ${input.orderId} using metadata payment_status (pre-PAY-01): ${paymentStatus}`);
        }
    }
    
    // Check if payment has been captured (too late to cancel)
    // PaymentCollection status "completed" = captured
    // Metadata fallback: "captured" or payment_captured_at set
    const isCaptured = paymentStatus === "completed" || 
                       paymentStatus === "captured" || 
                       order.metadata?.payment_captured_at;
    
    if (isCaptured) {
        console.log(`[CancelOrder] Order ${input.orderId} payment already captured - too late to cancel`);
        throw new LateCancelError();
    }

    // Check for partial capture (requires manual intervention)
    // PaymentCollection status "partially_captured" or metadata "partially_captured"
    if (paymentStatus === "partially_captured") {
        console.error(`[CancelOrder][REJECTED] Order ${input.orderId} is partially captured. Manual refund required.`);
        throw new PartialCaptureError();
    }
    
    // Step 3b: Verify Stripe PaymentIntent status
    const paymentIntent = await stripe.paymentIntents.retrieve(input.paymentIntentId);
    
    if (paymentIntent.status === "succeeded") {
        console.log(`[CancelOrder] Stripe PaymentIntent ${input.paymentIntentId} is succeeded - too late to cancel`);
        throw new LateCancelError();
    }
    
    if (paymentIntent.status === "requires_capture" && paymentIntent.amount_received && paymentIntent.amount_received > 0) {
        console.log(`[CancelOrder] Stripe PaymentIntent ${input.paymentIntentId} is partially captured`);
        throw new PartialCaptureError();
    }
    
    return {
        orderId: input.orderId,
        canCancel: true,
        previousStatus: order.status,
    };
};

const lockOrderStep = createStep(
    "lock-order-for-cancel",
    async (input: { orderId: string; paymentIntentId: string }, { container }) => {
        const result = await lockOrderHandler(input, container);
        return new StepResponse(result);
    }
);

/**
 * Story 3.4: Void payment with compensation pattern
 * If Stripe void fails after DB cancellation, log CRITICAL but don't rollback (zombie case)
 * User expects order to be canceled, manual void will be required
 */
const voidPaymentWithCompensationStep = createStep(
    "void-payment-with-compensation",
    async (input: { paymentIntentId: string; orderId: string }): Promise<StepResponse<PaymentCancellationResult>> => {
        const stripe = getStripeClient();
        
        try {
            const paymentIntent = await stripe.paymentIntents.retrieve(input.paymentIntentId);
            
            if (paymentIntent.status === "requires_capture") {
                console.log(`[CancelOrder] Voiding PaymentIntent ${input.paymentIntentId}`);
                const canceled = await stripe.paymentIntents.cancel(input.paymentIntentId);
                return new StepResponse<PaymentCancellationResult>({
                    action: "voided",
                    paymentIntentId: input.paymentIntentId,
                    status: canceled.status,
                });
            } else if (paymentIntent.status === "canceled") {
                // Already canceled - idempotent success
                return new StepResponse<PaymentCancellationResult>({
                    action: "voided",
                    paymentIntentId: input.paymentIntentId,
                    status: "canceled",
                    message: "Payment was already canceled",
                });
            } else {
                // Unexpected state - log but return success (zombie prevention)
                console.warn(`[CancelOrder] Payment ${input.paymentIntentId} in unexpected state: ${paymentIntent.status}`);
                return new StepResponse<PaymentCancellationResult>({
                    action: "none",
                    paymentIntentId: input.paymentIntentId,
                    status: paymentIntent.status,
                    message: `Payment in state: ${paymentIntent.status}`,
                });
            }
        } catch (error) {
            // Story 3.4 AC #5: Zombie Case - Stripe void failed but order is canceled
            // DO NOT throw - log critical alert and return with warning
            console.error(
                `[CancelOrder][CRITICAL] Order ${input.orderId}: Canceled but Payment Void Failed. Manual Void Required!`,
                error
            );
            console.log(`[METRIC] cancel_void_failed order=${input.orderId} pi=${input.paymentIntentId}`);
            
            // Return success with flag indicating void failure (for monitoring)
            return new StepResponse<PaymentCancellationResult>({
                action: "none",
                paymentIntentId: input.paymentIntentId,
                status: "void_failed",
                message: "Order canceled but Stripe void failed - manual intervention required",
                voidFailed: true,
            });
        }
    }
);


/**
 * Step to emit an event
 */
const emitEventStep = createStep(
    "emit-event",
    async (input: { eventName: string; data: any }, { container }) => {
        const eventBusModuleService = container.resolve("eventBus") as any;
        await eventBusModuleService.emit(input.eventName, input.data);
        console.log(`Event ${input.eventName} emitted with data:`, input.data);
        return new StepResponse({ success: true });
    }
);

/**
 * Step to prepare inventory restocking adjustments
 */
const prepareRestockingAdjustmentsStep = createStep(
    "prepare-restocking-adjustments",
    async (input: { orderId: string }, { container }) => {
        const query = container.resolve("query");
        const adjustments: UpdateInventoryLevelInput[] = [];

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
                    fields: ["id", "location_id", "inventory_item_id", "stocked_quantity"],
                    filters: { inventory_item_id: inventoryItemId },
                });

                if (!inventoryLevels.length) continue;

                // Get current stocked quantity
                const currentStockedQuantity = inventoryLevels[0].stocked_quantity || 0;

                // Add update to increase stock (restock)
                adjustments.push({
                    inventory_item_id: inventoryItemId,
                    location_id: inventoryLevels[0].location_id,
                    stocked_quantity: currentStockedQuantity + item.quantity, // Add back to stock
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
 * Story 3.4: Enhanced workflow with CAS transaction pattern
 * 
 * This workflow implements a Serializable Transaction per AC:
 * - Step 1 (Pre-Check): Token & Grace Period verification (in API route)
 * - Step 2 (Queue Stop): Remove capture job from BullMQ
 * - Step 3 (DB Lock): Validate order state and lock
 * - Step 4 (DB Update): Set order status to canceled
 * - Post-Commit Actions:
 *   - Void Payment (with compensation pattern for zombie case)
 *   - Restock Inventory
 * - Emit order.canceled event
 */
export const cancelOrderWithRefundWorkflow = createWorkflow(
    "cancel-order-with-refund",
    (input: CancelOrderWithRefundInput) => {
        // Step 2 (AC): Queue Stop - Attempt to remove capture job
        const removeJobInput = transform({ input }, (data) => ({
            orderId: data.input.orderId,
        }));
        removeCaptureJobStep(removeJobInput);

        // Step 3 (AC): DB Lock - Validate order state before proceeding
        const lockInput = transform({ input }, (data) => ({
            orderId: data.input.orderId,
            paymentIntentId: data.input.paymentIntentId,
        }));
        lockOrderStep(lockInput);

        // Step 4 (AC): Commit - Update order status to canceled
        const cancelInput = transform({ input }, (data) => ({
            orderId: data.input.orderId,
        }));
        cancelMedusaOrderStep(cancelInput);

        // Post-Commit Action 1: Void Payment (with zombie compensation)
        const voidInput = transform({ input }, (data) => ({
            paymentIntentId: data.input.paymentIntentId,
            orderId: data.input.orderId,
        }));
        const paymentResult = voidPaymentWithCompensationStep(voidInput);

        // Post-Commit Action 2: Prepare inventory restocking
        const restockInput = transform({ input }, (data) => ({
            orderId: data.input.orderId,
        }));
        const restockAdjustments = prepareRestockingAdjustmentsStep(restockInput);

        // Update inventory levels (restock items)
        const shouldRestock = transform({ restockAdjustments }, (data) =>
            data.restockAdjustments.length > 0
        );

        const adjustedInventory = transform({ restockAdjustments, shouldRestock }, (data) => {
            if (data.shouldRestock) {
                return data.restockAdjustments;
            }
            return [];
        });

        updateInventoryLevelsStep(adjustedInventory);

        // Emit order.canceled event
        const eventData = transform({ input }, (data) => ({
            eventName: "order.canceled" as const,
            data: {
                id: data.input.orderId,
                reason: data.input.reason,
            },
        }));
        emitEventStep(eventData);

        // Return result with Story 3.4 response schema
        const result = transform({ input, paymentResult, shouldRestock }, (data) => ({
            order_id: data.input.orderId,
            status: "canceled" as const,
            payment_action: data.paymentResult.action === "voided" ? "voided" : 
                           data.paymentResult.voidFailed ? "void_failed" : "none",
            inventoryRestocked: data.shouldRestock,
            voidFailed: data.paymentResult.voidFailed || false,
        }));

        return new WorkflowResponse(result);
    }
);

export default cancelOrderWithRefundWorkflow;

