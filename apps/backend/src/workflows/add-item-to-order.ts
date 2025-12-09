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

export interface AddItemToOrderInput {
    orderId: string;
    modificationToken: string;
    variantId: string;
    quantity: number;
    metadata?: Record<string, unknown>;
    /** Stable request ID for idempotency (e.g., x-request-id header or UUID) */
    requestId: string;
}

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

interface TotalsResult {
    variantId: string;
    variantTitle: string;
    quantity: number;
    unitPrice: number;
    taxAmount: number;
    itemTotal: number;
    newOrderTotal: number;
    difference: number;
}

interface StripeIncrementResult {
    success: boolean;
    previousAmount: number;
    newAmount: number;
    skipped?: boolean;
    paymentIntentId: string;
    idempotencyKey: string;
}

// ============================================================================
// Error Classes - Exported with full properties for testing
// ============================================================================

export class InsufficientStockError extends Error {
    public readonly variantId: string;
    public readonly available: number;
    public readonly requested: number;

    constructor(variantId: string, available: number, requested: number) {
        super(`Insufficient stock for variant ${variantId}: available=${available}, requested=${requested}`);
        this.name = "InsufficientStockError";
        this.variantId = variantId;
        this.available = available;
        this.requested = requested;
    }
}

export class InvalidOrderStateError extends Error {
    public readonly orderId: string;
    public readonly status: string;

    constructor(orderId: string, status: string) {
        super(`Order ${orderId} is in invalid state: ${status}. Must be 'pending'.`);
        this.name = "InvalidOrderStateError";
        this.orderId = orderId;
        this.status = status;
    }
}

export class InvalidPaymentStateError extends Error {
    public readonly paymentIntentId: string;
    public readonly status: string;

    constructor(paymentIntentId: string, status: string) {
        super(`PaymentIntent ${paymentIntentId} is not in requires_capture state: ${status}`);
        this.name = "InvalidPaymentStateError";
        this.paymentIntentId = paymentIntentId;
        this.status = status;
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
    public readonly orderId: string;
    public readonly paymentIntentId: string;

    constructor(orderId: string, paymentIntentId: string, details: string) {
        super(`AUTH_MISMATCH_OVERSOLD: Order ${orderId}, PI ${paymentIntentId} - ${details}`);
        this.name = "AuthMismatchError";
        this.orderId = orderId;
        this.paymentIntentId = paymentIntentId;
    }
}

// Token Error Classes - Proper types instead of string matching
export class TokenExpiredError extends Error {
    public readonly code = "TOKEN_EXPIRED" as const;

    constructor() {
        super("The 1-hour modification window has expired");
        this.name = "TokenExpiredError";
    }
}

export class TokenInvalidError extends Error {
    public readonly code = "TOKEN_INVALID" as const;

    constructor() {
        super("Invalid modification token");
        this.name = "TokenInvalidError";
    }
}

export class TokenMismatchError extends Error {
    public readonly code = "TOKEN_MISMATCH" as const;
    public readonly expectedOrderId: string;
    public readonly actualOrderId: string;

    constructor(expectedOrderId: string, actualOrderId: string) {
        super(`Token does not match this order. Expected: ${expectedOrderId}, Got: ${actualOrderId}`);
        this.name = "TokenMismatchError";
        this.expectedOrderId = expectedOrderId;
        this.actualOrderId = actualOrderId;
    }
}

export class TaxProviderError extends Error {
    public readonly code = "TAX_PROVIDER_ERROR" as const;

    constructor(message: string) {
        super(`Tax provider error: ${message}`);
        this.name = "TaxProviderError";
    }
}

// Not Found Error Classes
export class OrderNotFoundError extends Error {
    public readonly code = "ORDER_NOT_FOUND" as const;
    public readonly orderId: string;

    constructor(orderId: string) {
        super(`Order ${orderId} not found`);
        this.name = "OrderNotFoundError";
        this.orderId = orderId;
    }
}

export class VariantNotFoundError extends Error {
    public readonly code = "VARIANT_NOT_FOUND" as const;
    public readonly variantId: string;

