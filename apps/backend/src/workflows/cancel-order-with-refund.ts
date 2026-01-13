import {
    createStep,
    createWorkflow,
    StepResponse,
    WorkflowResponse,
    transform,
} from "@medusajs/framework/workflows-sdk";
import { cancelOrderWorkflow, deleteReservationsStep } from "@medusajs/core-flows";
import type { MedusaContainer } from "@medusajs/types";
import Stripe from "stripe";
import { getStripeClient } from "../utils/stripe";
import { cancelPaymentCaptureJob, schedulePaymentCapture, JobActiveError } from "../lib/payment-capture-queue";
import {
    PaymentCollectionStatus,
    validatePaymentCollectionStatus,
    isCapturedStatus,
    type PaymentCollectionStatusType,
} from "../types/payment-collection-status";

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
 * Story 3.5: Error for orders that have been shipped
 */
export class OrderShippedError extends Error {
    code = "ORDER_SHIPPED";
    constructor(orderId: string, fulfillmentStatus: string) {
        super(`This order has already been processed for shipping and can no longer be canceled.`);
        this.name = "OrderShippedError";
    }
}

export class MissingPaymentCollectionError extends Error {
    code = "MISSING_PAYMENT_COLLECTION";
    constructor(orderId: string) {
        super(`Order ${orderId} is missing PaymentCollection. Payment status implies legacy data.`);
        this.name = "MissingPaymentCollectionError";
    }
}

/**
 * Input for the cancel order workflow
 * Story 3.5: Added isWithinGracePeriod for branching logic
 */
export interface CancelOrderWithRefundInput {
    orderId: string;
    paymentIntentId: string;
    reason?: string;
    /** Story 3.5: True if within modification window (void), false if expired (refund) */
    isWithinGracePeriod: boolean;
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
 *
 * @param input - Object containing the order ID
 * @param input.orderId - The Medusa order ID to remove capture job for
 * @returns Promise resolving to object with removal status
 * @returns {boolean} removed - True if job was found and removed, false if job not found
 * @returns {string} orderId - The order ID that was processed
 * @returns {boolean} [notFound] - Optional flag indicating job wasn't found (not an error)
 * @throws {JobActiveError} If the capture job is currently being processed (too late to cancel)
 * @throws {Error} If Redis connection fails or other queue errors occur
 */
/**
 * Story 3.5: Fulfillment statuses that block cancellation
 */
const SHIPPED_FULFILLMENT_STATUSES = [
    "partially_fulfilled",
    "shipped",
    "partially_shipped",
    "delivered",
    "partially_delivered",
];

interface CheckFulfillmentResult {
    orderId: string;
    fulfillmentStatus: string;
    canCancel: boolean;
}

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
    async (input: { orderId: string; paymentIntentId: string }) => {
        try {
            const result = await removeCaptureJobHandler(input);
            return new StepResponse(result, input);
        } catch (error) {
            if (error instanceof JobActiveError) {
                console.error(`[CancelOrder][ABORT] Capture job is ACTIVE for ${input.orderId}. Too late to cancel.`);
                throw new LateCancelError("Payment capture is already in progress");
            }

            console.error(`[CancelOrder][ABORT] Redis error removing capture job for ${input.orderId}:`, error);
            throw new QueueRemovalError(input.orderId, error as Error);
        }
    },
    async (input) => {
        // Compensation: Re-add job if later steps fail
        if (input) {
            await reAddPaymentCaptureJobHandler(input);
        }
    }
);

/**
 * Story 3.4: Lock order step - validates order state before proceeding
 * Implements optimistic concurrency control (OCC) pattern
 *
 * This handler performs the critical validation step before cancellation:
 * 1. Fetches order with PaymentCollection status (canonical source per PAY-01)
 * 2. Validates PaymentCollection exists (fails loudly if missing - NO backward compatibility)
 * 3. Checks PaymentCollection status to determine if cancellation is allowed
 * 4. Validates Stripe PaymentIntent status for consistency
 *
 * Handler exported for unit testing.
 *
 * @param input - Object containing order and payment details
 * @param input.orderId - The Medusa order ID to validate for cancellation
 * @param input.paymentIntentId - The Stripe PaymentIntent ID to check status
 * @param container - Medusa dependency injection container for resolving services
 * @returns Promise resolving to lock result with cancellation eligibility
 * @returns {string} orderId - The order ID that was validated
 * @returns {boolean} canCancel - Whether the order can be safely canceled
 * @returns {string} previousStatus - The order's status before locking
 * @throws {OrderNotFoundError} If order doesn't exist in database
 * @throws {OrderAlreadyCanceledError} If order status is already "canceled"
 * @throws {Error} If PaymentCollection is missing (PAY-01 requirement - no fallback)
 * @throws {Error} If multiple PaymentCollections found (anomaly per Medusa docs)
 * @throws {Error} If PaymentCollection has invalid status value
 * @throws {LateCancelError} If payment already captured (PC status "completed" or Stripe status "succeeded")
 * @throws {PartialCaptureError} If payment partially captured (requires manual refund)
 */
