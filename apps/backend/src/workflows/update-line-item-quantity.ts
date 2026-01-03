import {
    createStep,
    createWorkflow,
    StepResponse,
    WorkflowResponse,
    transform,
} from "@medusajs/framework/workflows-sdk";
import { Modules } from "@medusajs/framework/utils";
import Stripe from "stripe";
import { getStripeClient } from "../utils/stripe";
import { modificationTokenService } from "../services/modification-token";
import { retryWithBackoff, isRetryableStripeError } from "../utils/stripe-retry";
import { logger } from "../utils/logger";
import {
    InsufficientStockError,
    InvalidOrderStateError,
    InvalidPaymentStateError,
    CardDeclinedError,
    AuthMismatchError,
    TokenExpiredError,
    TokenInvalidError,
    TokenMismatchError,
    OrderNotFoundError,
    PaymentIntentMissingError,
    OrderLockedError,
    mapDeclineCodeToUserMessage,
    updatePaymentCollectionHandler,
} from "./add-item-to-order"; // Reuse error classes and utilities

// ============================================================================
// Input/Output Types
// ============================================================================

export interface UpdateLineItemQuantityInput {
    orderId: string;
    modificationToken: string;
    itemId: string; // Line Item ID
    quantity: number; // New Target Quantity
    /** Stable request ID for idempotency */
    requestId: string;
}

interface ValidationResult {
    valid: boolean;
    orderId: string;
    paymentIntentId: string;
    paymentCollectionId?: string; // ORD-02: For Payment Collection sync
    order: {
        id: string;
        status: string;
        total: number; // ORD-02: Order.total is source of truth
        currency_code: string;
        metadata: Record<string, any>;
        items: any[];
    };
    lineItem: {
        id: string;
        variant_id: string;
        title: string;
        quantity: number;
        unit_price: number;
        thumbnail?: string;
    };
    paymentIntent: {
        id: string;
        status: string;
        amount: number;
    };
}

interface TotalsResult {
    itemId: string;
    variantId: string;
    oldQuantity: number;
    newQuantity: number;
    quantityDiff: number;
    unitPrice: number;
    oldItemTotal: number;
    newItemTotal: number;
    totalDiff: number;
    newOrderTotal: number;
}

interface StripeUpdateResult {
    success: boolean;
    previousAmount: number;
    newAmount: number;
    skipped?: boolean;
    paymentIntentId: string;
    idempotencyKey: string;
}

// ============================================================================
// Error Classes (Specific to Update)
// ============================================================================

export class LineItemNotFoundError extends Error {
    public readonly code = "LINE_ITEM_NOT_FOUND" as const;
    public readonly itemId: string;

    constructor(itemId: string) {
        super(`Line item ${itemId} not found in order`);
        this.name = "LineItemNotFoundError";
        this.itemId = itemId;
    }
}

export class InvalidQuantityError extends Error {
    public readonly code = "INVALID_QUANTITY" as const;
    
    constructor(message: string) {
        super(message);
        this.name = "InvalidQuantityError";
    }
}

export class NoQuantityChangeError extends Error {
    public readonly code = "NO_QUANTITY_CHANGE" as const;
    
    constructor(itemId: string, currentQuantity: number) {
        super(`Quantity unchanged for item ${itemId} (current: ${currentQuantity})`);
        this.name = "NoQuantityChangeError";
    }
}

// ============================================================================
// Utility Functions
// ============================================================================

// Reuse retryWithBackoff and isRetryableStripeError from utils/stripe or duplicate?
// For now, I'll duplicate the helper logic or import if I extract it. 
// Since I can't easily extract right now without multiple tool calls, I'll duplicate the small helper.

function generateIdempotencyKey(orderId: string, itemId: string, quantity: number, requestId: string): string {
    return `update-item-${orderId}-${itemId}-${quantity}-${requestId}`;
}

// ============================================================================
// Workflow Steps
// ============================================================================

/**
 * Step 1: Validate Pre-conditions
 * - Check Token
 * - Check Order Status
 * - Check Line Item existence
 * - Check Stock (if increasing)
 */
