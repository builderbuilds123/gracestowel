import {
    createStep,
    createWorkflow,
    StepResponse,
    WorkflowResponse,
    transform,
} from "@medusajs/framework/workflows-sdk";
import { ContainerRegistrationKeys, Modules, QueryContext } from "@medusajs/framework/utils";
import Stripe from "stripe";
import { getStripeClient } from "../utils/stripe";
import { modificationTokenService } from "../services/modification-token";
import { retryWithBackoff, isRetryableStripeError } from "../utils/stripe-retry";
import {
    beginOrderEditOrderWorkflow,
    orderEditAddNewItemWorkflow,
} from "@medusajs/core-flows";
import { logger } from "../utils/logger";
import { formatModificationWindow } from "../lib/payment-capture-queue";
import { trackWorkflowEventStep } from "./steps/track-analytics-event";

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
    paymentCollectionId?: string;
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

interface OrderEditResult {
    orderChangeId: string;
    orderPreview: any;
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

export class DuplicateLineItemError extends Error {
    public readonly orderId: string;
    public readonly variantId: string;

    constructor(orderId: string, variantId: string) {
        super(
            `Duplicate line item creation detected for order ${orderId} and variant ${variantId}. ` +
                `This may indicate a retry of a partially completed workflow. Manual verification required to ` +
                `ensure payment and inventory were not already modified.`
        );
        this.name = "DuplicateLineItemError";
        this.orderId = orderId;
        this.variantId = variantId;
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
        super(`The ${formatModificationWindow()} modification window has expired`);
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

export class CurrencyMismatchError extends Error {
    public readonly code = "CURRENCY_MISMATCH" as const;
    public readonly variantId: string;
    public readonly orderCurrency: string;
    public readonly variantCurrency: string;

    constructor(variantId: string, orderCurrency: string, variantCurrency: string) {
        super(`Currency mismatch: Order uses ${orderCurrency} but variant price is in ${variantCurrency}`);
        this.name = "CurrencyMismatchError";
        this.variantId = variantId;
        this.orderCurrency = orderCurrency;
        this.variantCurrency = variantCurrency;
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
 * Handler exported for unit testing.
 */
export async function validatePreconditionsHandler(
    input: { orderId: string; modificationToken: string; variantId: string; quantity: number },
    context: { container: any }
): Promise<ValidationResult> {
    const { container } = context;
    const query = container.resolve(ContainerRegistrationKeys.QUERY);

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
        fields: [
            "id",
            "status",
            "total",
            "tax_total",
            "subtotal",
            "currency_code",
            "metadata",
            "items.*",
            "payment_collections.id",
            "payment_collections.status",
            "payment_collections.payments.id",
            "payment_collections.payments.data",
        ],
        filters: { id: input.orderId },
    });

    if (!orders.length) {
        throw new OrderNotFoundError(input.orderId);
    }

    const order = orders[0];
    const paymentCollection = order.payment_collections?.[0];

    if (order.status !== "pending") {
        throw new InvalidOrderStateError(input.orderId, order.status);
    }

    // 3. Validate PaymentIntent status
    // Try multiple sources for PaymentIntent ID
    let paymentIntentId = order.metadata?.stripe_payment_intent_id as string | undefined;

    if (!paymentIntentId && paymentCollection?.payments?.length) {
        for (const payment of paymentCollection.payments) {
            const paymentData = payment.data as Record<string, unknown> | undefined;
            if (paymentData?.id && typeof paymentData.id === "string" && paymentData.id.startsWith("pi_")) {
                paymentIntentId = paymentData.id;
                logger.info("add-item-to-order", "Found PaymentIntent via payment collection", {
                    orderId: input.orderId,
                    paymentIntentId,
                    paymentId: payment.id,
                });
                break;
            }
        }
    }

    if (!paymentIntentId) {
        logger.error("add-item-to-order", "No PaymentIntent found for order", {
            orderId: input.orderId,
            hasMetadataPI: !!order.metadata?.stripe_payment_intent_id,
            hasPaymentCollection: !!paymentCollection,
            paymentCollectionPaymentsCount: paymentCollection?.payments?.length || 0,
        });
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
        logger.warn("add-item-to-order", "Edit rejected: Order locked for capture", { orderId: input.orderId });
        throw new OrderLockedError(input.orderId);
    }

    // 4. Check inventory - SUM stock across ALL locations
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

        let totalAvailableStock = 0;
        for (const level of inventoryLevels) {
            const locationStock = (level.stocked_quantity || 0) - (level.reserved_quantity || 0);
            totalAvailableStock += Math.max(0, locationStock);
        }

        if (totalAvailableStock < input.quantity) {
            throw new InsufficientStockError(input.variantId, totalAvailableStock, input.quantity);
        }

        logger.info("add-item-to-order", "Stock check passed", {
            variantId: input.variantId,
            availableStock: totalAvailableStock,
            locationCount: inventoryLevels.length,
            requested: input.quantity,
        });
    }

    logger.info("add-item-to-order", "Preconditions validated", { orderId: input.orderId });

    return {
        valid: true,
        orderId: input.orderId,
        paymentIntentId,
        paymentCollectionId: paymentCollection?.id,
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
 * Step 2: Calculate Order Totals (Tax, Shipping)
 *
 * TAX-01: Tax calculation using Medusa's calculated_price as source of truth.
 *
 * Handler exported for unit testing.
 */
export async function calculateTotalsHandler(
    input: CalculateTotalsInput,
    context: { container: any }
): Promise<TotalsResult> {
    const query = context.container.resolve(ContainerRegistrationKeys.QUERY);

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
        context: {
            calculated_price: QueryContext({
                currency_code: input.currencyCode,
            }),
        },
    });

    if (!variants.length) {
        throw new VariantNotFoundError(input.variantId);
    }

    const variant = variants[0] as any;
    const price = variant.calculated_price;

    if (!price || !price.calculated_amount) {
        throw new PriceNotFoundError(input.variantId, input.currencyCode);
    }

    if (!price.currency_code) {
        throw new PriceNotFoundError(input.variantId, input.currencyCode);
    }

    if (price.currency_code.toLowerCase() !== input.currencyCode.toLowerCase()) {
        throw new CurrencyMismatchError(input.variantId, input.currencyCode, price.currency_code);
    }

    const unitPrice = price.calculated_amount_with_tax || price.calculated_amount;
    const taxPerUnit = price.tax_total || 0;
    const taxAmount = taxPerUnit * input.quantity;
    const itemTotal = unitPrice * input.quantity;
    const newOrderTotal = input.currentTotal + itemTotal;
    const difference = itemTotal;
    const variantTitle = `${variant.product?.title || ""} - ${variant.title || ""}`.trim();

    logger.info("add-item-to-order", "Calculated totals", {
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
 *
 * IMPORTANT: Medusa's `createOrUpdateOrderPaymentCollectionWorkflow` only updates
 * the PaymentCollection amount in Medusa, NOT the actual Stripe PaymentIntent.
 * We must manually increment the Stripe PI authorization to allow capturing the
 * increased amount.
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
            logger.info("add-item-to-order", "Skipping Stripe increment (no increase)", {
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

            logger.info("add-item-to-order", "Stripe authorization incremented", {
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
                logger.info("add-item-to-order", "Payment increment declined", {
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

            if (
                error instanceof Stripe.errors.StripeIdempotencyError ||
                (error as any).type === "idempotency_error"
            ) {
                logger.info("add-item-to-order", "Idempotency collision detected, fetching current state", {
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
            logger.info("add-item-to-order", "Rolled back Stripe authorization in compensation", {
                paymentIntentId: prev.paymentIntentId,
                previousAmount: prev.previousAmount,
                idempotencyKey: rollbackKey
            });
        } catch (rollbackError) {
            logger.error("add-item-to-order", "Failed to rollback Stripe authorization", {
                paymentIntentId: prev.paymentIntentId,
            }, rollbackError instanceof Error ? rollbackError : new Error(String(rollbackError)));
            throw rollbackError;
        }
    }
);

/**
 * Step 4: Execute Medusa Order Edit Flow
 *
 * This step uses Medusa's native order edit workflows to:
 * 1. Begin or reuse an existing order edit (OrderChange with change_type: "edit")
 * 2. Add the item using orderEditAddNewItemWorkflow (creates OrderChangeAction with action: "ITEM_ADD")
 * 3. Confirm the order change directly via orderModuleService.confirmOrderChange()
 *
 * IMPORTANT: We do NOT use confirmOrderEditRequestWorkflow because it calls
 * createOrUpdateOrderPaymentCollectionWorkflow which is designed for POST-capture
 * order edits and will CANCEL uncaptured PaymentIntents. Our use case is PRE-capture
 * modifications where the PaymentIntent is still in requires_capture state.
 *
 * This ensures proper activity tracking in Medusa's OrderChange/OrderChangeAction system
 * while preserving our Stripe PaymentIntent authorization.
 */
export async function executeOrderEditHandler(
    input: {
        orderId: string;
        variantId: string;
        quantity: number;
        userId?: string;
    },
    context: { container: any }
): Promise<OrderEditResult> {
    const { container } = context;
    const query = container.resolve(ContainerRegistrationKeys.QUERY);
    const orderModuleService = container.resolve(Modules.ORDER);
    const userId = input.userId || "guest_user";

    // 1. Check for existing active order edit or create a new one
    const { data: existingEdits } = await query.graph({
        entity: "order_change",
        fields: ["id", "status", "change_type"],
        filters: {
            order_id: input.orderId,
            change_type: "edit",
            status: ["created", "requested"],
        },
    });

    let orderChangeId: string;

    if (existingEdits.length > 0) {
        // Reuse existing order edit
        orderChangeId = existingEdits[existingEdits.length - 1].id;
        logger.info("add-item-to-order", "Reusing existing order edit", {
            orderId: input.orderId,
            orderChangeId,
        });
    } else {
        // Create new order edit using Medusa's workflow
        const { result: newEdit } = await beginOrderEditOrderWorkflow(container).run({
            input: {
                order_id: input.orderId,
                created_by: userId,
                description: "Customer-initiated item addition",
                internal_note: "Add item via storefront",
            },
        });
        orderChangeId = newEdit.id;
        logger.info("add-item-to-order", "Created new order edit", {
            orderId: input.orderId,
            orderChangeId,
        });
    }

    // 2. Add item to order edit using Medusa's workflow
    // This creates an OrderChangeAction with action: "ITEM_ADD"
    await orderEditAddNewItemWorkflow(container).run({
        input: {
            order_id: input.orderId,
            items: [{
                variant_id: input.variantId,
                quantity: input.quantity,
            }],
        },
    });

    logger.info("add-item-to-order", "Added item to order edit", {
        orderId: input.orderId,
        orderChangeId,
        variantId: input.variantId,
        quantity: input.quantity,
    });

    // 3. Confirm the order change directly using the Order Module Service
    // This applies the changes to the order WITHOUT triggering payment reconciliation.
    // We handle Stripe PaymentIntent updates separately in incrementStripeAuthStep.
    const confirmResult = await orderModuleService.confirmOrderChange({
        id: orderChangeId,
        confirmed_by: userId,
    });

    logger.info("add-item-to-order", "Order edit confirmed - item added", {
        orderId: input.orderId,
        orderChangeId,
        variantId: input.variantId,
        quantity: input.quantity,
        itemsChanged: confirmResult.items?.length || 0,
    });

    // 4. Fetch the updated order to return the current state
    const { data: updatedOrders } = await query.graph({
        entity: "order",
        fields: [
            "id",
            "status",
            "total",
            "subtotal",
            "tax_total",
            "currency_code",
            "items.*",
            "items.variant.*",
        ],
        filters: { id: input.orderId },
    });

    const updatedOrder = updatedOrders[0];

    return {
        orderChangeId,
        orderPreview: updatedOrder,
    };
}

const executeOrderEditStep = createStep(
    "execute-order-edit",
    async (
        input: {
            orderId: string;
            variantId: string;
            quantity: number;
            userId?: string;
        },
        { container }
    ): Promise<StepResponse<OrderEditResult>> => {
        const result = await executeOrderEditHandler(input, { container });
        return new StepResponse(result);
    }
    // Note: No compensation handler - Medusa's workflow already has built-in rollback
);

/**
 * Step 5: Update PaymentCollection amount to match new Order total
 *
 * After Medusa's confirmOrderEditRequestWorkflow runs, it may have created/updated
 * a PaymentCollection. We need to ensure the PaymentCollection amount matches
 * the Order total for consistency.
 */
export async function updatePaymentCollectionHandler(
    input: {
        paymentCollectionId: string;
        amount: number;
    },
    context: { container: any }
): Promise<void> {
    const { container } = context;
    const paymentModuleService = container.resolve(Modules.PAYMENT);

    await paymentModuleService.updatePaymentCollections(
        input.paymentCollectionId,
        { amount: input.amount }
    );

    logger.info("add-item-to-order", "Updated PaymentCollection", {
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
            previousAmount: number;
        },
        { container }
    ) => {
        if (!input.paymentCollectionId) {
            logger.warn("add-item-to-order", "No PaymentCollection ID found, skipping update");
            return new StepResponse({ updated: false, paymentCollectionId: "", previousAmount: 0 });
        }

        await updatePaymentCollectionHandler({
            paymentCollectionId: input.paymentCollectionId,
            amount: input.amount
        }, { container });

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
            logger.info("add-item-to-order", "Rolled back PaymentCollection", {
                paymentCollectionId: compensation.paymentCollectionId,
                previousAmount: compensation.previousAmount
            });
        } catch (rollbackError) {
            logger.critical("add-item-to-order", "Failed to rollback PaymentCollection - payment state inconsistent", {
                paymentCollectionId: compensation.paymentCollectionId,
                previousAmount: compensation.previousAmount,
                alert: "CRITICAL",
                issue: "PAYMENT_COLLECTION_ROLLBACK_FAILED",
                actionRequired: "Manual reconciliation required",
                error: (rollbackError as Error).message,
            }, rollbackError instanceof Error ? rollbackError : new Error(String(rollbackError)));
            throw rollbackError;
        }
    }
);

// ============================================================================
// Workflow Definition
// ============================================================================

export const addItemToOrderWorkflow = createWorkflow(
    "add-item-to-order",
    (input: AddItemToOrderInput) => {
        trackWorkflowEventStep({
            event: "order.edit.add_item.started",
            failureEvent: "order.edit.add_item.failed",
            properties: {
                order_id: input.orderId,
                variant_id: input.variantId,
                quantity: input.quantity,
            },
        }).config({ name: "track-order-edit-add-item-started" });

        // Step 1: Validate preconditions (token, order status, payment status, stock)
        const validation = validatePreconditionsStep({
            orderId: input.orderId,
            modificationToken: input.modificationToken,
            variantId: input.variantId,
            quantity: input.quantity,
        });

        // Step 2: Calculate totals for the new item
        const totalsInput = transform({ validation, input }, (data) => ({
            variantId: data.input.variantId,
            quantity: data.input.quantity,
            currentTotal: data.validation.order.total,
            currentTaxTotal: data.validation.order.tax_total,
            currentSubtotal: data.validation.order.subtotal,
            currencyCode: data.validation.order.currency_code,
        }));
        const totals = calculateTotalsStep(totalsInput);

        // Step 3: Increment Stripe PaymentIntent authorization
        // This must happen BEFORE the order edit to ensure we can capture the full amount
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

        // Step 4: Execute Medusa order edit flow
        // This uses Medusa's native workflows for proper activity tracking and inventory management
        const orderEditInput = transform({ validation, input }, (data) => ({
            orderId: data.input.orderId,
            variantId: data.input.variantId,
            quantity: data.input.quantity,
            userId: "guest_user",
        }));
        const orderEditResult = executeOrderEditStep(orderEditInput);

        // Step 5: Update PaymentCollection to match new order total
        const pcInput = transform({ validation, totals }, (data) => ({
            paymentCollectionId: data.validation.paymentCollectionId,
            amount: data.totals.newOrderTotal,
            previousAmount: data.validation.order.total,
        }));
        updatePaymentCollectionStep(pcInput);

        // Build final result
        // Note: orderEditResult.orderPreview contains the order state after confirmOrderEditRequestWorkflow
        // which includes the newly added items. Fall back to validation.order.items if preview is unavailable.
        const result = transform(
            { validation, totals, stripeResult, orderEditResult, input },
            (data) => {
                // The orderPreview from confirmOrderEditRequestWorkflow contains the updated order
                const orderPreview = data.orderEditResult.orderPreview;
                const updatedItems = orderPreview?.items || data.validation.order.items;
                const updatedTotal = orderPreview?.total || data.totals.newOrderTotal;

                return {
                    order: {
                        id: data.validation.orderId,
                        items: updatedItems,
                        total: updatedTotal,
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
                    order_edit: {
                        order_change_id: data.orderEditResult.orderChangeId,
                    },
                };
            }
        );

        trackWorkflowEventStep({
            event: "order.edit.add_item.succeeded",
            properties: {
                order_id: input.orderId,
                variant_id: input.variantId,
                quantity: input.quantity,
            },
        }).config({ name: "track-order-edit-add-item-succeeded" });

        return new WorkflowResponse(result);
    }
);

export default addItemToOrderWorkflow;