    constructor(variantId: string) {
        super(`Variant ${variantId} not found`);
        this.name = "VariantNotFoundError";
        this.variantId = variantId;
    }
}

export class PaymentIntentMissingError extends Error {
    public readonly code = "NO_PAYMENT_INTENT" as const;
    public readonly orderId: string;

    constructor(orderId: string) {
        super(`Order ${orderId} has no associated PaymentIntent`);
        this.name = "PaymentIntentMissingError";
        this.orderId = orderId;
    }
}

export class PriceNotFoundError extends Error {
    public readonly code = "PRICE_NOT_FOUND" as const;
    public readonly variantId: string;
    public readonly currencyCode: string;

    constructor(variantId: string, currencyCode: string) {
        super(`No price found for variant ${variantId} in ${currencyCode}`);
        this.name = "PriceNotFoundError";
        this.variantId = variantId;
        this.currencyCode = currencyCode;
    }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Retry utility with exponential backoff.
 * 
 * @param fn - Function to retry
 * @param options.maxRetries - Maximum number of RETRY attempts (default: 3)
 *                            Total attempts = 1 (initial) + maxRetries
 * @param options.initialDelayMs - Initial delay before first retry (default: 200ms)
 * @param options.factor - Exponential backoff factor (default: 2)
 * @param options.shouldRetry - Predicate to determine if error is retryable
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

    // Total attempts = 1 (initial) + maxRetries
    // Loop: attempt 0 = initial, attempts 1..maxRetries = retries
    for (let attempt = 0; attempt < maxRetries + 1; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            // If this is the last attempt OR error is not retryable, throw immediately
            if (attempt >= maxRetries || !shouldRetry(error)) {
                throw error;
            }
            console.log(`[add-item-to-order] Retry ${attempt + 1}/${maxRetries}, waiting ${delayMs}ms`);
            await new Promise(resolve => setTimeout(resolve, delayMs));
            delayMs *= factor;
        }
    }
    throw lastError;
}

function isRetryableStripeError(error: any): boolean {
    if (error instanceof Stripe.errors.StripeCardError) {
        return false;
    }
    if (error instanceof Stripe.errors.StripeConnectionError) {
        return true;
    }
    if (error instanceof Stripe.errors.StripeAPIError) {
        const statusCode = (error as any).statusCode;
        return statusCode >= 500 || statusCode === 429;
    }
    if (error.code === "ETIMEDOUT" || error.code === "ECONNRESET") {
        return true;
    }
    return false;
}

/**
 * Generate a stable idempotency key for Stripe operations.
 * Uses requestId to ensure retries return cached results.
 */
function generateIdempotencyKey(orderId: string, variantId: string, quantity: number, requestId: string): string {
    return `add-item-${orderId}-${variantId}-${quantity}-${requestId}`;
}

// ============================================================================
// Workflow Steps
// ============================================================================

/**
 * Step 1: Validate Pre-conditions (Auth, Stock, Status)
 * 
 * FIXES:
 * - Uses proper Token error classes instead of string-prefixed errors
 * - Sums stock across ALL inventory locations, not just the first one
 * 
 * Handler exported for unit testing.
 */