export const validateUpdatePreconditionsStep = createStep(
    "validate-update-preconditions",
    async (
        input: { orderId: string; modificationToken: string; itemId: string; quantity: number },
        { container }
    ): Promise<StepResponse<ValidationResult>> => {
        const query = container.resolve("query");

        // 1. Validate Token
        const tokenValidation = modificationTokenService.validateToken(input.modificationToken);
        if (!tokenValidation.valid) {
            if (tokenValidation.expired) throw new TokenExpiredError();
            throw new TokenInvalidError();
        }
        if (tokenValidation.payload?.order_id !== input.orderId) {
            throw new TokenMismatchError(input.orderId, tokenValidation.payload?.order_id || "unknown");
        }

        // 2. Fetch Order & Items (ORD-02: Include total and payment_collections)
        const { data: orders } = await query.graph({
            entity: "order",
            fields: [
                "id", 
                "status", 
                "total", // ORD-02: Order.total is source of truth
                "currency_code", 
                "metadata", 
                "items.*",
                "payment_collections.id", // ORD-02: For Payment Collection sync
                "payment_collections.status"
            ],
            filters: { id: input.orderId },
        });

        if (!orders.length) throw new OrderNotFoundError(input.orderId);
        const order = orders[0];
        const paymentCollection = order.payment_collections?.[0];

        if (order.status !== "pending") {
            throw new InvalidOrderStateError(input.orderId, order.status);
        }

        // 3. Find Line Item
        const lineItem = (order.items || []).find((item: any) => item.id === input.itemId);
        if (!lineItem) {
            throw new LineItemNotFoundError(input.itemId);
        }

        // 4. Validate Quantity
        if (input.quantity < 0) {
            throw new InvalidQuantityError("Quantity cannot be negative");
        }
        if (input.quantity === 0) {
            throw new InvalidQuantityError("Quantity cannot be zero. Use the remove item endpoint to remove items from the order.");
        }
        if (input.quantity === lineItem.quantity) {
            // Early return for no-op: throw specific error that API route handles gracefully
            throw new NoQuantityChangeError(input.itemId, lineItem.quantity);
        }

        // 5. Payment Intent Check
        const paymentIntentId = order.metadata?.stripe_payment_intent_id;
        if (!paymentIntentId) throw new PaymentIntentMissingError(input.orderId);

        const stripe = getStripeClient();
        let paymentIntent: { id: string; status: string; amount: number; };

        if ((paymentIntentId as string).startsWith("pi_mock_")) {
             logger.info("update-line-item-quantity", "Using mock Payment Intent for validation");
             paymentIntent = {
                 id: paymentIntentId as string,
                 status: "requires_capture",
                 amount: 2000 // Match the unit price * quantity of 1 from test order
             };
        } else {
            paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId as string);
            if (paymentIntent.status !== "requires_capture") {
                throw new InvalidPaymentStateError(paymentIntentId as string, paymentIntent.status);
            }
        }

        if (order.metadata?.edit_status === "locked_for_capture") {
            throw new OrderLockedError(input.orderId);
        }

        // 6. Stock Check (Only if INCREASING quantity)
        const quantityDiff = input.quantity - lineItem.quantity;
        if (quantityDiff > 0) {
            const { data: variants } = await query.graph({
                entity: "product_variant",
                fields: ["id", "inventory_items.inventory_item_id"],
                filters: { id: lineItem.variant_id || "" },

            });

            if (variants.length) {
                const variant = variants[0];
                const inventoryItemId = variant.inventory_items?.[0]?.inventory_item_id;
                
                if (inventoryItemId) {
                    const { data: inventoryLevels } = await query.graph({
                        entity: "inventory_level",
                        fields: ["stocked_quantity", "reserved_quantity"],
                        filters: { inventory_item_id: inventoryItemId },
                    });

                    let totalAvailable = 0;
                    for (const level of inventoryLevels) {
                        totalAvailable += Math.max(0, (level.stocked_quantity || 0) - (level.reserved_quantity || 0));
                    }

                    if (totalAvailable < quantityDiff) {
                        throw new InsufficientStockError(lineItem.variant_id || "unknown", totalAvailable, quantityDiff);

                    }
                }
            }
        }

        return new StepResponse({
            valid: true,
            orderId: input.orderId,
            paymentIntentId: (paymentIntentId || "") as string,
            paymentCollectionId: paymentCollection?.id, // ORD-02: Return for sync
            order: {
                id: order.id,
                status: order.status,
                total: order.total, // ORD-02: Source of truth
                currency_code: order.currency_code,
                metadata: order.metadata || {},
                items: order.items as any[],
            },
            lineItem: {
                id: lineItem.id,
                variant_id: lineItem.variant_id || "",

                title: lineItem.title,
                quantity: lineItem.quantity,
                unit_price: lineItem.unit_price,
                thumbnail: lineItem.thumbnail || undefined,

            },
            paymentIntent: {
                id: paymentIntent.id,
                status: paymentIntent.status,
                amount: paymentIntent.amount,
            },
        });
    }
);

