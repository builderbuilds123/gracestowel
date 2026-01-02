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
import { updateInventoryLevelsStep } from "@medusajs/core-flows";
import type { UpdateInventoryLevelInput } from "@medusajs/types";

// Structured logger for add-item-to-order workflow
const logger = {
    info: (message: string, meta?: Record<string, any>) => {
        console.log(JSON.stringify({ level: "info", workflow: "add-item-to-order", message, ...meta, timestamp: new Date().toISOString() }));
    },
    warn: (message: string, meta?: Record<string, any>) => {
        console.warn(JSON.stringify({ level: "warn", workflow: "add-item-to-order", message, ...meta, timestamp: new Date().toISOString() }));
    },
    error: (message: string, meta?: Record<string, any>) => {
        console.error(JSON.stringify({ level: "error", workflow: "add-item-to-order", message, ...meta, timestamp: new Date().toISOString() }));
    },
    metric: (metricName: string, value: number | string, meta?: Record<string, any>) => {
        console.log(JSON.stringify({ level: "metric", workflow: "add-item-to-order", metric: metricName, value, ...meta, timestamp: new Date().toISOString() }));
    },
};

// ... existing code ...

/**
 * Step to prepare inventory adjustments for expected item addition
 * Logic mirrored from create-order-from-stripe workflow
 */
export async function prepareInventoryAdjustmentsHandler(
    state: { variantId: string; quantity: number },
    { container }: { container: any }
): Promise<UpdateInventoryLevelInput[]> {
    const query = container.resolve("query");
    
    // Get the inventory item linked to this variant
    // We assume validationPreconditions already checked existence, but we need the IDs/locations
    const { data: variants } = await query.graph({
        entity: "product_variant",
        fields: ["id", "inventory_items.inventory_item_id"],
        filters: { id: state.variantId },
    });

    if (!variants.length) return [];

    const variant = variants[0];
    const inventoryItemId = variant.inventory_items?.[0]?.inventory_item_id;

    if (!inventoryItemId) return [];

    // Get the stock location for this inventory item
    // Logic: In simple setup, just take the first location. 
    // In complex multi-warehouse, we might need to know WHICH location the order is fulfilled from.
    // However, `add-item-to-order` doesn't currently take location_id as input.
    // We will assume the primary location or first available.
    // Note: The precondition check validated total stock across ALL locations.
    // For reservation, we should ideally reserve from the location that has stock.
    const { data: inventoryLevels } = await query.graph({
        entity: "inventory_level",
        fields: ["id", "location_id", "inventory_item_id", "stocked_quantity"],
        filters: { inventory_item_id: inventoryItemId },
    });

    if (!inventoryLevels.length) return [];

    // Inventory reservation strategy:
    // 1. Try to find a single location with sufficient available stock (stocked - reserved)
    // 2. If no single location has enough, pick the location with the most available stock
    // 3. Note: Multi-location allocation (splitting across warehouses) is not supported in this simple flow
    //    The precondition check already verified total stock across all locations is sufficient

    // Calculate available stock for each location (stocked - reserved)
    const levelsWithAvailable = inventoryLevels.map((level: any) => ({
        ...level,
        availableStock: (level.stocked_quantity || 0) - (level.reserved_quantity || 0)
    }));

    // Strategy: Find location with enough available stock
    let targetLevel = levelsWithAvailable.find((level: any) => level.availableStock >= state.quantity);

    if (!targetLevel) {
        // Fallback: Use location with most available stock
        // This handles the case where no single location has enough, but total across locations does
        // In this case, we'll allocate from the best location and allow it to go slightly negative
        // (This is acceptable since preconditions verified total stock exists)
        targetLevel = levelsWithAvailable.reduce((best: any, current: any) =>
            current.availableStock > best.availableStock ? current : best
        );

        logger.warn("No single location has sufficient stock, using best available", {
            variantId: state.variantId,
            requested: state.quantity,
            selectedLocation: targetLevel.location_id,
            availableAtLocation: targetLevel.availableStock
        });
    }

    const currentStockedQuantity = targetLevel.stocked_quantity || 0;

    return [{
        inventory_item_id: inventoryItemId,
        location_id: targetLevel.location_id,
        stocked_quantity: currentStockedQuantity - state.quantity, // Reduce stock
    }];
}