export async function validatePreconditionsHandler(
    input: { orderId: string; modificationToken: string; variantId: string; quantity: number },
    context: { container: any }
): Promise<ValidationResult> {
    const { container } = context;
    const query = container.resolve("query");

    // 1. Validate modification token with proper error types
    const tokenValidation = modificationTokenService.validateToken(input.modificationToken);
    if (!tokenValidation.valid) {
        if (tokenValidation.expired) {
            throw new TokenExpiredError();
        }
        throw new TokenInvalidError();
    }

    if (tokenValidation.payload?.order_id !== input.orderId) {
        throw new TokenMismatchError(input.orderId, tokenValidation.payload?.order_id || "unknown");
    }

    // 2. Fetch order and validate status
    const { data: orders } = await query.graph({
        entity: "order",
        fields: ["id", "status", "total", "currency_code", "metadata", "items.*"],
        filters: { id: input.orderId },
    });

    if (!orders.length) {
        throw new OrderNotFoundError(input.orderId);
    }

    const order = orders[0];
    if (order.status !== "pending") {
        throw new InvalidOrderStateError(input.orderId, order.status);
    }

    // 3. Validate PaymentIntent status
    const paymentIntentId = order.metadata?.stripe_payment_intent_id;
    if (!paymentIntentId) {
        throw new PaymentIntentMissingError(input.orderId);
    }

    const stripe = getStripeClient();
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status !== "requires_capture") {
        throw new InvalidPaymentStateError(paymentIntentId, paymentIntent.status);
    }

    // 4. Check inventory - SUM stock across ALL locations (FIX: was only checking first)
    const { data: variants } = await query.graph({
        entity: "product_variant",
        fields: ["id", "title", "inventory_items.inventory_item_id", "product.title"],
        filters: { id: input.variantId },
    });

    if (!variants.length) {
        throw new VariantNotFoundError(input.variantId);
    }

    const variant = variants[0];
    const inventoryItemId = variant.inventory_items?.[0]?.inventory_item_id;

    if (inventoryItemId) {
        const { data: inventoryLevels } = await query.graph({
            entity: "inventory_level",
            fields: ["id", "location_id", "inventory_item_id", "stocked_quantity", "reserved_quantity"],
            filters: { inventory_item_id: inventoryItemId },
        });

        // FIX: Sum stock across ALL locations instead of just first
        let totalAvailableStock = 0;
        for (const level of inventoryLevels) {
            const locationStock = (level.stocked_quantity || 0) - (level.reserved_quantity || 0);
            totalAvailableStock += Math.max(0, locationStock);
        }

        if (totalAvailableStock < input.quantity) {
            throw new InsufficientStockError(input.variantId, totalAvailableStock, input.quantity);
        }

        console.log(`[add-item-to-order] Stock check: ${totalAvailableStock} available across ${inventoryLevels.length} locations`);
    }

    console.log(`[add-item-to-order] Preconditions validated for order ${input.orderId}`);

    return {
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
    };
}

const validatePreconditionsStep = createStep(
    "validate-preconditions",
    async (input: { orderId: string; modificationToken: string; variantId: string; quantity: number }, { container }) => {
        const result = await validatePreconditionsHandler(input, { container });
        return new StepResponse(result);
    }
);