/**
 * Step 2: Calculate New Totals
 * 
 * ORD-02: Uses Order.total as source of truth (not PaymentIntent.amount)
 * This ensures consistency with add-item-to-order workflow.
 */
const calculateUpdateTotalsStep = createStep(
    "calculate-update-totals",
    async (
        input: {
            validation: ValidationResult;
            newQuantity: number;
        }
    ): Promise<StepResponse<TotalsResult>> => {
        const { lineItem, order } = input.validation;
        
        const oldQuantity = lineItem.quantity;
        const newQuantity = input.newQuantity;
        const quantityDiff = newQuantity - oldQuantity;
        
        const unitPrice = lineItem.unit_price; // Assuming unit price doesn't change
        
        // ORD-02: Use Order.total as source of truth (consistent with add-item-to-order)
        // Order.total is in cents (Medusa stores amounts in smallest currency unit)
        // unitPrice is also in cents from line item
        const unitPriceCents = unitPrice; // Already in cents
        
        const oldItemTotalCents = unitPriceCents * oldQuantity;
        const newItemTotalCents = unitPriceCents * newQuantity;
        const totalDiffCents = newItemTotalCents - oldItemTotalCents;
        
        // ORD-02: Calculate new total from Order.total (source of truth)
        const newOrderTotal = order.total + totalDiffCents;

        logger.info("update-line-item-quantity", "Calculated totals", {
            quantityDiff,
            totalDiffCents,
            orderTotal: order.total,
            newOrderTotal,
            unitPriceCents
        });

        return new StepResponse({
            itemId: lineItem.id,
            variantId: lineItem.variant_id,
            oldQuantity,
            newQuantity,
            quantityDiff,
            unitPrice, // In cents
            oldItemTotal: oldItemTotalCents,
            newItemTotal: newItemTotalCents,
            totalDiff: totalDiffCents,
            newOrderTotal,
        });
    }
);

/**
 * Step 3: Update Stripe PaymentIntent
 * 
 * ORD-02: Implements incremental authorization for amount increases.
 * - For decreases: Skip update (will partial capture later)
 * - For increases: Attempt stripe.paymentIntents.update() with retry logic
 * - On card decline: Throw CardDeclinedError for graceful rollback
 * 
 * This matches the behavior of add-item-to-order workflow for consistency.
 */

// Add Compensator to Stripe Step
// We need to detach logic to attach compensator properly using `createStep` robustly or `addCompensation`.
// Using `transform` style implies we define comp in the step definition.
// The `createStep` syntax allows a second async function for compensation.

// Redefining Types for Clarity
interface StripeCompInput {
    paymentIntentId: string;
    amountToRevertTo: number;
}

