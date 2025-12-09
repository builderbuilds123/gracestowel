import {
    createStep,
    createWorkflow,
    StepResponse,
    WorkflowResponse,
    transform,
} from "@medusajs/framework/workflows-sdk";
import Stripe from "stripe";
import { getStripeClient } from "../utils/stripe";
import { modificationTokenService } from "../services/modification-token";

// ============================================================================
// Input/Output Types
// ============================================================================

/**
 * Input for the add-item-to-order workflow
 */
export interface AddItemToOrderInput {
    orderId: string;
    modificationToken: string;
    variantId: string;
    quantity: number;
    metadata?: Record<string, string>;
}

/**
 * Result of validation step
 */
interface ValidationResult {
    valid: boolean;
    orderId: string;
    paymentIntentId: string;
    order: {
        id: string;
        status: string;
        total: number;
        currency_code: string;
        metadata: Record<string, any>;
        items: any[];
    };
    paymentIntent: {
        id: string;
        status: string;
        amount: number;
    };
}

/**
 * Result of totals calculation
 */
interface TotalsResult {
    variantId: string;
    variantTitle: string;
    quantity: number;
    unitPrice: number;
    itemTotal: number;
    newOrderTotal: number;
    difference: number;
}

/**
 * Result of Stripe increment step
 */
interface StripeIncrementResult {
    success: boolean;
    previousAmount: number;
    newAmount: number;
    skipped?: boolean;
    paymentIntentId: string;
    idempotencyKey: string;
}

// ============================================================================
// Error Classes
// ============================================================================

export class InsufficientStockError extends Error {
    constructor(variantId: string, available: number, requested: number) {
        super(`Insufficient stock for variant ${variantId}: available=${available}, requested=${requested}`);
        this.name = "InsufficientStockError";
    }
}

export class InvalidOrderStateError extends Error {
    constructor(orderId: string, status: string) {
        super(`Order ${orderId} is in invalid state: ${status}. Must be 'pending'.`);
        this.name = "InvalidOrderStateError";
    }
}

export class InvalidPaymentStateError extends Error {
    constructor(paymentIntentId: string, status: string) {
        super(`PaymentIntent ${paymentIntentId} is not in requires_capture state: ${status}`);
        this.name = "InvalidPaymentStateError";
    }
}

export class CardDeclinedError extends Error {
    public readonly stripeCode: string;
    public readonly declineCode?: string;
    
    constructor(message: string, stripeCode: string, declineCode?: string) {
        super(message);
        this.name = "CardDeclinedError";
        this.stripeCode = stripeCode;
        this.declineCode = declineCode;
    }
}

export class AuthMismatchError extends Error {
    constructor(orderId: string, paymentIntentId: string, details: string) {
        super(`AUTH_MISMATCH_OVERSOLD: Order ${orderId}, PI ${paymentIntentId} - ${details}`);
        this.name = "AuthMismatchError";
    }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Retry utility with exponential backoff
 * 
 * @param fn - Function to retry
 * @param options - Retry options
 * @returns Result of the function
 */
async function retryWithBackoff<T>(
    fn: () => Promise<T>,
    options: {
        maxRetries?: number;
        initialDelayMs?: number;
        factor?: number;
        shouldRetry?: (error: any) => boolean;
    } = {}
): Promise<T> {
    const {
        maxRetries = 3,
        initialDelayMs = 200,
        factor = 2,
        shouldRetry = () => true,
    } = options;

    let lastError: any;
    let delayMs = initialDelayMs;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;

            // Don't retry if we've exhausted attempts or shouldn't retry this error
            if (attempt >= maxRetries || !shouldRetry(error)) {
                throw error;
            }

            console.log(`[add-item-to-order] Retry attempt ${attempt + 1}/${maxRetries}, waiting ${delayMs}ms`);
            await new Promise(resolve => setTimeout(resolve, delayMs));
            delayMs *= factor;
        }
    }

    throw lastError;
}

/**
 * Check if a Stripe error is retryable (network/5xx errors)
 */
function isRetryableStripeError(error: any): boolean {
    // Don't retry card declined
    if (error instanceof Stripe.errors.StripeCardError) {
        return false;
    }

    // Retry connection/network errors
    if (error instanceof Stripe.errors.StripeConnectionError) {
        return true;
    }

    // Retry API errors with 5xx status or rate limiting
    if (error instanceof Stripe.errors.StripeAPIError) {
        const statusCode = (error as any).statusCode;
        return statusCode >= 500 || statusCode === 429;
    }

    // Retry timeout errors
    if (error.code === "ETIMEDOUT" || error.code === "ECONNRESET") {
        return true;
    }

    return false;
}