interface LockOrderResult {
    orderId: string;
    canCancel: boolean;
    previousStatus: string;
}

export const lockOrderHandler = async (
    input: { orderId: string; paymentIntentId: string; isWithinGracePeriod?: boolean },
    container: MedusaContainer
): Promise<LockOrderResult> => {
    console.log(`[CancelOrder] Locking order ${input.orderId} for cancellation`);
    
    const query = container.resolve("query");
    const stripe = getStripeClient();
    
    // PAY-01: Fetch order with PaymentCollection status (canonical source)
    let orders: any[];
    try {
        const result = await query.graph({
            entity: "order",
            fields: [
                "id",
                "status",
                "payment_collections.id",
                "payment_collections.status",
                "payment_collections.payment_sessions.provider_id", 
            ],
            filters: { id: input.orderId },
        });
        orders = result.data || [];
    } catch (error) {
        console.error(`[CancelOrder][ERROR] Failed to query order ${input.orderId}:`, error);
        throw new Error(`Failed to retrieve order ${input.orderId}: ${(error as Error).message}`);
    }
    
    if (!orders.length) {
        console.error(`[CancelOrder][ERROR] Order ${input.orderId} not found in database`);
        throw new OrderNotFoundError(input.orderId);
    }
    
    const order = orders[0];
    
    // Check if order is already in a terminal state
    if (order.status === "canceled") {
        console.log(`[CancelOrder] Order ${input.orderId} is already canceled`);
        throw new OrderAlreadyCanceledError(input.orderId);
    }
    
    // PAY-01: Check payment status from PaymentCollection (canonical source)
    // Per Medusa v2 docs: Each order should have exactly one PaymentCollection
    // Multiple PaymentCollections is an anomaly and should be treated as an error
    const paymentCollections = order.payment_collections || [];

    if (paymentCollections.length === 0) {
        // PAY-01: PaymentCollection is required - fail loudly but with specific error
        console.error(
            `[PAY-01][CancelOrder][ERROR] Order ${input.orderId} has no PaymentCollection. ` +
            `Payment status cannot be determined. Order status: ${order.status}`
        );
        throw new MissingPaymentCollectionError(input.orderId);
    }
    
    if (paymentCollections.length > 1) {
        // Multiple PaymentCollections is an anomaly per Medusa docs
        console.error(
            `[PAY-01][CancelOrder][ERROR] Order ${input.orderId} has ${paymentCollections.length} PaymentCollections. ` +
            `Expected exactly one. This is an anomaly. Statuses: ${paymentCollections.map((pc: any) => pc.status).join(", ")}`
        );
        throw new Error(
            `Order ${input.orderId} has multiple PaymentCollections (${paymentCollections.length}). ` +
            `This is an anomaly and prevents safe cancellation.`
        );
    }
    
    // Use the single PaymentCollection
    const paymentCollection = paymentCollections[0];
    
    // PAY-01: Validate and type-check PaymentCollection status
    // This ensures type safety and catches invalid statuses at runtime
    let paymentStatus: PaymentCollectionStatusType;
    try {
        paymentStatus = validatePaymentCollectionStatus(
            paymentCollection.status,
            input.orderId
        );
        console.log(`[PAY-01][CancelOrder] Order ${input.orderId} PaymentCollection status validated: ${paymentStatus}`);
    } catch (error) {
        console.error(
            `[PAY-01][CancelOrder][ERROR] Invalid PaymentCollection status for order ${input.orderId}. ` +
            `Raw status value: ${JSON.stringify(paymentCollection.status)}. ` +
            `Error: ${(error as Error).message}`
        );
        throw error;
    }
    
    // Explicit handling for all PaymentCollection statuses
    // This ensures no status is accidentally allowed when it shouldn't be
    
    // Terminal states handling
    // Story 3.5: If within grace period, captured = error; if post-grace, captured = allowed (refund path)
    if (paymentStatus === PaymentCollectionStatus.COMPLETED) {
        if (input.isWithinGracePeriod) {
            // Within grace period but payment captured = race condition, too late
            console.log(`[CancelOrder] Order ${input.orderId} payment already captured (status: completed) - too late to cancel via void`);
            throw new LateCancelError();
        } else {
            // Post-grace period: captured is expected, proceed with refund
            console.log(`[CancelOrder][Story 3.5] Order ${input.orderId} payment captured (status: completed) - will proceed with refund`);
        }
    }
    
    if (paymentStatus === PaymentCollectionStatus.PARTIALLY_CAPTURED) {
        console.error(`[CancelOrder][REJECTED] Order ${input.orderId} is partially captured. Manual refund required.`);
        throw new PartialCaptureError();
    }
    
    if (paymentStatus === PaymentCollectionStatus.CANCELED) {
        console.log(`[CancelOrder] Order ${input.orderId} PaymentCollection is already canceled`);
        // PaymentCollection is canceled but order might not be - this is an edge case
        // We should still allow order cancellation to proceed, but log the anomaly
        console.warn(
            `[CancelOrder][WARN] Order ${input.orderId} has canceled PaymentCollection but order status is ${order.status}. ` +
            `Proceeding with order cancellation.`
        );
    }
    
    // Cancellable states - allow cancellation to proceed
    if (paymentStatus === PaymentCollectionStatus.NOT_PAID) {
        console.log(`[CancelOrder] Order ${input.orderId} PaymentCollection status: not_paid - cancellation allowed`);
    } else if (paymentStatus === PaymentCollectionStatus.AWAITING) {
        console.log(`[CancelOrder] Order ${input.orderId} PaymentCollection status: awaiting - cancellation allowed`);
    } else if (paymentStatus === PaymentCollectionStatus.AUTHORIZED) {
        console.log(`[CancelOrder] Order ${input.orderId} PaymentCollection status: authorized - cancellation allowed`);
    } else if (paymentStatus === PaymentCollectionStatus.REQUIRES_ACTION) {
        console.log(`[CancelOrder] Order ${input.orderId} PaymentCollection status: requires_action - cancellation allowed`);
    } else {
        // This should never happen due to validation, but handle defensively
        console.error(
            `[CancelOrder][ERROR] Order ${input.orderId} has unexpected PaymentCollection status: ${paymentStatus}. ` +
            `This should have been caught by validation. Proceeding with caution.`
        );
    }
    
    // Step 3b: Verify Stripe PaymentIntent status checks
    // only if the provider is Stripe
    
    // Determine provider from Payment Sessions
    const paymentSessions = paymentCollection.payment_sessions || [];
    const stripeSession = paymentSessions.find((s: any) => s.provider_id && s.provider_id.includes("stripe"));
    const isStripeProvider = !!stripeSession;

    if (isStripeProvider) {
        if (!input.paymentIntentId) {
             console.warn(`[CancelOrder][WARN] Order ${input.orderId} has Stripe provider but no paymentIntentId in input. Skipping Stripe check.`);
        } else {
            try {
                const paymentIntent = await stripe.paymentIntents.retrieve(input.paymentIntentId);

                if (paymentIntent.status === "succeeded") {
                    if (input.isWithinGracePeriod) {
                        // Within grace period but Stripe shows succeeded = race condition
                        console.log(`[CancelOrder] Stripe PaymentIntent ${input.paymentIntentId} is succeeded - too late to cancel via void`);
                        throw new LateCancelError();
                    } else {
                        // Post-grace period: succeeded is expected for refund path
                        console.log(`[CancelOrder][Story 3.5] Stripe PaymentIntent ${input.paymentIntentId} is succeeded - will proceed with refund`);
                    }
                }

                if (paymentIntent.status === "requires_capture" && paymentIntent.amount_received && paymentIntent.amount_received > 0) {
                    console.log(`[CancelOrder] Stripe PaymentIntent ${input.paymentIntentId} is partially captured`);
                    throw new PartialCaptureError();
                }
            } catch (error) {
                console.error(`[CancelOrder][WARN] Failed to retrieve Stripe PI ${input.paymentIntentId}: ${error}. Skipping Stripe check.`);
            }
        }
    } else {
        console.log(`[CancelOrder] Skipping Stripe PI check. No Stripe provider found in payment sessions.`);
    }
    
    return {
        orderId: input.orderId,
        canCancel: true,
        previousStatus: order.status,
    };
};