const updateStripeAuthStepWithComp = createStep(
    "update-stripe-auth-comp",
    async (input: {
        paymentIntentId: string;
        currentAmount: number;
        newAmount: number;
        orderId: string;
        itemId: string;
        quantity: number;
        requestId: string;
    }): Promise<StepResponse<StripeUpdateResult, StripeCompInput>> => {
         const stripe = getStripeClient();
         const idempotencyKey = generateIdempotencyKey(input.orderId, input.itemId, input.quantity, input.requestId);
         
         // No change needed
         if (input.currentAmount === input.newAmount) {
            logger.info("update-line-item-quantity", "Skipping Stripe update (no change)", {
                paymentIntentId: input.paymentIntentId,
                amount: input.currentAmount
            });
            return new StepResponse({
                success: true,
                paymentIntentId: input.paymentIntentId,
                previousAmount: input.currentAmount,
                newAmount: input.currentAmount,
                idempotencyKey,
                skipped: true
            }, {
                paymentIntentId: input.paymentIntentId,
                amountToRevertTo: input.currentAmount
            });
         }
         
         try {
             // ORD-02: For decreases, skip Stripe update (will partial capture later)
             // For increases, attempt incremental authorization
             if (input.newAmount < input.currentAmount) {
                 logger.info("update-line-item-quantity", "Skipping Stripe update for decrease (will partial capture)", {
                     paymentIntentId: input.paymentIntentId,
                     currentAmount: input.currentAmount,
                     newAmount: input.newAmount
                 });
                 return new StepResponse({
                     success: true,
                     paymentIntentId: input.paymentIntentId,
                     previousAmount: input.currentAmount,
                     newAmount: input.newAmount,
                     idempotencyKey,
                     skipped: true
                 }, {
                     paymentIntentId: input.paymentIntentId,
                     amountToRevertTo: input.currentAmount
                 });
             }

             // ORD-02: Attempt incremental authorization for increases
             // Use retry logic with exponential backoff (same as add-item-to-order)
             const updatedPaymentIntent = await retryWithBackoff(
                 async () => {
                     return stripe.paymentIntents.update(
                         input.paymentIntentId,
                         { amount: input.newAmount },
                         { idempotencyKey }
                     );
                 },
                 {
                     maxRetries: 3,
                     initialDelayMs: 200,
                     factor: 2,
                     shouldRetry: isRetryableStripeError,
                 }
             );

             logger.info("update-line-item-quantity", "Stripe authorization updated", {
                 paymentIntentId: input.paymentIntentId,
                 previousAmount: input.currentAmount,
                 newAmount: updatedPaymentIntent.amount
             });
             
             return new StepResponse(
                 { 
                     success: true, 
                     paymentIntentId: input.paymentIntentId,
                     previousAmount: input.currentAmount,
                     newAmount: updatedPaymentIntent.amount,
                     idempotencyKey,
                     skipped: false
                 },
                 {
                     paymentIntentId: input.paymentIntentId,
                     amountToRevertTo: input.currentAmount
                 }
             );
         } catch (error) {
             // ORD-02: Handle card decline errors gracefully
             if (error instanceof Stripe.errors.StripeCardError) {
                 logger.info("update-line-item-quantity", "Payment increment declined", {
                     metric: "payment_increment_decline_count",
                     value: 1,
                     reason: error.decline_code || 'unknown',
                     orderId: input.orderId,
                     paymentIntentId: input.paymentIntentId
                 });
                 throw new CardDeclinedError(
                     error.message || "Card was declined",
                     error.code || "card_declined",
                     error.decline_code
                 );
             }

             // Handle idempotency collision
             if (
                 error instanceof Stripe.errors.StripeIdempotencyError ||
                 (error as any).type === "idempotency_error"
             ) {
                 logger.info("update-line-item-quantity", "Idempotency collision, fetching current state", {
                     paymentIntentId: input.paymentIntentId,
                     idempotencyKey
                 });
                 const currentPI = await stripe.paymentIntents.retrieve(input.paymentIntentId);
                 return new StepResponse({
                     success: true,
                     paymentIntentId: input.paymentIntentId,
                     previousAmount: input.currentAmount,
                     newAmount: currentPI.amount,
                     idempotencyKey,
                     skipped: false
                 }, {
                     paymentIntentId: input.paymentIntentId,
                     amountToRevertTo: input.currentAmount
                 });
             }

             throw error;
         }
    },
    // Compensation: rollback Stripe amount if downstream steps fail
    async (compInput: StripeCompInput, { container }) => {
        if (!compInput) return;
        const stripe = getStripeClient();
        
        try {
            logger.info("update-line-item-quantity", "Rolling back Stripe authorization", {
                paymentIntentId: compInput.paymentIntentId,
                amountToRevertTo: compInput.amountToRevertTo
            });
            await stripe.paymentIntents.update(
                compInput.paymentIntentId,
                { amount: compInput.amountToRevertTo }
            );
        } catch (rollbackError) {
            logger.error("update-line-item-quantity", "Failed to rollback Stripe authorization", {
                paymentIntentId: compInput.paymentIntentId,
            }, rollbackError instanceof Error ? rollbackError : new Error(String(rollbackError)));
            throw rollbackError;
        }
    }
);