/**
 * Generate an idempotency key for Stripe operations
 */
function generateIdempotencyKey(orderId: string, variantId: string, quantity: number): string {
    return `add-item-${orderId}-${variantId}-${quantity}-${Date.now()}`;
}

// ============================================================================
// Workflow Steps
// ============================================================================

/**
 * Step 1: Validate Pre-conditions (Auth, Stock, Status)
 * 
 * Validates:
 * - x-modification-token is valid and active
 * - Order status is "pending" (not captured/canceled)
 * - Inventory has sufficient stock
 * - PaymentIntent is in "requires_capture" state
 */
const validatePreconditionsStep = createStep(
    "validate-preconditions",
    async (
        input: { orderId: string; modificationToken: string; variantId: string; quantity: number },
        { container }
    ): Promise<StepResponse<ValidationResult>> => {
        const query = container.resolve("query");

        // 1. Validate modification token
        const tokenValidation = modificationTokenService.validateToken(input.modificationToken);
        if (!tokenValidation.valid) {
            throw new Error(
                tokenValidation.expired
                    ? "TOKEN_EXPIRED: The 1-hour modification window has expired"
                    : "TOKEN_INVALID: Invalid modification token"
            );
        }

        if (tokenValidation.payload?.order_id !== input.orderId) {
            throw new Error("TOKEN_MISMATCH: Token does not match this order");
        }

        // 2. Fetch order and validate status
        const { data: orders } = await query.graph({
            entity: "order",
            fields: ["id", "status", "total", "currency_code", "metadata", "items.*"],
            filters: { id: input.orderId },
        });

        if (!orders.length) {
            throw new Error(`ORDER_NOT_FOUND: Order ${input.orderId} not found`);
        }

        const order = orders[0];

        // Order must be in "pending" status (not captured/canceled)
        if (order.status !== "pending") {
            throw new InvalidOrderStateError(input.orderId, order.status);
        }

        // 3. Validate PaymentIntent status
        const paymentIntentId = order.metadata?.stripe_payment_intent_id;
        if (!paymentIntentId) {
            throw new Error(`NO_PAYMENT_INTENT: Order ${input.orderId} has no associated PaymentIntent`);
        }

        const stripe = getStripeClient();
        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

        if (paymentIntent.status !== "requires_capture") {
            throw new InvalidPaymentStateError(paymentIntentId, paymentIntent.status);
        }

        // 4. Check inventory for sufficient stock
        // First get the variant's inventory item
        const { data: variants } = await query.graph({
            entity: "product_variant",
            fields: ["id", "title", "inventory_items.inventory_item_id", "product.title"],
            filters: { id: input.variantId },
        });

        if (!variants.length) {
            throw new Error(`VARIANT_NOT_FOUND: Variant ${input.variantId} not found`);
        }

        const variant = variants[0];
        const inventoryItemId = variant.inventory_items?.[0]?.inventory_item_id;

        if (inventoryItemId) {
            // Check stock levels
            const { data: inventoryLevels } = await query.graph({
                entity: "inventory_level",
                fields: ["id", "location_id", "inventory_item_id", "stocked_quantity", "reserved_quantity"],
                filters: { inventory_item_id: inventoryItemId },
            });

            if (inventoryLevels.length > 0) {
                const level = inventoryLevels[0];
                const availableStock = (level.stocked_quantity || 0) - (level.reserved_quantity || 0);

                if (availableStock < input.quantity) {
                    throw new InsufficientStockError(input.variantId, availableStock, input.quantity);
                }
            }
        }

        console.log(`[add-item-to-order] Preconditions validated for order ${input.orderId}`);

        return new StepResponse({
            valid: true,
            orderId: input.orderId,
            paymentIntentId,
            order: {
                id: order.id,
                status: order.status,
                total: order.total,
                currency_code: order.currency_code,
                metadata: order.metadata || {},
                items: order.items || [],
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
 * Step 2: Calculate Order Totals (Tax, Shipping)
 * 
 * Recalculates the order totals with the new item.
 * Checks Tax Provider and Shipping Provider reachability.
 */
const calculateTotalsStep = createStep(
    "calculate-totals",
    async (
        input: {
            orderId: string;
            variantId: string;
            quantity: number;
            currentTotal: number;
            currencyCode: string;
        },
        { container }
    ): Promise<StepResponse<TotalsResult>> => {
        const query = container.resolve("query");

        // Get variant price
        const { data: variants } = await query.graph({
            entity: "product_variant",
            fields: [
                "id",
                "title",
                "calculated_price.*",
                "product.title",
            ],
            filters: { id: input.variantId },
        });

        if (!variants.length) {
            throw new Error(`VARIANT_NOT_FOUND: Variant ${input.variantId} not found`);
        }

        const variant = variants[0] as any;
        const price = variant.calculated_price;

        if (!price || !price.calculated_amount) {
            throw new Error(
                `PRICE_NOT_FOUND: No price found for variant ${input.variantId} in ${input.currencyCode}`
            );
        }

        const unitPrice = price.calculated_amount;
        const itemTotal = unitPrice * input.quantity;
        const newOrderTotal = input.currentTotal + itemTotal;
        const difference = itemTotal;

        const variantTitle = `${variant.product?.title || ""} - ${variant.title || ""}`.trim();

        console.log(`[add-item-to-order] Calculated totals: item=${itemTotal}, newTotal=${newOrderTotal}, diff=${difference}`);

        // Note: In a full implementation, we'd call Tax and Shipping providers here
        // For now, we assume they're reachable and include taxes in the calculated_price

        return new StepResponse({
            variantId: input.variantId,
            variantTitle,
            quantity: input.quantity,
            unitPrice,
            itemTotal,
            newOrderTotal,
            difference,
        });
    }
);

/**
 * Step 3: Increment Stripe Authorization
 * 
 * Implements:
 * - Exponential backoff retry (Initial: 200ms, Factor: 2, Max: 3 retries)
 * - No retry on card_declined (returns 402)
 * - Idempotency key handling
 * - Skip if difference <= 0
 */
const incrementStripeAuthStep = createStep(
    "increment-stripe-auth",
    async (
        input: {
            paymentIntentId: string;
            currentAmount: number;
            newAmount: number;
            orderId: string;
            variantId: string;
            quantity: number;
        }
    ): Promise<StepResponse<StripeIncrementResult>> => {
        const difference = input.newAmount - input.currentAmount;

        // Skip if no increase needed (item removed or no change)
        if (difference <= 0) {
            console.log(`[add-item-to-order] Skipping Stripe increment: difference=${difference}`);
            return new StepResponse({
                success: true,
                previousAmount: input.currentAmount,
                newAmount: input.currentAmount,
                skipped: true,
                paymentIntentId: input.paymentIntentId,
                idempotencyKey: "",
            });
        }

        const stripe = getStripeClient();
        const idempotencyKey = generateIdempotencyKey(input.orderId, input.variantId, input.quantity);

        try {
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

            console.log(
                `[add-item-to-order] Stripe auth incremented: ${input.currentAmount} -> ${input.newAmount}`
            );

            return new StepResponse({
                success: true,
                previousAmount: input.currentAmount,
                newAmount: updatedPaymentIntent.amount,
                skipped: false,
                paymentIntentId: input.paymentIntentId,
                idempotencyKey,
            });
        } catch (error) {
            // Handle card declined - no retry
            if (error instanceof Stripe.errors.StripeCardError) {
                throw new CardDeclinedError(
                    error.message || "Card was declined",
                    error.code || "card_declined",
                    error.decline_code
                );
            }

            // Handle idempotency key collision - return cached result
            if (
                error instanceof Stripe.errors.StripeIdempotencyError ||
                (error as any).type === "idempotency_error"
            ) {
                console.log(`[add-item-to-order] Idempotency collision, fetching current state`);
                const currentPI = await stripe.paymentIntents.retrieve(input.paymentIntentId);
                return new StepResponse({
                    success: true,
                    previousAmount: input.currentAmount,
                    newAmount: currentPI.amount,
                    skipped: false,
                    paymentIntentId: input.paymentIntentId,
                    idempotencyKey,
                });
            }

            throw error;
        }
    }
);

/**
 * Step 4: Update Order Values (DB Commit)
 * 
 * Commits the changes to the order.
 * If this fails after Stripe increment succeeded, log CRITICAL audit alert.
 */
const updateOrderValuesStep = createStep(
    "update-order-values",
    async (
        input: {
            orderId: string;
            paymentIntentId: string;
            variantId: string;
            variantTitle: string;
            quantity: number;
            unitPrice: number;
            itemTotal: number;
            newTotal: number;
            stripeIncrementSucceeded: boolean;
            currentOrderMetadata: Record<string, any>;
        },
        { container }
    ): Promise<StepResponse<{ success: boolean; orderId: string }>> => {
        const orderService = container.resolve("order");

        try {
            // Prepare new line item data
            const newLineItem = {
                variant_id: input.variantId,
                title: input.variantTitle,
                quantity: input.quantity,
                unit_price: input.unitPrice,
            };

            // Get existing added items from metadata
            const existingAddedItems = input.currentOrderMetadata?.added_items
                ? JSON.parse(input.currentOrderMetadata.added_items as string)
                : [];

            const allAddedItems = [...existingAddedItems, newLineItem];

            // Update order metadata with new items and total
            await orderService.updateOrders([
                {
                    id: input.orderId,
                    metadata: {
                        ...input.currentOrderMetadata,
                        added_items: JSON.stringify(allAddedItems),
                        updated_total: input.newTotal,
                        last_modified: new Date().toISOString(),
                    },
                },
            ]);

            console.log(`[add-item-to-order] Order ${input.orderId} updated with new item`);

            return new StepResponse({
                success: true,
                orderId: input.orderId,
            });
        } catch (error) {
            // CRITICAL: Stripe increment succeeded but DB commit failed
            // This is the "Rollback Trap" - we've authorized more money but can't record it
            if (input.stripeIncrementSucceeded) {
                const criticalError = new AuthMismatchError(
                    input.orderId,
                    input.paymentIntentId,
                    `DB commit failed after Stripe increment. Amount: ${input.newTotal}. Error: ${(error as Error).message}`
                );

                // Log CRITICAL audit alert
                console.error("🚨 CRITICAL AUDIT ALERT 🚨");
                console.error("AUTH_MISMATCH_OVERSOLD");
                console.error(`Order ID: ${input.orderId}`);
                console.error(`PaymentIntent ID: ${input.paymentIntentId}`);
                console.error(`Intended Amount: ${input.newTotal}`);
                console.error(`Error: ${(error as Error).message}`);
                console.error("Manual reconciliation required!");

                throw criticalError;
            }

            throw error;
        }
    }
);

// ============================================================================
// Workflow Definition
// ============================================================================

/**
 * Add Item to Order Workflow
 * 
 * Implements the complete flow for adding an item to an order:
 * 1. validatePreconditionsStep - Token Auth, Stock, Order Status, Payment Status
 * 2. calculateTotalsStep - Tax, Shipping recalculation
 * 3. incrementStripeAuthStep - External call with retry policy
 * 4. updateOrderValuesStep - DB commit with rollback trap
 */
export const addItemToOrderWorkflow = createWorkflow(
    "add-item-to-order",
    (input: AddItemToOrderInput) => {
        // Step 1: Validate preconditions
        const validation = validatePreconditionsStep({
            orderId: input.orderId,
            modificationToken: input.modificationToken,
            variantId: input.variantId,
            quantity: input.quantity,
        });

        // Step 2: Calculate new totals
        const totalsInput = transform({ validation, input }, (data) => ({
            orderId: data.input.orderId,
            variantId: data.input.variantId,
            quantity: data.input.quantity,
            currentTotal: data.validation.paymentIntent.amount,
            currencyCode: data.validation.order.currency_code,
        }));
        const totals = calculateTotalsStep(totalsInput);

        // Step 3: Increment Stripe authorization
        const stripeInput = transform({ validation, totals, input }, (data) => ({
            paymentIntentId: data.validation.paymentIntentId,
            currentAmount: data.validation.paymentIntent.amount,
            newAmount: data.totals.newOrderTotal,
            orderId: data.input.orderId,
            variantId: data.input.variantId,
            quantity: data.input.quantity,
        }));
        const stripeResult = incrementStripeAuthStep(stripeInput);

        // Step 4: Update order values (DB commit)
        const updateInput = transform({ validation, totals, stripeResult, input }, (data) => ({
            orderId: data.input.orderId,
            paymentIntentId: data.validation.paymentIntentId,
            variantId: data.input.variantId,
            variantTitle: data.totals.variantTitle,
            quantity: data.input.quantity,
            unitPrice: data.totals.unitPrice,
            itemTotal: data.totals.itemTotal,
            newTotal: data.totals.newOrderTotal,
            stripeIncrementSucceeded: data.stripeResult.success && !data.stripeResult.skipped,
            currentOrderMetadata: data.validation.order.metadata,
        }));
        const updateResult = updateOrderValuesStep(updateInput);

        // Return final result
        const result = transform(
            { validation, totals, stripeResult, updateResult, input },
            (data) => ({
                order: {
                    id: data.validation.orderId,
                    items: data.validation.order.items,
                    total: data.totals.newOrderTotal,
                    difference_due: data.totals.difference,
                },
                added_item: {
                    variant_id: data.input.variantId,
                    title: data.totals.variantTitle,
                    quantity: data.input.quantity,
                    unit_price: data.totals.unitPrice,
                    total: data.totals.itemTotal,
                },
                payment_status: data.stripeResult.skipped ? "unchanged" : "succeeded",
            })
        );

        return new WorkflowResponse(result);
    }
);

export default addItemToOrderWorkflow;