const lockOrderStep = createStep(
    "lock-order-for-cancel",
    async (input: { orderId: string; paymentIntentId: string; isWithinGracePeriod?: boolean }, { container }) => {
        const result = await lockOrderHandler(input, container);
        return new StepResponse(result);
    }
);



export const checkFulfillmentStatusHandler = async (
    input: { orderId: string },
    container: MedusaContainer
): Promise<CheckFulfillmentResult> => {
    const query = container.resolve("query");

    // Query order with fulfillments to determine status
    const { data: orders } = await query.graph({
        entity: "order",
        fields: ["id", "fulfillments.id", "fulfillments.packed_at", "fulfillments.shipped_at", "fulfillments.delivered_at"],
        filters: { id: input.orderId },
    });

    if (!orders.length) {
        throw new OrderNotFoundError(input.orderId);
    }

    const order = orders[0] as any;

    // Determine fulfillment status based on fulfillments
    // Medusa v2 doesn't have a top-level fulfillment_status, we derive it from fulfillments
    let fulfillmentStatus = "not_fulfilled";
    const fulfillments = order.fulfillments || [];

    if (fulfillments.length > 0) {
        const hasShipped = fulfillments.some((f: any) => f.shipped_at);
        const hasDelivered = fulfillments.some((f: any) => f.delivered_at);
        const hasPacked = fulfillments.some((f: any) => f.packed_at);

        if (hasDelivered) {
            fulfillmentStatus = "delivered";
        } else if (hasShipped) {
            fulfillmentStatus = "shipped";
        } else if (hasPacked) {
            fulfillmentStatus = "partially_fulfilled";
        }
    }

    console.log(`[CancelOrder][Story 3.5] Order ${input.orderId} fulfillment_status: ${fulfillmentStatus}`);

    if (SHIPPED_FULFILLMENT_STATUSES.includes(fulfillmentStatus)) {
        console.log(`[CancelOrder][Story 3.5] Order ${input.orderId} has been shipped (${fulfillmentStatus}) - REJECTING cancellation`);
        throw new OrderShippedError(input.orderId, fulfillmentStatus);
    }

    return {
        orderId: input.orderId,
        fulfillmentStatus,
        canCancel: true,
    };
};