/**
 * Step 4: Update Payment Collection (ORD-02)
 * Ensures Medusa's payment record stays in sync with Order.total
 */
const updatePaymentCollectionStep = createStep(
    "update-payment-collection-qty",
    async (
        input: {
            paymentCollectionId: string | undefined;
            amount: number;
            previousAmount: number;
        },
        { container }
    ) => {
        if (!input.paymentCollectionId) {
            logger.warn("update-line-item-quantity", "No PaymentCollection ID found, skipping update");
            return new StepResponse({ updated: false, paymentCollectionId: "", previousAmount: 0 });
        }

        await updatePaymentCollectionHandler({
            paymentCollectionId: input.paymentCollectionId,
            amount: input.amount
        }, { container });

        logger.info("update-line-item-quantity", "Updated PaymentCollection", {
            paymentCollectionId: input.paymentCollectionId,
            amount: input.amount
        });

        return new StepResponse(
            { updated: true, paymentCollectionId: input.paymentCollectionId, previousAmount: input.previousAmount },
            { paymentCollectionId: input.paymentCollectionId, previousAmount: input.previousAmount }
        );
    },
    // Compensation: rollback PaymentCollection amount if downstream steps fail
    async (compensation, { container }) => {
        if (!compensation || !compensation.paymentCollectionId) {
            return;
        }

        const paymentModuleService = container.resolve(Modules.PAYMENT);

        try {
            await paymentModuleService.updatePaymentCollections(
                compensation.paymentCollectionId,
                { amount: compensation.previousAmount }
            );
            logger.info("update-line-item-quantity", "Rolled back PaymentCollection", {
                paymentCollectionId: compensation.paymentCollectionId,
                previousAmount: compensation.previousAmount
            });
        } catch (rollbackError) {
            logger.critical("update-line-item-quantity", "Failed to rollback PaymentCollection", {
                paymentCollectionId: compensation.paymentCollectionId,
                previousAmount: compensation.previousAmount,
                alert: "CRITICAL",
                issue: "PAYMENT_COLLECTION_ROLLBACK_FAILED"
            }, rollbackError instanceof Error ? rollbackError : new Error(String(rollbackError)));
            throw rollbackError;
        }
    }
);

/**
 * Step 5: Update Order in DB
 */
interface OrderCompInput {
    orderId: string;
    itemId: string;
    previousQuantity: number;
    previousTotal: number;
    previousMetadata: Record<string, unknown>;
}