export async function rollbackStripeAuth(prev: StripeIncrementResult): Promise<void> {
    if (!prev || prev.skipped) {
        return;
    }

    const stripe = getStripeClient();
    const rollbackKey = prev.idempotencyKey ? `${prev.idempotencyKey}-rollback` : undefined;

    await stripe.paymentIntents.update(
        prev.paymentIntentId,
        { amount: prev.previousAmount },
        rollbackKey ? { idempotencyKey: rollbackKey } : undefined
    );
    logger.info("Rolled back Stripe authorization", {
        paymentIntentId: prev.paymentIntentId,
        previousAmount: prev.previousAmount,
        idempotencyKey: rollbackKey
    });
}

export const prepareInventoryAdjustmentsStep = createStep(
    "prepare-inventory-adjustments-add-item",
    async (input: { variantId: string; quantity: number }, { container }) => {
        const adjustments = await prepareInventoryAdjustmentsHandler(input, { container });
        return new StepResponse(adjustments);
    }
);

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
    paymentCollectionId?: string; // PAY-01 Link
    order: {
        id: string;
        status: string;
        total: number;
        tax_total: number;
        subtotal: number;
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

export interface TotalsResult {
    variantId: string;
    variantTitle: string;
    quantity: number;
    unitPrice: number;
    taxAmount: number;
    itemTotal: number;
    newOrderTotal: number;
    difference: number;
}

export interface CalculateTotalsInput {
    orderId: string;
    variantId: string;
    quantity: number;
    currentTotal: number;
    currentTaxTotal: number;
    currentSubtotal: number;
    currencyCode: string;
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

/**
 * Story 6.4: Decline code to user-friendly message mapping
 * Per story requirements - sanitized messages that don't expose sensitive info
 */
export const DECLINE_CODE_MESSAGES: Record<string, string> = {
    // Generic declines
    generic_decline: "Your card was declined.",
    card_declined: "Your card was declined.",
    do_not_honor: "Your card was declined.",
    
    // Specific issues with user-actionable messages
    insufficient_funds: "Insufficient funds.",
    expired_card: "Your card has expired.",
    incorrect_cvc: "Your card's security code is incorrect.",
    incorrect_number: "Your card number is incorrect.",
    
    // Security-sensitive codes - don't reveal card is lost/stolen
    lost_card: "Your card was declined. Please try another.",
    stolen_card: "Your card was declined. Please try another.",
    fraudulent: "Your card was declined. Please try another.",
    
    // Processing errors
    processing_error: "An error occurred while processing your card.",
    card_not_supported: "Your card is not supported.",
    currency_not_supported: "Your card does not support this currency.",
};

/**
 * Story 6.4: Decline codes that are retryable (user can fix the issue)
 */
export const RETRYABLE_DECLINE_CODES = new Set([
    "insufficient_funds",  // User can add funds
    "incorrect_cvc",       // User can re-enter
    "incorrect_number",    // User can re-enter
    "processing_error",    // Transient, can retry
]);

/**
 * Story 6.4: Map Stripe decline code to user-friendly message
 * @param declineCode - The Stripe decline_code
 * @returns Sanitized user-friendly message
 */
export function mapDeclineCodeToUserMessage(declineCode?: string): string {
    if (!declineCode) {
        return "Your card was declined.";
    }
    return DECLINE_CODE_MESSAGES[declineCode] || "Your card was declined.";
}

/**
 * Story 6.4: Card declined error with user-friendly messaging
 * Returns 402 Payment Required per frontend contract
 */
export class CardDeclinedError extends Error {
    public readonly code = "PAYMENT_DECLINED" as const;
    public readonly type = "payment_error" as const;
    public readonly stripeCode: string;
    public readonly declineCode?: string;
    public readonly userMessage: string;
    public readonly retryable: boolean;

    constructor(message: string, stripeCode: string, declineCode?: string) {
        super(message);
        this.name = "CardDeclinedError";
        this.stripeCode = stripeCode;
        this.declineCode = declineCode;
        this.userMessage = mapDeclineCodeToUserMessage(declineCode);
        this.retryable = declineCode ? RETRYABLE_DECLINE_CODES.has(declineCode) : false;
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

/**
 * Story 6.3: Order locked for capture error
 * Thrown when attempting to edit an order that is currently being captured
 * Returns 409 Conflict per AC 6, 7
 */
export class OrderLockedError extends Error {
    public readonly code = "ORDER_LOCKED" as const;
    public readonly httpStatus = 409;
    public readonly orderId: string;

    constructor(orderId: string) {
        super(`Order is processing and cannot be edited`);
        this.name = "OrderLockedError";
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
    // TAX-01: Fetch tax_total and subtotal for order-level tax recalculation
    // PAY-01: Fetch payment_collections to update amount
    const { data: orders } = await query.graph({
        entity: "order",
        fields: [
            "id", 
            "status", 
            "total", 
            "tax_total", 
            "subtotal", 
            "currency_code", 
            "metadata", 
            "items.*",
            "payment_collections.id", // Fetch linked payment collections
            "payment_collections.status"
        ],
        filters: { id: input.orderId },
    });

    if (!orders.length) {
        throw new OrderNotFoundError(input.orderId);
    }

    const order = orders[0];
    const paymentCollection = order.payment_collections?.[0]; // Assume the first/primary one

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

    // Story 6.3: Check if order is locked for capture (race condition guard)
    const editStatus = order.metadata?.edit_status;
    if (editStatus === "locked_for_capture") {
        logger.warn("Edit rejected: Order locked for capture", { orderId: input.orderId });
        throw new OrderLockedError(input.orderId);
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

        logger.info("Stock check passed", {
            variantId: input.variantId,
            availableStock: totalAvailableStock,
            locationCount: inventoryLevels.length,
            requested: input.quantity
        });
    }

    logger.info("Preconditions validated", { orderId: input.orderId });

    return {
        valid: true,
        orderId: input.orderId,
        paymentIntentId,
        paymentCollectionId: paymentCollection?.id, // Return ID if found
        order: {
            id: order.id,
            status: order.status,
            total: order.total,
            tax_total: order.tax_total || 0,
            subtotal: order.subtotal || 0,
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
 * Step to update the PaymentCollection amount
 * ENSURES Medusa's payment record stays in sync with Stripe PI and Order totals
 */
export async function updatePaymentCollectionHandler(
    input: {
        paymentCollectionId: string;
        amount: number;
        currencyCode?: string;
    },
    context: { container: any }
): Promise<void> {
    const { container } = context;

    // NOTE: Medusa v2 IPaymentModuleService type is available but has complex overloaded signatures
    // Using the resolved service directly - the updatePaymentCollections method signature is:
    // updatePaymentCollections(id: string, data: PaymentCollectionUpdatableFields, sharedContext?: Context)
    const paymentModuleService = container.resolve(Modules.PAYMENT);

    // Update the payment collection itself
    // Medusa v2: updatePaymentCollections(id, data, sharedContext?)
    await paymentModuleService.updatePaymentCollections(
        input.paymentCollectionId,
        { amount: input.amount }
    );

    // Note: If we had a direct reference to the payment session, we might want to update it excessively,
    // but typically updating the collection is the canonical sync in Medusa v2.
    // The Stripe provider logic in Medusa usually pulls from the upstream or manages the session update via collection update if configured.
    // Since we manually updated Stripe PI in incrementStripeAuthStep, the provider side is "done".
    // We just need Medusa records to match.

    logger.info("Updated PaymentCollection", {
        paymentCollectionId: input.paymentCollectionId,
        amount: input.amount
    });
}

export const updatePaymentCollectionStep = createStep(
    "update-payment-collection-add-item",
    async (
        input: {
            paymentCollectionId: string | undefined;
            amount: number;
            previousAmount?: number;
        },
        { container }
    ) => {
        if (!input.paymentCollectionId) {
            logger.warn("No PaymentCollection ID found, skipping update (legacy order?)");
            return new StepResponse({ updated: false, paymentCollectionId: "", previousAmount: 0 });
        }

        // Use previousAmount from input (caller should provide it)
        const previousAmount = input.previousAmount || 0;

        await updatePaymentCollectionHandler({
             paymentCollectionId: input.paymentCollectionId,
             amount: input.amount
        }, { container });

        return new StepResponse(
            { updated: true, paymentCollectionId: input.paymentCollectionId, previousAmount },
            { paymentCollectionId: input.paymentCollectionId, previousAmount }
        );
    },
    // Compensation: rollback PaymentCollection amount if downstream steps fail
    async (compensation, { container }) => {
        if (!compensation || !compensation.paymentCollectionId) {
            return;
        }

        // NOTE: Medusa v2 IPaymentModuleService type is available but has complex overloaded signatures
        // Using the resolved service directly - the updatePaymentCollections method signature is:
        // updatePaymentCollections(id: string, data: PaymentCollectionUpdatableFields, sharedContext?: Context)
        const paymentModuleService = container.resolve(Modules.PAYMENT);

        try {
            await paymentModuleService.updatePaymentCollections(
                compensation.paymentCollectionId,
                { amount: compensation.previousAmount }
            );
            logger.info("add-item-to-order", "Rolled back PaymentCollection", {
                paymentCollectionId: compensation.paymentCollectionId,
                previousAmount: compensation.previousAmount
            });
        } catch (rollbackError) {
            // CRITICAL: PaymentCollection rollback failure means payment state is inconsistent
            // This requires immediate attention as PaymentCollection amount may be out of sync
            logger.critical("add-item-to-order", "Failed to rollback PaymentCollection - payment state inconsistent", {
                paymentCollectionId: compensation.paymentCollectionId,
                previousAmount: compensation.previousAmount,
                alert: "CRITICAL",
                issue: "PAYMENT_COLLECTION_ROLLBACK_FAILED",
                actionRequired: "Manual reconciliation required - PaymentCollection amount may be incorrect",
                error: (rollbackError as Error).message,
            }, rollbackError instanceof Error ? rollbackError : new Error(String(rollbackError)));
            
            // Re-throw to ensure workflow rollback continues, but critical alert is logged
            throw rollbackError;
        }
    }
);


/**
 * Step 2: Calculate Order Totals (Tax, Shipping)
 *
 * TAX-01: Tax calculation using Medusa's calculated_price as source of truth.
 * - For tax-inclusive regions: calculated_amount_with_tax includes tax
 * - For tax-exclusive regions: tax is added separately via tax_total
 * - Tax amount per item is calculated and stored in added_items metadata
 *
 * Per Medusa v2 pricing: calculated_price represents the final price with tax provider logic applied.
 *
 * Handler exported for unit testing.
 */
export async function calculateTotalsHandler(
    input: CalculateTotalsInput,
    context: { container: any }
): Promise<TotalsResult> {
    const query = context.container.resolve("query");

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

    // Validate currency matches between order and variant price
    if (price.currency_code && price.currency_code.toLowerCase() !== input.currencyCode.toLowerCase()) {
        throw new Error(
            `Currency mismatch: Order uses ${input.currencyCode} but variant price is in ${price.currency_code}`
        );
    }

    // TAX-01: Calculate tax for the added items
    // 
    // Tax calculation handles both tax-inclusive and tax-exclusive regions:
    // - Tax-inclusive: calculated_amount_with_tax includes tax in the price
    //   - unitPrice = calculated_amount_with_tax (price already includes tax)
    //   - taxPerUnit = tax_total (tax component for tracking/reporting)
    //   - Note: In tax-inclusive regions, taxAmount is tracked separately for accounting
    //     but the price already includes it, so newOrderTotal is correct
    // - Tax-exclusive: calculated_amount is base price, tax is added separately
    //   - unitPrice = calculated_amount_with_tax (base + tax)
    //   - taxPerUnit = tax_total (tax added on top of base price)
    //
    // tax_total is per unit, multiply by quantity for total tax of this addition
    const unitPrice = price.calculated_amount_with_tax || price.calculated_amount;
    const taxPerUnit = price.tax_total || 0;
    const taxAmount = taxPerUnit * input.quantity; // Total tax for all units (quantity * per-unit tax)
    
    // itemTotal uses unitPrice which includes tax (calculated_amount_with_tax)
    // This is correct for Stripe PaymentIntent amount which should include tax
    const itemTotal = unitPrice * input.quantity;
    
    // For subtotal calculation (if needed in future), use:
    // const itemSubtotal = price.calculated_amount * input.quantity; // Base price without tax
    
    const newOrderTotal = input.currentTotal + itemTotal;
    const difference = itemTotal;
    const variantTitle = `${variant.product?.title || ""} - ${variant.title || ""}`.trim();

    logger.info("TAX-01: Calculated totals", {
        variantId: input.variantId,
        unitPrice,
        taxPerUnit,
        totalTax: taxAmount,
        itemTotal,
        newTotal: newOrderTotal,
        quantity: input.quantity
    });

    return {
        variantId: input.variantId,
        variantTitle,
        quantity: input.quantity,
        unitPrice,
        taxAmount,
        itemTotal,
        newOrderTotal,
        difference,
    };
}

const calculateTotalsStep = createStep(
    "calculate-totals",
    async (input: CalculateTotalsInput, { container }): Promise<StepResponse<TotalsResult>> => {
        const result = await calculateTotalsHandler(input, { container });
        return new StepResponse(result);
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
            currencyCode: string;
        }
    ): Promise<StepResponse<StripeIncrementResult>> => {
        const difference = input.newAmount - input.currentAmount;

        if (difference <= 0) {
            logger.info("Skipping Stripe increment (no increase)", {
                difference,
                currentAmount: input.currentAmount,
                newAmount: input.newAmount
            });
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

            logger.info("Stripe authorization incremented", {
                paymentIntentId: input.paymentIntentId,
                previousAmount: input.currentAmount,
                newAmount: input.newAmount,
                difference: input.newAmount - input.currentAmount
            });

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
                // Story 6.4: Emit metric for decline tracking
                logger.metric("payment_increment_decline_count", 1, {
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

            if (
                error instanceof Stripe.errors.StripeIdempotencyError ||
                (error as any).type === "idempotency_error"
            ) {
                logger.info("Idempotency collision detected, fetching current state", {
                    paymentIntentId: input.paymentIntentId,
                    idempotencyKey
                });
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
    },
    // Compensation: rollback PI amount if downstream steps fail
    async (prev?: StripeIncrementResult) => {
        if (!prev || prev.skipped) {
            return;
        }

        const stripe = getStripeClient();
        const rollbackKey = prev.idempotencyKey ? `${prev.idempotencyKey}-rollback` : undefined;

        try {
            await stripe.paymentIntents.update(
                prev.paymentIntentId,
                { amount: prev.previousAmount },
                rollbackKey ? { idempotencyKey: rollbackKey } : undefined
            );
            logger.info("Rolled back Stripe authorization in compensation", {
                paymentIntentId: prev.paymentIntentId,
                previousAmount: prev.previousAmount,
                idempotencyKey: rollbackKey
            });
        } catch (rollbackError) {
            logger.error("Failed to rollback Stripe authorization", {
                paymentIntentId: prev.paymentIntentId,
                error: (rollbackError as Error).message
            });
            throw rollbackError;
        }
    }
);

/**
 * Step 4: Update Order Values (DB Commit)
 *
 * TAX-01: Tracks tax in metadata for added items during grace period.
 * Note: Order tax_total and subtotal are computed fields in Medusa v2, calculated
 * from line items. We store tax info in metadata for tracking until these additions
 * are converted to actual line items (e.g., during capture or final reconciliation).
 */
export async function updateOrderValuesHandler(
    input: {
        orderId: string;
        paymentIntentId: string;
        variantId: string;
        variantTitle: string;
        quantity: number;
        unitPrice: number;
        itemTotal: number;
        taxAmount: number;
        newTotal: number;
        stripeIncrementSucceeded: boolean;
        currentOrderMetadata: Record<string, any>;
    },
    context: { container: any }
): Promise<{ success: boolean; orderId: string; orderWithItems?: any }> {
    const { container } = context;
    const orderService = container.resolve("order");
    // const inventoryService = container.resolve("inventoryService"); // If needed later

    try {
        // TAX-01: Prepare the line item object
        // Note: quantity * unit_price is handled by Medusa or passed as needed.
        // For createLineItems, we typically pass variant_id, quantity, and potentially metadata/overrides.
        const lineItemData = {
            variant_id: input.variantId,
            title: input.variantTitle,
            quantity: input.quantity,
            // If we need to override price or set custom tax amount:
            unit_price: input.unitPrice, 
            metadata: {
                // TAX-01: Store specific tax amount if needed for reconciliation, 
                // though Medusa v2 might calculate it automatically.
                tax_amount: input.taxAmount,
                // created_via: "add-item-workflow" // Optional tracking
            }
        };

        // Create the actual Line Item in Medusa
        // This is superior to metadata tracking as it integrates with fulfillment/inventory
        try {
            await orderService.createLineItems(input.orderId, [lineItemData]);
        } catch (createError: any) {
            // Enhanced error handling for createLineItems failures
            const errorMessage = createError?.message || String(createError);
            
            // Check for common failure scenarios
            if (errorMessage.includes("variant") && errorMessage.includes("not found")) {
                logger.error("add-item-to-order", "Variant not found when creating line item", {
                    orderId: input.orderId,
                    variantId: input.variantId,
                }, createError instanceof Error ? createError : new Error(errorMessage));
                throw new VariantNotFoundError(input.variantId);
            }
            
            if (errorMessage.includes("order") && (errorMessage.includes("not found") || errorMessage.includes("does not exist"))) {
                logger.error("add-item-to-order", "Order not found when creating line item", {
                    orderId: input.orderId,
                }, createError instanceof Error ? createError : new Error(errorMessage));
                throw new OrderNotFoundError(input.orderId);
            }
            
            if (errorMessage.includes("duplicate") || errorMessage.includes("already exists")) {
                logger.warn("add-item-to-order", "Duplicate line item creation attempted", {
                    orderId: input.orderId,
                    variantId: input.variantId,
                    quantity: input.quantity,
                });
                // If duplicate, retrieve existing order and return it
                const existingOrder = await orderService.retrieve(input.orderId, {
                    relations: ["items"],
                });
                return {
                    success: true,
                    orderId: input.orderId,
                    orderWithItems: existingOrder,
                };
            }
            
            if (errorMessage.includes("state") || errorMessage.includes("status")) {
                logger.error("add-item-to-order", "Order state conflict when creating line item", {
                    orderId: input.orderId,
                    error: errorMessage,
                }, createError instanceof Error ? createError : new Error(errorMessage));
                throw new InvalidOrderStateError(input.orderId, "unknown");
            }
            
            // Generic error - log with context and rethrow
            logger.error("add-item-to-order", "Failed to create line item", {
                orderId: input.orderId,
                variantId: input.variantId,
                quantity: input.quantity,
                error: errorMessage,
            }, createError instanceof Error ? createError : new Error(errorMessage));
            throw createError;
        }

        // Clean up metadata: Remove added_items if it exists, since we are now using real items
        // Also update the total explicitly if needed, or let Medusa calculate it.
        // The requirement says "Update Order Total: Ensure the core order.total is updated".
        // createLineItems should trigger recalculation, but we might need to enforce the specific newTotal from our calculation step if we trust it more
        // or just update metadata.updated_total as a legacy/reference field.
        
        const metadataUpdate: Record<string, any> = {
            ...input.currentOrderMetadata,
            updated_total: input.newTotal,
            last_modified: new Date().toISOString(),
        };

        // Remove added_items from metadata to avoid confusion/duplication
        delete metadataUpdate.added_items;

        await orderService.updateOrders([
            {
                id: input.orderId,
                metadata: metadataUpdate,
                // Keep order as system of record; align DB totals with recalculated values
                total: input.newTotal,
            },
        ]);

        // Retrieve authoritative order with items to return accurate state (line item ids, totals)
        const updatedOrder = await orderService.retrieve(input.orderId, {
            relations: ["items"],
        });

        logger.info("TAX-01: Order updated with line item", {
            orderId: input.orderId,
            variantId: input.variantId,
            quantity: input.quantity,
            newTotal: input.newTotal,
            metadataCleanedUp: true
        });

        return {
            success: true,
            orderId: input.orderId,
            orderWithItems: updatedOrder,
        };
    } catch (error) {
        if (input.stripeIncrementSucceeded) {
            const criticalError = new AuthMismatchError(
                input.orderId,
                input.paymentIntentId,
                `DB commit failed after Stripe increment. Amount: ${input.newTotal}. Error: ${(error as Error).message}`
            );

            logger.error("🚨 CRITICAL AUDIT ALERT - AUTH_MISMATCH_OVERSOLD 🚨", {
                alert: "CRITICAL",
                issue: "AUTH_MISMATCH_OVERSOLD",
                orderId: input.orderId,
                paymentIntentId: input.paymentIntentId,
                intendedAmount: input.newTotal,
                error: (error as Error).message,
                actionRequired: "Manual reconciliation required"
            });

            throw criticalError;
        }

        throw error;
    }
}

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
            taxAmount: number;
            newTotal: number;
            stripeIncrementSucceeded: boolean;
            currentOrderMetadata: Record<string, any>;
        },
        { container }
    ): Promise<StepResponse<{ success: boolean; orderId: string }>> => {
        const result = await updateOrderValuesHandler(input, { container });
        return new StepResponse(result);
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

        // TAX-01: Pass current tax_total and subtotal for recalculation
        const totalsInput = transform({ validation, input }, (data) => ({
            orderId: data.input.orderId,
            variantId: data.input.variantId,
            quantity: data.input.quantity,
            // Use order as source of truth; payment intent is downstream mirror
            currentTotal: data.validation.order.total,
            currentTaxTotal: data.validation.order.tax_total,
            currentSubtotal: data.validation.order.subtotal,
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
            currencyCode: data.validation.order.currency_code,
        }));
        const stripeResult = incrementStripeAuthStep(stripeInput);

        // TAX-01: Prepare inventory adjustments
        // We do this here as we are about to commit the changes.
        // ORD-01: Explicitly reserve inventory
        const inventoryInput = transform({ input }, (data) => ({
            variantId: data.input.variantId,
            quantity: data.input.quantity,
        }));
        const inventoryAdjustments = prepareInventoryAdjustmentsStep(inventoryInput);
        
        // Update inventory levels
        updateInventoryLevelsStep(inventoryAdjustments);

        // PAY-01: Update Payment Collection amount to stay in sync
        const pcInput = transform({ validation, totals }, (data) => ({
            paymentCollectionId: data.validation.paymentCollectionId,
            amount: data.totals.newOrderTotal,
        }));
        updatePaymentCollectionStep(pcInput);

        // TAX-01: Pass per-item tax to update step (stored in added_items metadata)
        // Note: We don't track accumulated tax_total/subtotal - only per-item tax_amount
        const updateInput = transform({ validation, totals, stripeResult, input }, (data) => ({
            orderId: data.input.orderId,
            paymentIntentId: data.validation.paymentIntentId,
            variantId: data.input.variantId,
            variantTitle: data.totals.variantTitle,
            quantity: data.input.quantity,
            unitPrice: data.totals.unitPrice,
            itemTotal: data.totals.itemTotal,
            taxAmount: data.totals.taxAmount,
            newTotal: data.totals.newOrderTotal,
            stripeIncrementSucceeded: data.stripeResult.success && !data.stripeResult.skipped,
            currentOrderMetadata: data.validation.order.metadata,
        }));
        const updateResult = updateOrderValuesStep(updateInput);

        const result = transform(
            { validation, totals, stripeResult, updateResult, input },
            (data) => {
                const authoritativeOrder = (data.updateResult as any)?.orderWithItems;
                const newItem =
                    authoritativeOrder?.items?.find(
                        (item: any) => item.variant_id === data.input.variantId && item.quantity === data.input.quantity
                    ) ??
                    {
                        variant_id: data.input.variantId,
                        title: data.totals.variantTitle,
                        quantity: data.input.quantity,
                        unit_price: data.totals.unitPrice,
                        total: data.totals.itemTotal,
                    };
                return {
                    order:
                        authoritativeOrder && authoritativeOrder.items
                            ? authoritativeOrder
                            : {
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