const checkFulfillmentStatusStep = createStep(
    "check-fulfillment-status",
    async (input: { orderId: string }, { container }) => {
        const result = await checkFulfillmentStatusHandler(input, container);
        return new StepResponse(result);
    }
);

/**
 * Story 3.5: Re-add capture job compensation step
 * Called when cancellation fails after job was removed - prevents revenue loss
 */
export const reAddPaymentCaptureJobHandler = async (
    input: { orderId: string; paymentIntentId: string }
): Promise<{ reAdded: boolean; orderId: string }> => {
    console.log(`[CancelOrder][Story 3.5][COMPENSATION] Re-adding capture job for order ${input.orderId}`);

    try {
        // Re-add with immediate execution (0 delay) since we're past the original schedule
        // Note: If payment is already captured, the worker will detect this and no-op
        await schedulePaymentCapture(input.orderId, input.paymentIntentId, 0);
        console.log(`[CancelOrder][Story 3.5][COMPENSATION] Capture job re-added for order ${input.orderId}`);
        console.log(`[METRIC] cancel_compensation_job_readded order=${input.orderId}`);
        return { reAdded: true, orderId: input.orderId };
    } catch (error) {
        // Log but don't throw - compensation is best-effort
        console.error(
            `[CancelOrder][Story 3.5][COMPENSATION][CRITICAL] Failed to re-add capture job for order ${input.orderId}:`,
            error
        );
        console.log(`[METRIC] cancel_compensation_job_failed order=${input.orderId}`);
        return { reAdded: false, orderId: input.orderId };
    }
};