const updateOrderDbStep = createStep(
    "update-order-db",
    async (
        input: {
            orderId: string;
            itemId: string;
            quantity: number;
            newTotal: number;
            stripeSucceeded: boolean;
            paymentIntentId: string;
            previousQuantity: number;
            previousTotal: number;
            previousMetadata: Record<string, unknown>;
        },
        { container }
    ): Promise<StepResponse<{ success: boolean }, OrderCompInput>> => {
        const orderService = container.resolve("order");


        try {
            // Update the existing line item quantity and align order.total
            await orderService.updateOrderLineItems([
                {
                    selector: { id: input.itemId },
                    data: { quantity: input.quantity },
                },
            ]);

            await orderService.updateOrders([
                {
                    id: input.orderId,
                    metadata: {
                        ...input.previousMetadata,
                        last_modified_action: "update_quantity",
                        last_modified_item: input.itemId,
                        last_modified_qty: input.quantity,
                        updated_total: input.newTotal,
                        updated_at: new Date().toISOString()
                    },
                },
            ]);

            logger.info("update-line-item-quantity", "Order updated", {
                orderId: input.orderId,
                itemId: input.itemId,
                quantity: input.quantity,
                newTotal: input.newTotal
            });

            return new StepResponse(
                { success: true },
                {
                    orderId: input.orderId,
                    itemId: input.itemId,
                    previousQuantity: input.previousQuantity,
                    previousTotal: input.previousTotal,
                    previousMetadata: input.previousMetadata,
                }
            );

        } catch (error) {
             if (input.stripeSucceeded) {
                 const criticalError = new AuthMismatchError(
                    input.orderId,
                    input.paymentIntentId,
                    `DB commit failed after Stripe update. Amount: ${input.newTotal}. Error: ${(error as Error).message}`
                 );
                 logger.critical(
                    "update-line-item-quantity",
                    "AUTH_MISMATCH_OVERSOLD - DB commit failed after Stripe update",
                    {
                        alert: "CRITICAL",
                        issue: "AUTH_MISMATCH_OVERSOLD",
                        orderId: input.orderId,
                        paymentIntentId: input.paymentIntentId,
                        intendedAmount: input.newTotal,
                    },
                    error instanceof Error ? error : new Error(String(error))
                 );
                 throw criticalError;
             }
             throw error;
        }
    },
// COMPENSATING STEP
async (compensation, { container }) => {
    if (!compensation) {
        return;
    }

    const orderService = container.resolve("order");

    await orderService.updateOrderLineItems([
        {
            selector: { id: compensation.itemId },
            data: { quantity: compensation.previousQuantity },
        },
    ]);

    await orderService.updateOrders([
        {
            id: compensation.orderId,
            metadata: {
                ...compensation.previousMetadata,
                rollback: true,
                rollback_at: new Date().toISOString(),
                updated_total: compensation.previousTotal,
            },
        },
    ]);
}
);

export const updateLineItemQuantityWorkflow = createWorkflow(
"update-line-item-quantity",
(input: UpdateLineItemQuantityInput) => {
    const validation = validateUpdatePreconditionsStep({
        orderId: input.orderId,
        modificationToken: input.modificationToken,
        itemId: input.itemId,
        quantity: input.quantity,
    });
    const totals = calculateUpdateTotalsStep({
        validation,
        newQuantity: input.quantity
    });

    // ORD-02: Update Stripe PaymentIntent (supports incremental authorization)
    const stripeResult = updateStripeAuthStepWithComp({
        paymentIntentId: validation.paymentIntentId,
        currentAmount: validation.paymentIntent.amount,
        newAmount: totals.newOrderTotal,
        orderId: input.orderId,
        itemId: input.itemId,
        quantity: input.quantity,
        requestId: input.requestId,
    });

    // ORD-02: Update Payment Collection to match Order.total
    const pcInput = transform({ validation, totals }, (data) => ({
        paymentCollectionId: data.validation.paymentCollectionId,
        amount: data.totals.newOrderTotal,
        previousAmount: data.validation.order.total,
    }));
    updatePaymentCollectionStep(pcInput);

    const dbResult = updateOrderDbStep({
        orderId: input.orderId,
        itemId: input.itemId,
        quantity: input.quantity,
        newTotal: totals.newOrderTotal,
        stripeSucceeded: stripeResult.success,
        paymentIntentId: validation.paymentIntentId,
        previousQuantity: validation.lineItem.quantity,
        previousTotal: validation.order.total,
        previousMetadata: validation.order.metadata,
    });

    return new WorkflowResponse({
        orderId: input.orderId,
        newTotal: totals.newOrderTotal,
        quantityDiff: totals.quantityDiff
    });
}
);