/**
 * Step 2: Calculate Order Totals (Tax, Shipping)
 * 
 * NOTE: Tax calculation is handled by Medusa's calculated_price which includes
 * tax when configured. For explicit tax provider integration, this step would
 * need to call the tax provider API. Currently uses calculated_price which
 * represents the final price including applicable taxes.
 * 
 * Per Medusa v2 pricing: calculated_price already includes tax when tax-inclusive
 * pricing is configured. For tax-exclusive regions, tax is added at checkout.
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

        // Fetch variant with calculated price (includes tax if configured)
        const { data: variants } = await query.graph({
            entity: "product_variant",
            fields: [
                "id",
                "title",
                "calculated_price.calculated_amount",
                "calculated_price.currency_code",
                "calculated_price.calculated_amount_with_tax",
                "calculated_price.tax_total",
                "product.title",
            ],
            filters: { id: input.variantId },
        });

        if (!variants.length) {
            throw new VariantNotFoundError(input.variantId);
        }

        const variant = variants[0] as any;
        const price = variant.calculated_price;

        if (!price || !price.calculated_amount) {
            throw new PriceNotFoundError(input.variantId, input.currencyCode);
        }

        // Use calculated_amount_with_tax if available, otherwise calculated_amount
        // This ensures tax is included when the region is configured for it
        const unitPrice = price.calculated_amount_with_tax || price.calculated_amount;
        const taxAmount = price.tax_total || 0;
        const itemTotal = unitPrice * input.quantity;
        const newOrderTotal = input.currentTotal + itemTotal;
        const difference = itemTotal;
        const variantTitle = `${variant.product?.title || ""} - ${variant.title || ""}`.trim();

        console.log(`[add-item-to-order] Calculated totals: unitPrice=${unitPrice}, tax=${taxAmount}, itemTotal=${itemTotal}, newTotal=${newOrderTotal}`);

        return new StepResponse({
            variantId: input.variantId,
            variantTitle,
            quantity: input.quantity,
            unitPrice,
            taxAmount,
            itemTotal,
            newOrderTotal,
            difference,
        });
    }
);

/**
 * Step 3: Increment Stripe Authorization
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
            requestId: string;
        }
    ): Promise<StepResponse<StripeIncrementResult>> => {
        const difference = input.newAmount - input.currentAmount;

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
        const idempotencyKey = generateIdempotencyKey(input.orderId, input.variantId, input.quantity, input.requestId);

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

            console.log(`[add-item-to-order] Stripe auth incremented: ${input.currentAmount} -> ${input.newAmount}`);

            return new StepResponse({
                success: true,
                previousAmount: input.currentAmount,
                newAmount: updatedPaymentIntent.amount,
                skipped: false,
                paymentIntentId: input.paymentIntentId,
                idempotencyKey,
            });
        } catch (error) {
            if (error instanceof Stripe.errors.StripeCardError) {
                throw new CardDeclinedError(
                    error.message || "Card was declined",
                    error.code || "card_declined",
                    error.decline_code
                );
            }

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
            const newLineItem = {
                variant_id: input.variantId,
                title: input.variantTitle,
                quantity: input.quantity,
                unit_price: input.unitPrice,
            };

            // Defensively parse existing added items from metadata
            const itemsJson = input.currentOrderMetadata?.added_items;
            let existingAddedItems: any[] = [];
            if (typeof itemsJson === "string") {
                try {
                    existingAddedItems = JSON.parse(itemsJson);
                } catch (e) {
                    console.warn(`[add-item-to-order] Malformed JSON in added_items for order ${input.orderId}. Ignoring corrupt data.`);
                }
            }

            const allAddedItems = [...existingAddedItems, newLineItem];

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
            if (input.stripeIncrementSucceeded) {
                const criticalError = new AuthMismatchError(
                    input.orderId,
                    input.paymentIntentId,
                    `DB commit failed after Stripe increment. Amount: ${input.newTotal}. Error: ${(error as Error).message}`
                );

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

export const addItemToOrderWorkflow = createWorkflow(
    "add-item-to-order",
    (input: AddItemToOrderInput) => {
        const validation = validatePreconditionsStep({
            orderId: input.orderId,
            modificationToken: input.modificationToken,
            variantId: input.variantId,
            quantity: input.quantity,
        });

        const totalsInput = transform({ validation, input }, (data) => ({
            orderId: data.input.orderId,
            variantId: data.input.variantId,
            quantity: data.input.quantity,
            currentTotal: data.validation.paymentIntent.amount,
            currencyCode: data.validation.order.currency_code,
        }));
        const totals = calculateTotalsStep(totalsInput);

        const stripeInput = transform({ validation, totals, input }, (data) => ({
            paymentIntentId: data.validation.paymentIntentId,
            currentAmount: data.validation.paymentIntent.amount,
            newAmount: data.totals.newOrderTotal,
            orderId: data.input.orderId,
            variantId: data.input.variantId,
            quantity: data.input.quantity,
            requestId: data.input.requestId,
        }));
        const stripeResult = incrementStripeAuthStep(stripeInput);

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

        const result = transform(
            { validation, totals, stripeResult, updateResult, input },
            (data) => {
                // Create the new item object
                const newItem = {
                    variant_id: data.input.variantId,
                    title: data.totals.variantTitle,
                    quantity: data.input.quantity,
                    unit_price: data.totals.unitPrice,
                    total: data.totals.itemTotal,
                };

                return {
                    order: {
                        id: data.validation.orderId,
                        // Include original items plus the newly added item
                        items: [...(data.validation.order.items || []), newItem],
                        total: data.totals.newOrderTotal,
                        difference_due: data.totals.difference,
                    },
                    added_item: newItem,
                    payment_status: data.stripeResult.skipped ? "unchanged" : "succeeded",
                };
            }
        );

        return new WorkflowResponse(result);
    }
);

export default addItemToOrderWorkflow;