/**
 * Story 3.5: Unified Order Cancellation Workflow
 *
 * This workflow implements:
 * - Grace Period Cancellation (within modification window): Void authorization
 * - Post-Grace Cancellation (after modification window): Refund captured payment
 * - Fulfillment check: Reject if order shipped
 * - Compensation: Re-add capture job if cancellation fails after job removal
 *
 * Note: The modification window duration is configured via PAYMENT_CAPTURE_DELAY_MS
 *
 * Flow:
 * 1. Check fulfillment status (reject if shipped) - Story 3.5 AC3
 * 2. Remove capture job from queue (with compensation on failure) - Story 3.4
 * 3. Validate order state (PAY-01)
 * 4. Cancel order in Medusa
 * 5. Process payment:
 *    - Within modification window: Void authorization
 *    - After modification window: Issue refund
 * 6. Restock inventory
 * 7. Emit order.canceled event
 */
/**
 * Step to find reservations associated with order line items
 * Phase 3 of Plan: Release reservations on cancellation
 */
const prepareReservationReleaseStep = createStep(
    "prepare-reservation-release",
    async (input: { orderId: string }, { container }) => {
        const query = container.resolve("query");
        
        // 1. Get Line Item IDs
        const { data: orders } = await query.graph({
            entity: "order",
            fields: ["items.id"],
            filters: { id: input.orderId }
        });
        
        if (!orders.length || !orders[0].items || !orders[0].items.length) {
            return new StepResponse([]);
        }

        const lineItemIds = orders[0].items.map((i: any) => i.id);

        // 2. Find reservations linked to these line items
        // Uses the module link defined in Phase 1
        const { data: reservations } = await query.graph({
            entity: "reservation_item",
            fields: ["id"],
            filters: {
                line_item_id: lineItemIds
            }
        });
        
        const ids = reservations.map((r: any) => r.id);
        
        if (ids.length > 0) {
            console.log(`[CancelOrder] Found ${ids.length} reservations to release for order ${input.orderId}`);
        }
        
        return new StepResponse(ids);
    }
);

export const cancelOrderWithRefundWorkflow = createWorkflow(
    "cancel-order-with-refund",
    (input: CancelOrderWithRefundInput) => {
        // Step 1 (Story 3.5 AC3): Check fulfillment status first
        const fulfillmentInput = transform({ input }, (data) => {
            console.log(`[CancelOrder][Workflow] Step 1: Checking fulfillment for ${data.input.orderId}`);
            return { orderId: data.input.orderId };
        });
        checkFulfillmentStatusStep(fulfillmentInput);

        // Step 2 (AC): Queue Stop - Attempt to remove capture job
        const removeJobInput = transform({ input }, (data) => {
            console.log(`[CancelOrder][Workflow] Step 2: Removing capture job for ${data.input.orderId}`);
            return {
                orderId: data.input.orderId,
                paymentIntentId: data.input.paymentIntentId,
            };
        });
        removeCaptureJobStep(removeJobInput);

        // Step 3 (AC): DB Lock - Validate order state before proceeding
        const lockInput = transform({ input }, (data) => {
            console.log(`[CancelOrder][Workflow] Step 3: Locking order ${data.input.orderId} (Grace: ${data.input.isWithinGracePeriod})`);
            return {
                orderId: data.input.orderId,
                paymentIntentId: data.input.paymentIntentId,
                isWithinGracePeriod: data.input.isWithinGracePeriod,
            };
        });
        lockOrderStep(lockInput);

        // Step 3.5: Release Reservations (Phase 3 of Plan)
        // This ensures inventory is freed up when order is cancelled
        const reservationIds = prepareReservationReleaseStep({ orderId: input.orderId });
        deleteReservationsStep(reservationIds);

        // Step 4 (FIX): Use Medusa Core Workflow for cancellation
        const coreCancelInput = transform({ input }, (data) => {
            console.log(`[CancelOrder][Workflow] Step 4: Running core cancelOrderWorkflow for ${data.input.orderId}`);
            return {
                order_id: data.input.orderId,
            };
        });
        cancelOrderWorkflow.runAsStep({ input: coreCancelInput });

        return new WorkflowResponse({
            success: true,
            orderId: input.orderId
        });
    }
);

export default cancelOrderWithRefundWorkflow;

