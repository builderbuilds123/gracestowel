import {
    createStep,
    createWorkflow,
    StepResponse,
    WorkflowResponse,
    transform,
} from "@medusajs/framework/workflows-sdk";
import { ContainerRegistrationKeys, Modules, QueryContext } from "@medusajs/framework/utils";
import { getStripeClient } from "../utils/stripe";
import { modificationTokenService } from "../services/modification-token";
import {
    beginOrderEditOrderWorkflow,
    orderEditAddNewItemWorkflow,
    orderEditUpdateItemQuantityWorkflow,
    createReservationsWorkflow,
} from "@medusajs/core-flows";
import { logger } from "../utils/logger";
import { formatModificationWindow } from "../lib/payment-capture-queue";
import { supplementaryChargeWorkflow } from "./supplementary-charge";

// ============================================================================
// Input/Output Types
// ============================================================================

export interface BatchItemAction {
    action: 'add' | 'remove' | 'update_quantity';
    variant_id?: string;   // Required for 'add', optional for 'update_quantity'
    item_id?: string;      // Required for 'update_quantity' (line item ID)
    quantity: number;
}

export interface BatchModifyOrderInput {
    orderId: string;
    modificationToken: string;
    items: BatchItemAction[];
    requestId: string;
}

interface BatchValidationResult {
    valid: boolean;
    orderId: string;
    paymentIntentId: string;
    paymentCollectionId?: string;
    paymentSessionId?: string;
    order: {
        id: string;
        status: string;
        total: number;
        tax_total: number;
        subtotal: number;
        currency_code: string;
        customer_id?: string | null;
        region_id?: string | null;
        email?: string | null;
        metadata: Record<string, any>;
        items: any[];
    };
    paymentIntent: {
        id: string;
        status: string;
        amount: number;
    };
    totalAuthorizedCents: number;
}

interface ItemTotalsResult {
    variantId: string;
    variantTitle: string;
    quantity: number;
    unitPrice: number;
    itemTotal: number;
    // Fields for update_quantity action
    isQuantityUpdate?: boolean;
    lineItemId?: string;
    oldQuantity?: number;
}

interface BatchTotalsResult {
    items: ItemTotalsResult[];
    totalDifference: number;
    newOrderTotal: number;
}

interface BatchStripeResult {
    success: boolean;
    previousAmount: number;
    newAmount: number;
    skipped: boolean;
    paymentIntentId: string;
    /** If true, incremental auth wasn't supported - requires supplementary charge at capture */
    requiresSupplementaryCharge?: boolean;
    /** Amount that still needs to be authorized/captured separately */
    supplementaryAmount?: number;
}

interface QuantityUpdateInfo {
    lineItemId: string;
    variantId: string;
    oldQuantity: number;
    newQuantity: number;
}

interface BatchEditResult {
    orderChangeId: string;
    itemsAdded: number;
    itemsUpdated: number;
    newLineItemIds: string[];
    quantityUpdates: QuantityUpdateInfo[];
    orderPreview: any;
}

// ============================================================================
// Error Classes
// ============================================================================

export class BatchValidationError extends Error {
    public readonly code: string;
    public readonly failedItems?: Array<{ variant_id: string; reason: string }>;

    constructor(message: string, code: string, failedItems?: Array<{ variant_id: string; reason: string }>) {
        super(message);
        this.name = "BatchValidationError";
        this.code = code;
        this.failedItems = failedItems;
    }
}

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

    constructor(expectedOrderId: string, actualOrderId: string) {
        super(`Token does not match this order`);
        this.name = "TokenMismatchError";
    }
}

export class InvalidOrderStateError extends Error {
    public readonly code = "INVALID_ORDER_STATE" as const;
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
    public readonly code = "INVALID_PAYMENT_STATE" as const;
    public readonly paymentIntentId: string;
    public readonly status: string;

    constructor(paymentIntentId: string, status: string) {
        super(`PaymentIntent ${paymentIntentId} is not in requires_capture state: ${status}`);
        this.name = "InvalidPaymentStateError";
        this.paymentIntentId = paymentIntentId;
        this.status = status;
    }
}

export class OrderLockedError extends Error {
    public readonly code = "ORDER_LOCKED" as const;

    constructor(orderId: string) {
        super(`Order is processing and cannot be edited`);
        this.name = "OrderLockedError";
    }
}

export class CardDeclinedError extends Error {
    public readonly code = "PAYMENT_DECLINED" as const;
    public readonly userMessage: string;
    public readonly declineCode?: string;
    public readonly retryable: boolean;

    constructor(message: string, declineCode?: string) {
        super(message);
        this.name = "CardDeclinedError";
        this.declineCode = declineCode;
        this.userMessage = declineCode === "insufficient_funds"
            ? "Insufficient funds."
            : "Your card was declined.";
        this.retryable = declineCode === "insufficient_funds" || declineCode === "processing_error";
    }
}

// ============================================================================
// Workflow Steps
// ============================================================================

/**
 * Step 1: Validate batch preconditions
 */
const validateBatchPreconditionsStep = createStep(
    "validate-batch-preconditions",
    async (
        input: { orderId: string; modificationToken: string; items: BatchItemAction[] },
        { container }
    ): Promise<StepResponse<BatchValidationResult>> => {
        const query = container.resolve(ContainerRegistrationKeys.QUERY);

        // 1. Validate modification token
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
                "customer_id",
                "region_id",
                "email", // Needed for Stripe Customer creation in supplementary charges
                "metadata",
                "items.*",
                "payment_collections.id",
                "payment_collections.status",
                "payment_collections.payments.id",
                "payment_collections.payments.data",
                "payment_collections.payment_sessions.id",
                "payment_collections.payment_sessions.amount",
                "payment_collections.payment_sessions.provider_id",
                "payment_collections.payment_sessions.data",
            ],
            filters: { id: input.orderId },
        });

        if (!orders.length) {
            throw new BatchValidationError("Order not found", "ORDER_NOT_FOUND");
        }

        const order = orders[0];
        const paymentCollection = order.payment_collections?.[0];

        if (order.status !== "pending") {
            throw new InvalidOrderStateError(input.orderId, order.status);
        }

        // 3. Check if order is locked for capture
        const editStatus = order.metadata?.edit_status;
        if (editStatus === "locked_for_capture") {
            throw new OrderLockedError(input.orderId);
        }

        // 4. Get PaymentIntent ID and PaymentSession ID
        let paymentIntentId = order.metadata?.stripe_payment_intent_id as string | undefined;
        let paymentSessionId: string | undefined;

        // Find Stripe payment session
        const paymentSessions = paymentCollection?.payment_sessions as any[] | undefined;
        if (paymentSessions?.length) {
            for (const session of paymentSessions) {
                if (!session) continue;
                // Check if this is a Stripe session
                if (session.provider_id === "pp_stripe" || session.provider_id === "stripe") {
                    paymentSessionId = session.id;
                    // Also try to get PaymentIntent ID from session data
                    const sessionData = session.data as Record<string, unknown> | undefined;
                    if (!paymentIntentId && sessionData?.id && typeof sessionData.id === "string" && sessionData.id.startsWith("pi_")) {
                        paymentIntentId = sessionData.id;
                    }
                    break;
                }
            }
        }

        // Fallback to payments if no session found
        if (!paymentIntentId && paymentCollection?.payments?.length) {
            for (const payment of paymentCollection.payments) {
                if (!payment) continue;
                const paymentData = payment.data as Record<string, unknown> | undefined;
                if (paymentData?.id && typeof paymentData.id === "string" && paymentData.id.startsWith("pi_")) {
                    paymentIntentId = paymentData.id;
                    break;
                }
            }
        }

        if (!paymentIntentId) {
            throw new BatchValidationError("No PaymentIntent found for order", "NO_PAYMENT_INTENT");
        }

        // 5. Validate PaymentIntent status
        const stripe = getStripeClient();
        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

        if (paymentIntent.status !== "requires_capture") {
            throw new InvalidPaymentStateError(paymentIntentId, paymentIntent.status);
        }

        // 5b. Calculate total authorized amount across ALL payment collections
        // (original PI + any existing supplementary PIs from previous modifications)
        // This prevents spurious supplementary charges when the order total decreases
        // after a previous increase that already created supplementary PIs.
        let totalAuthorizedCents = paymentIntent.amount; // Start with original PI

        if (order.payment_collections && order.payment_collections.length > 1) {
            for (let i = 1; i < order.payment_collections.length; i++) {
                const pc = order.payment_collections[i] as any;
                if (pc.status === "canceled") continue; // Skip canceled PCs
                for (const payment of (pc.payments || [])) {
                    const paymentData = payment.data as Record<string, unknown> | undefined;
                    if (paymentData?.id && typeof paymentData.id === "string" && (paymentData.id as string).startsWith("pi_")) {
                        try {
                            const suppPI = await stripe.paymentIntents.retrieve(paymentData.id as string);
                            if (suppPI.status === "requires_capture") {
                                totalAuthorizedCents += suppPI.amount;
                                logger.info("batch-modify-order", "Found existing supplementary PI", {
                                    orderId: input.orderId,
                                    supplementaryPIId: paymentData.id,
                                    amount: suppPI.amount,
                                });
                            }
                        } catch (retrieveError) {
                            logger.warn("batch-modify-order", "Failed to retrieve supplementary PI", {
                                orderId: input.orderId,
                                paymentIntentId: paymentData.id,
                                error: retrieveError instanceof Error ? retrieveError.message : String(retrieveError),
                            });
                        }
                    }
                }
            }
        }

        logger.info("batch-modify-order", "Total authorized amount calculated", {
            orderId: input.orderId,
            originalPIAmount: paymentIntent.amount,
            totalAuthorizedCents,
            paymentCollectionCount: order.payment_collections?.length || 0,
        });

        // 6. Validate stock for all items being added
        const addItems = input.items.filter(i => i.action === 'add');
        const failedItems: Array<{ variant_id: string; reason: string }> = [];

        for (const item of addItems) {
            // variant_id is guaranteed to exist for 'add' action (validated at route level)
            const variantId = item.variant_id!;

            const { data: variants } = await query.graph({
                entity: "product_variant",
                fields: ["id", "title", "inventory_items.inventory_item_id"],
                filters: { id: variantId },
            });

            if (!variants.length) {
                failedItems.push({ variant_id: variantId, reason: "Variant not found" });
                continue;
            }

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

                if (totalAvailable < item.quantity) {
                    failedItems.push({
                        variant_id: variantId,
                        reason: `Insufficient stock: ${totalAvailable} available, ${item.quantity} requested`,
                    });
                }
            }
        }

        if (failedItems.length > 0) {
            throw new BatchValidationError(
                `Stock validation failed for ${failedItems.length} item(s)`,
                "INSUFFICIENT_STOCK",
                failedItems
            );
        }

        logger.info("batch-modify-order", "Batch preconditions validated", {
            orderId: input.orderId,
            itemCount: input.items.length,
        });

        return new StepResponse({
            valid: true,
            orderId: input.orderId,
            paymentIntentId,
            paymentCollectionId: paymentCollection?.id,
            paymentSessionId,
            order: {
                id: order.id,
                status: order.status,
                total: order.total,
                tax_total: order.tax_total || 0,
                subtotal: order.subtotal || 0,
                currency_code: order.currency_code,
                customer_id: order.customer_id,
                region_id: order.region_id,
                email: order.email, // For Stripe Customer creation in supplementary charges
                metadata: order.metadata || {},
                items: order.items || [],
            },
            paymentIntent: {
                id: paymentIntent.id,
                status: paymentIntent.status,
                amount: paymentIntent.amount,
            },
            totalAuthorizedCents,
        });
    }
);

/**
 * Step 2: Calculate totals for all items
 * Handles both 'add' (new items) and 'update_quantity' (existing item changes)
 */
const calculateBatchTotalsStep = createStep(
    "calculate-batch-totals",
    async (
        input: {
            items: BatchItemAction[];
            currentTotal: number;
            currencyCode: string;
            orderItems: Array<{
                id: string;
                variant_id: string;
                quantity: number;
                unit_price: number;
                title: string;
            }>;
        },
        { container }
    ): Promise<StepResponse<BatchTotalsResult>> => {
        const query = container.resolve(ContainerRegistrationKeys.QUERY);

        const itemResults: ItemTotalsResult[] = [];
        let totalDifference = 0;

        for (const item of input.items) {
            if (item.action === 'add') {
                // Handle new item additions
                const { data: variants } = await query.graph({
                    entity: "product_variant",
                    fields: [
                        "id",
                        "title",
                        "calculated_price.calculated_amount",
                        "calculated_price.calculated_amount_with_tax",
                        "calculated_price.currency_code",
                        "product.title",
                    ],
                    filters: { id: item.variant_id },
                    context: {
                        calculated_price: QueryContext({
                            currency_code: input.currencyCode,
                        }),
                    },
                });

                if (!variants.length) {
                    throw new BatchValidationError(`Variant ${item.variant_id} not found`, "VARIANT_NOT_FOUND");
                }

                const variant = variants[0] as any;
                const price = variant.calculated_price;

                if (!price || !price.calculated_amount) {
                    throw new BatchValidationError(`No price found for variant ${item.variant_id}`, "PRICE_NOT_FOUND");
                }

                const unitPrice = price.calculated_amount_with_tax || price.calculated_amount;
                const itemTotal = unitPrice * item.quantity;
                totalDifference += itemTotal;

                itemResults.push({
                    variantId: item.variant_id!,
                    variantTitle: `${variant.product?.title || ""} - ${variant.title || ""}`.trim(),
                    quantity: item.quantity,
                    unitPrice,
                    itemTotal,
                });
            } else if (item.action === 'update_quantity' && item.item_id) {
                // Handle quantity updates to existing items
                const existingItem = input.orderItems.find(oi => oi.id === item.item_id);

                if (!existingItem) {
                    throw new BatchValidationError(`Line item ${item.item_id} not found in order`, "LINE_ITEM_NOT_FOUND");
                }

                const quantityDiff = item.quantity - existingItem.quantity;
                const priceDiff = quantityDiff * existingItem.unit_price;
                totalDifference += priceDiff;

                itemResults.push({
                    variantId: existingItem.variant_id,
                    variantTitle: existingItem.title,
                    quantity: item.quantity,
                    unitPrice: existingItem.unit_price,
                    itemTotal: priceDiff,
                    isQuantityUpdate: true,
                    lineItemId: item.item_id,
                    oldQuantity: existingItem.quantity,
                });
            }
        }

        const newOrderTotal = input.currentTotal + totalDifference;

        logger.info("batch-modify-order", "Batch totals calculated", {
            itemCount: itemResults.length,
            totalDifference,
            newOrderTotal,
        });

        return new StepResponse({
            items: itemResults,
            totalDifference,
            newOrderTotal,
        });
    }
);

/**
 * Step 3: Calculate supplementary charge amount for order modifications
 *
 * Instead of trying to increment the Stripe authorization (which requires IC+ pricing),
 * we simply calculate the difference and flag it for a supplementary charge at capture time.
 * This approach works with all Stripe accounts.
 */
const calculateSupplementaryChargeStep = createStep(
    "calculate-supplementary-charge",
    async (
        input: {
            paymentIntentId: string;
            currentAmount: number;
            newAmount: number;
            orderId: string;
        }
    ): Promise<StepResponse<BatchStripeResult>> => {
        const difference = input.newAmount - input.currentAmount;

        if (difference <= 0) {
            // No increase in order total - no supplementary charge needed
            logger.info("batch-modify-order", "No supplementary charge needed (total not increased)", {
                orderId: input.orderId,
                currentAmount: input.currentAmount,
                newAmount: input.newAmount,
            });

            return new StepResponse({
                success: true,
                previousAmount: input.currentAmount,
                newAmount: input.currentAmount,
                skipped: true,
                paymentIntentId: input.paymentIntentId,
                requiresSupplementaryCharge: false,
                supplementaryAmount: 0,
            });
        }

        // Order total increased - flag for supplementary charge at capture time
        logger.info("batch-modify-order", "Supplementary charge will be required at capture", {
            orderId: input.orderId,
            paymentIntentId: input.paymentIntentId,
            currentAmount: input.currentAmount,
            newAmount: input.newAmount,
            supplementaryAmount: difference,
        });

        return new StepResponse({
            success: true,
            previousAmount: input.currentAmount,
            newAmount: input.currentAmount, // Authorization stays at original amount
            skipped: false,
            paymentIntentId: input.paymentIntentId,
            requiresSupplementaryCharge: true,
            supplementaryAmount: difference,
        });
    }
);

/**
 * Step 4: Execute batch order edit (add all items in single session)
 */
const executeBatchOrderEditStep = createStep(
    "execute-batch-order-edit",
    async (
        input: {
            orderId: string;
            items: BatchItemAction[];
            userId: string;
        },
        { container }
    ): Promise<StepResponse<BatchEditResult>> => {
        const query = container.resolve(ContainerRegistrationKeys.QUERY);
        const orderModuleService = container.resolve(Modules.ORDER);

        // 0. Get existing line items with quantities to identify new ones and track changes
        const { data: existingOrder } = await query.graph({
            entity: "order",
            fields: ["items.id", "items.variant_id", "items.quantity"],
            filters: { id: input.orderId },
        });
        const existingLineItemIds = new Set(
            existingOrder[0]?.items?.map((item: any) => item.id) || []
        );
        // Map of line item ID -> { variant_id, quantity } for tracking quantity changes
        const existingItemInfo = new Map<string, { variantId: string; quantity: number }>(
            existingOrder[0]?.items?.map((item: any) => [
                item.id,
                { variantId: item.variant_id, quantity: Number(item.quantity) || 0 }
            ]) || []
        );

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
            orderChangeId = existingEdits[existingEdits.length - 1].id;
        } else {
            const { result: newEdit } = await beginOrderEditOrderWorkflow(container).run({
                input: {
                    order_id: input.orderId,
                    created_by: input.userId,
                    description: "Customer-initiated batch item addition",
                    internal_note: "Batch add items via storefront",
                },
            });
            orderChangeId = newEdit.id;
        }

        // 2a. Add all new items to order edit
        const addItems = input.items.filter(i => i.action === 'add');
        let itemsAdded = 0;

        for (const item of addItems) {
            await orderEditAddNewItemWorkflow(container).run({
                input: {
                    order_id: input.orderId,
                    items: [{
                        variant_id: item.variant_id!,
                        quantity: item.quantity,
                    }],
                },
            });
            itemsAdded++;
        }

        // 2b. Update quantities for existing items and track the changes
        const updateItems = input.items.filter(i => i.action === 'update_quantity' && i.item_id);
        let itemsUpdated = 0;
        const quantityUpdates: QuantityUpdateInfo[] = [];

        for (const item of updateItems) {
            const existingInfo = existingItemInfo.get(item.item_id!);
            if (existingInfo) {
                // Track the quantity change for reservation updates
                // Ensure quantities are numbers (Medusa may return BigNumber)
                quantityUpdates.push({
                    lineItemId: item.item_id!,
                    variantId: existingInfo.variantId,
                    oldQuantity: Number(existingInfo.quantity) || 0,
                    newQuantity: Number(item.quantity) || 0,
                });
            }

            await orderEditUpdateItemQuantityWorkflow(container).run({
                input: {
                    order_id: input.orderId,
                    items: [{
                        id: item.item_id!,
                        quantity: item.quantity,
                    }],
                },
            });
            itemsUpdated++;
        }

        // 3. Confirm the order change directly (without payment reconciliation)
        await orderModuleService.confirmOrderChange({
            id: orderChangeId,
            confirmed_by: input.userId,
        });

        // 4. Fetch updated order and identify new line items
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
            ],
            filters: { id: input.orderId },
        });

        // Find newly added line item IDs
        const updatedOrder = updatedOrders[0];
        const newLineItemIds = (updatedOrder?.items || [])
            .filter((item: any) => !existingLineItemIds.has(item.id))
            .map((item: any) => item.id);

        logger.info("batch-modify-order", "Batch order edit confirmed", {
            orderId: input.orderId,
            orderChangeId,
            itemsAdded,
            itemsUpdated,
            newLineItemIds,
            quantityUpdates: quantityUpdates.map(q => ({
                lineItemId: q.lineItemId,
                oldQuantity: q.oldQuantity,
                newQuantity: q.newQuantity,
            })),
        });

        return new StepResponse({
            orderChangeId,
            itemsAdded,
            itemsUpdated,
            newLineItemIds,
            quantityUpdates,
            orderPreview: updatedOrder,
        });
    }
);

interface SupplementaryChargeResult {
    created: boolean;
    paymentCollectionId?: string;
    paymentSessionId?: string;
    paymentId?: string;
}

/**
 * Step: Create supplementary PaymentCollection for the additional amount
 *
 * When the order total increases, we immediately create a new PaymentCollection
 * with a PaymentSession for the difference amount. This creates an off-session
 * Stripe PaymentIntent using the customer's saved payment method.
 *
 * The PaymentCollection is linked to the order, and the charge is authorized
 * (and can be captured) separately from the original payment.
 */
const createSupplementaryPaymentCollectionStep = createStep(
    "create-supplementary-payment-collection",
    async (
        input: {
            orderId: string;
            requiresSupplementaryCharge: boolean;
            supplementaryAmount: number;
            currencyCode: string;
            paymentIntentId: string;
            customerId?: string;
            regionId?: string;
            customerEmail?: string;
        },
        { container }
    ): Promise<StepResponse<SupplementaryChargeResult>> => {
        if (!input.requiresSupplementaryCharge || input.supplementaryAmount <= 0) {
            logger.info("batch-modify-order", "No supplementary charge needed", {
                orderId: input.orderId,
                requiresSupplementaryCharge: input.requiresSupplementaryCharge,
                supplementaryAmount: input.supplementaryAmount,
            });
            return new StepResponse({ created: false });
        }

        logger.info("batch-modify-order", "Creating supplementary PaymentCollection", {
            orderId: input.orderId,
            supplementaryAmount: input.supplementaryAmount,
            currencyCode: input.currencyCode,
        });

        try {
            // Get payment method from original PaymentIntent
            const stripe = getStripeClient();
            const originalPI = await stripe.paymentIntents.retrieve(input.paymentIntentId);

            if (!originalPI.payment_method) {
                logger.error("batch-modify-order", "Original PaymentIntent has no saved payment method", {
                    orderId: input.orderId,
                    paymentIntentId: input.paymentIntentId,
                });
                throw new Error("Original PaymentIntent has no saved payment method - cannot create supplementary charge");
            }

            const stripePaymentMethodId = typeof originalPI.payment_method === 'string'
                ? originalPI.payment_method
                : originalPI.payment_method.id;

            // Run the supplementary charge workflow
            // This creates a new PaymentCollection, links it to the order,
            // creates an off-session PaymentIntent with a Stripe Customer, and captures it
            const result = await supplementaryChargeWorkflow(container).run({
                input: {
                    orderId: input.orderId,
                    amount: input.supplementaryAmount,
                    currencyCode: input.currencyCode,
                    stripePaymentMethodId,
                    customerId: input.customerId,
                    regionId: input.regionId,
                    customerEmail: input.customerEmail,
                },
            });

            logger.info("batch-modify-order", "Supplementary PaymentCollection created", {
                orderId: input.orderId,
                paymentCollectionId: result.result?.paymentCollectionId,
                paymentSessionId: result.result?.paymentSessionId,
                paymentId: result.result?.paymentId,
            });

            return new StepResponse({
                created: true,
                paymentCollectionId: result.result?.paymentCollectionId,
                paymentSessionId: result.result?.paymentSessionId,
                paymentId: result.result?.paymentId,
            });
        } catch (error) {
            // Log error but don't fail the entire workflow
            // The order modification itself succeeded, but the supplementary charge failed
            // Handle object errors by serializing them properly
            let errorMessage = "Unknown error";
            if (error instanceof Error) {
                errorMessage = error.message;
            } else if (typeof error === 'object' && error !== null) {
                errorMessage = JSON.stringify(error, null, 2);
            } else {
                errorMessage = String(error);
            }

            logger.error("batch-modify-order", "Failed to create supplementary PaymentCollection", {
                orderId: input.orderId,
                supplementaryAmount: input.supplementaryAmount,
                errorDetails: errorMessage,
            }, error instanceof Error ? error : new Error(errorMessage));

            // Store the failure in order metadata for manual follow-up
            const orderModuleService = container.resolve(Modules.ORDER);
            const query = container.resolve("query");

            const { data: orders } = await query.graph({
                entity: "order",
                fields: ["id", "metadata"],
                filters: { id: input.orderId },
            });

            const existingMetadata = (orders?.[0]?.metadata || {}) as Record<string, unknown>;

            await orderModuleService.updateOrders([{
                id: input.orderId,
                metadata: {
                    ...existingMetadata,
                    supplementary_charge_required: true,
                    supplementary_charge_amount: input.supplementaryAmount,
                    supplementary_charge_currency: input.currencyCode,
                    supplementary_charge_failed: true,
                    supplementary_charge_error: error instanceof Error ? error.message : String(error),
                    supplementary_charge_failed_at: new Date().toISOString(),
                },
            }]);

            // Return as not created - but don't throw (order modification still succeeded)
            return new StepResponse({ created: false });
        }
    }
);

interface ReservationInput {
    inventory_item_id: string;
    location_id: string;
    quantity: number;
    line_item_id?: string;
}

interface ReservationResult {
    created: boolean;
    reservationCount: number;
    reservationIds: string[];
}

/**
 * Step 6: Create inventory reservations for newly added items
 *
 * This step reserves inventory for the new line items added to the order.
 * Without this, items would show as "Not allocated" in the admin dashboard
 * and inventory wouldn't be properly decremented.
 */
const createBatchReservationsStep = createStep(
    "create-batch-reservations",
    async (
        input: {
            orderId: string;
            newLineItemIds: string[];
        },
        { container }
    ): Promise<StepResponse<ReservationResult>> => {
        if (input.newLineItemIds.length === 0) {
            logger.info("batch-modify-order", "No new line items to reserve", {
                orderId: input.orderId,
            });
            return new StepResponse({
                created: false,
                reservationCount: 0,
                reservationIds: [],
            });
        }

        const query = container.resolve(ContainerRegistrationKeys.QUERY);

        // Step 1: Fetch line items via order.items to properly get quantity
        // In Medusa v2, quantity is in items.detail.quantity, not items.quantity directly
        const { data: orders } = await query.graph({
            entity: "order",
            fields: [
                "id",
                "items.id",
                "items.variant_id",
                "items.detail.quantity",
            ],
            filters: { id: input.orderId },
        });

        const order = orders[0];
        if (!order?.items) {
            logger.warn("batch-modify-order", "No items found on order", {
                orderId: input.orderId,
            });
            return new StepResponse({
                created: false,
                reservationCount: 0,
                reservationIds: [],
            });
        }

        // Filter to only the new line items we need to reserve
        const newLineItemIdSet = new Set(input.newLineItemIds);
        const lineItems = order.items.filter((item: any) => newLineItemIdSet.has(item.id));

        logger.info("batch-modify-order", "Fetched line items for reservation", {
            orderId: input.orderId,
            lineItemCount: lineItems.length,
            lineItems: lineItems.map((li: any) => ({
                id: li.id,
                variant_id: li.variant_id,
                quantity: li.detail?.quantity,
            })),
        });

        // Collect variant IDs to query separately
        const variantIds = lineItems
            .map((li: any) => li.variant_id)
            .filter((id: string | null) => id != null);

        if (variantIds.length === 0) {
            logger.info("batch-modify-order", "No variants found for line items", {
                orderId: input.orderId,
            });
            return new StepResponse({
                created: false,
                reservationCount: 0,
                reservationIds: [],
            });
        }

        // Step 2: Fetch variants with inventory info using "variant" entity
        const { data: variants } = await query.graph({
            entity: "variant",
            fields: [
                "id",
                "manage_inventory",
                "inventory_items.inventory_item_id",
            ],
            filters: { id: variantIds },
        });

        logger.info("batch-modify-order", "Fetched variants for inventory check", {
            variantCount: variants.length,
            variants: variants.map((v: any) => ({
                id: v.id,
                manage_inventory: v.manage_inventory,
                inventory_items: v.inventory_items?.length || 0,
            })),
        });

        // Build a map of variant_id -> inventory info
        const variantInventoryMap = new Map<string, { inventoryItemId: string | null; manageInventory: boolean }>();
        for (const variant of variants) {
            const v = variant as any;
            variantInventoryMap.set(v.id, {
                inventoryItemId: v.inventory_items?.[0]?.inventory_item_id || null,
                manageInventory: v.manage_inventory !== false, // default to true
            });
        }

        // Step 3: Get stock location from inventory levels
        // Try to find location from existing inventory levels for one of the variants
        // This is a fallback approach - get the first available stock location
        let locationId: string | null = null;

        // Query inventory levels to find a stock location with inventory for these variants
        for (const [variantId, info] of variantInventoryMap) {
            if (!info.inventoryItemId || !info.manageInventory) continue;

            const { data: inventoryLevels } = await query.graph({
                entity: "inventory_level",
                fields: ["id", "location_id", "stocked_quantity"],
                filters: { inventory_item_id: info.inventoryItemId },
            });

            if (inventoryLevels.length > 0) {
                // Use the first location that has this inventory item
                locationId = inventoryLevels[0].location_id;
                logger.info("batch-modify-order", "Found stock location from inventory levels", {
                    locationId,
                    inventoryItemId: info.inventoryItemId,
                });
                break;
            }
        }

        if (!locationId) {
            logger.warn("batch-modify-order", "No stock location found, skipping reservation", {
                orderId: input.orderId,
            });
            return new StepResponse({
                created: false,
                reservationCount: 0,
                reservationIds: [],
            });
        }

        // Step 4: Build reservation items
        const reservations: ReservationInput[] = [];

        for (const lineItem of lineItems) {
            const li = lineItem as any;
            const variantInfo = variantInventoryMap.get(li.variant_id);

            if (!variantInfo) {
                logger.warn("batch-modify-order", "Variant not found in map", {
                    variantId: li.variant_id,
                    lineItemId: li.id,
                });
                continue;
            }

            // Skip if variant doesn't manage inventory
            if (!variantInfo.manageInventory) {
                logger.info("batch-modify-order", "Variant doesn't manage inventory, skipping", {
                    variantId: li.variant_id,
                });
                continue;
            }

            if (!variantInfo.inventoryItemId) {
                logger.warn("batch-modify-order", "No inventory item for variant", {
                    variantId: li.variant_id,
                });
                continue;
            }

            // In Medusa v2, quantity is in detail.quantity
            const quantity = li.detail?.quantity;
            if (!quantity || quantity <= 0) {
                logger.warn("batch-modify-order", "Invalid quantity for line item", {
                    lineItemId: li.id,
                    quantity,
                });
                continue;
            }

            reservations.push({
                inventory_item_id: variantInfo.inventoryItemId,
                location_id: locationId,
                quantity,
                line_item_id: li.id,
            });
        }

        if (reservations.length === 0) {
            logger.info("batch-modify-order", "No items require inventory reservation after filtering", {
                orderId: input.orderId,
            });
            return new StepResponse({
                created: false,
                reservationCount: 0,
                reservationIds: [],
            });
        }

        logger.info("batch-modify-order", "Creating reservations", {
            orderId: input.orderId,
            reservationCount: reservations.length,
            locationId,
            reservations: reservations.map(r => ({
                inventory_item_id: r.inventory_item_id,
                quantity: r.quantity,
                line_item_id: r.line_item_id,
            })),
        });

        // Step 5: Use the createReservationsWorkflow to create reservations
        const { result: reservationResult } = await createReservationsWorkflow(container).run({
            input: {
                reservations,
            },
        });

        const reservationIds = reservationResult.map((r: any) => r.id);

        logger.info("batch-modify-order", "Created inventory reservations successfully", {
            orderId: input.orderId,
            reservationCount: reservationIds.length,
            locationId,
        });

        return new StepResponse({
            created: true,
            reservationCount: reservationIds.length,
            reservationIds,
        });
    },
    // Compensation: delete reservations if downstream steps fail
    async (prev, { container }) => {
        if (!prev || !prev.created || prev.reservationIds.length === 0) return;

        const inventoryModuleService = container.resolve(Modules.INVENTORY);
        try {
            await inventoryModuleService.deleteReservationItems(prev.reservationIds);
            logger.info("batch-modify-order", "Rolled back inventory reservations", {
                reservationCount: prev.reservationIds.length,
            });
        } catch (rollbackError) {
            logger.error("batch-modify-order", "Failed to rollback reservations", {
                reservationIds: prev.reservationIds,
            }, rollbackError instanceof Error ? rollbackError : new Error(String(rollbackError)));
        }
    }
);

interface ReservationUpdateResult {
    updated: boolean;
    updatedCount: number;
    createdCount: number;
}

/**
 * Step 8: Update inventory reservations for quantity changes
 *
 * When existing line items have their quantities changed, we need to update
 * the corresponding reservations. This step handles:
 * - Increasing reservation quantity when item quantity increases
 * - Decreasing reservation quantity when item quantity decreases
 * - Creating new reservations if none exist for the line item
 */
const updateBatchReservationsStep = createStep(
    "update-batch-reservations",
    async (
        input: {
            orderId: string;
            quantityUpdates: QuantityUpdateInfo[];
        },
        { container }
    ): Promise<StepResponse<ReservationUpdateResult>> => {
        if (input.quantityUpdates.length === 0) {
            logger.info("batch-modify-order", "No quantity updates for reservations", {
                orderId: input.orderId,
            });
            return new StepResponse({
                updated: false,
                updatedCount: 0,
                createdCount: 0,
            });
        }

        const query = container.resolve(ContainerRegistrationKeys.QUERY);
        const inventoryModuleService = container.resolve(Modules.INVENTORY);

        let updatedCount = 0;
        let createdCount = 0;

        for (const update of input.quantityUpdates) {
            // Ensure quantities are numbers (defensive conversion)
            const newQty = Number(update.newQuantity) || 0;
            const oldQty = Number(update.oldQuantity) || 0;
            const quantityDiff = newQty - oldQty;

            if (quantityDiff === 0 || !Number.isFinite(quantityDiff)) continue;

            // Find existing reservation for this line item
            const { data: reservations } = await query.graph({
                entity: "reservation",
                fields: ["id", "quantity", "inventory_item_id", "location_id"],
                filters: { line_item_id: update.lineItemId },
            });

            if (reservations.length > 0) {
                // Update existing reservation
                const reservation = reservations[0] as any;
                const currentReservationQty = Number(reservation.quantity) || 0;
                const newReservationQuantity = currentReservationQty + quantityDiff;

                if (newReservationQuantity <= 0) {
                    // Delete reservation if quantity becomes 0 or negative
                    await inventoryModuleService.deleteReservationItems([reservation.id]);
                    logger.info("batch-modify-order", "Deleted reservation (quantity became 0)", {
                        reservationId: reservation.id,
                        lineItemId: update.lineItemId,
                    });
                } else {
                    // Update reservation quantity
                    await inventoryModuleService.updateReservationItems([{
                        id: reservation.id,
                        quantity: newReservationQuantity,
                    }]);
                    logger.info("batch-modify-order", "Updated reservation quantity", {
                        reservationId: reservation.id,
                        lineItemId: update.lineItemId,
                        oldQuantity: currentReservationQty,
                        newQuantity: newReservationQuantity,
                    });
                }
                updatedCount++;
            } else if (quantityDiff > 0) {
                // No existing reservation and quantity increased - create new reservation
                // First, get inventory item ID for this variant
                const { data: variants } = await query.graph({
                    entity: "variant",
                    fields: ["id", "inventory_items.inventory_item_id"],
                    filters: { id: update.variantId },
                });

                const variant = variants[0] as any;
                const inventoryItemId = variant?.inventory_items?.[0]?.inventory_item_id;

                if (inventoryItemId) {
                    // Get a stock location
                    const { data: inventoryLevels } = await query.graph({
                        entity: "inventory_level",
                        fields: ["location_id"],
                        filters: { inventory_item_id: inventoryItemId },
                    });

                    if (inventoryLevels.length > 0) {
                        const locationId = inventoryLevels[0].location_id;
                        await createReservationsWorkflow(container).run({
                            input: {
                                reservations: [{
                                    inventory_item_id: inventoryItemId,
                                    location_id: locationId,
                                    quantity: newQty,
                                    line_item_id: update.lineItemId,
                                }],
                            },
                        });
                        logger.info("batch-modify-order", "Created new reservation for existing item", {
                            lineItemId: update.lineItemId,
                            quantity: newQty,
                            locationId,
                        });
                        createdCount++;
                    }
                }
            }
        }

        logger.info("batch-modify-order", "Updated reservations for quantity changes", {
            orderId: input.orderId,
            updatedCount,
            createdCount,
        });

        return new StepResponse({
            updated: true,
            updatedCount,
            createdCount,
        });
    }
    // Note: Compensation is complex for reservation updates as we'd need to track
    // the original quantities. For now, we rely on the overall workflow compensation.
);

// ============================================================================
// Workflow Definition
// ============================================================================

export const batchModifyOrderWorkflow = createWorkflow(
    "batch-modify-order",
    (input: BatchModifyOrderInput) => {
        // Step 1: Validate all preconditions
        const validation = validateBatchPreconditionsStep({
            orderId: input.orderId,
            modificationToken: input.modificationToken,
            items: input.items,
        });

        // Step 2: Calculate totals for all items (including quantity updates)
        const totalsInput = transform({ validation, input }, (data) => ({
            items: data.input.items,
            currentTotal: data.validation.order.total,
            currencyCode: data.validation.order.currency_code,
            orderItems: data.validation.order.items.map((item: any) => ({
                id: item.id,
                variant_id: item.variant_id,
                quantity: item.quantity,
                unit_price: item.unit_price,
                title: item.title,
            })),
        }));
        const totals = calculateBatchTotalsStep(totalsInput);

        // Step 3: Calculate supplementary charge if order total increased
        // Instead of trying to increment Stripe authorization (requires IC+ pricing),
        // we flag the difference for a supplementary charge at capture time
        // Note: Stripe amounts are in cents, Medusa order totals are in major units
        // Convert newOrderTotal to cents for comparison with PaymentIntent.amount
        const stripeInput = transform({ validation, totals, input }, (data) => ({
            paymentIntentId: data.validation.paymentIntentId,
            // Use total authorized across ALL PIs (original + supplementary),
            // not just the original PI. This prevents spurious supplementary charges
            // when the order total decreases after a previous increase.
            currentAmount: data.validation.totalAuthorizedCents, // cents (all uncaptured PIs)
            newAmount: Math.round(data.totals.newOrderTotal * 100), // convert to cents
            orderId: data.input.orderId,
        }));
        const stripeResult = calculateSupplementaryChargeStep(stripeInput);

        // Step 4: Execute batch order edit
        const editInput = transform({ validation, input }, (data) => ({
            orderId: data.input.orderId,
            items: data.input.items,
            userId: "guest_user",
        }));
        const editResult = executeBatchOrderEditStep(editInput);

        // PC amounts are NOT updated during edits. The capture algorithm
        // (captureAllOrderPayments) reconciles everything at capture time by:
        // 1. Fetching the real order total as source of truth
        // 2. Distributing across all uncaptured PIs (partial captures, excess cancellation)
        // This avoids PC amount drift bugs when orders are modified multiple times.

        // Step 6: Create inventory reservations for new line items
        const reservationInput = transform({ editResult, input }, (data) => ({
            orderId: data.input.orderId,
            newLineItemIds: data.editResult.newLineItemIds,
        }));
        const reservationResult = createBatchReservationsStep(reservationInput);

        // Step 7: Update reservations for quantity changes to existing items
        const reservationUpdateInput = transform({ editResult, input }, (data) => ({
            orderId: data.input.orderId,
            quantityUpdates: data.editResult.quantityUpdates,
        }));
        const reservationUpdateResult = updateBatchReservationsStep(reservationUpdateInput);

        // Step 8: Create supplementary PaymentCollection if order total increased
        // This immediately creates a new PaymentCollection with an off-session charge
        // using the customer's saved payment method from the original checkout
        const supplementaryChargeInput = transform({ stripeResult, input, validation }, (data) => ({
            orderId: data.input.orderId,
            requiresSupplementaryCharge: data.stripeResult.requiresSupplementaryCharge || false,
            supplementaryAmount: data.stripeResult.supplementaryAmount || 0,
            currencyCode: data.validation.order.currency_code,
            paymentIntentId: data.validation.paymentIntentId,
            customerId: data.validation.order.customer_id as string | undefined,
            regionId: data.validation.order.region_id as string | undefined,
            customerEmail: data.validation.order.email as string | undefined, // For Stripe Customer creation
        }));
        const supplementaryResult = createSupplementaryPaymentCollectionStep(supplementaryChargeInput);

        // Build final result
        const result = transform(
            { validation, totals, stripeResult, editResult, reservationResult, reservationUpdateResult, supplementaryResult, input },
            (data) => ({
                order: data.editResult.orderPreview,
                items_added: data.editResult.itemsAdded,
                items_updated: data.editResult.itemsUpdated,
                order_change_id: data.editResult.orderChangeId,
                payment_status: data.stripeResult.requiresSupplementaryCharge
                    ? (data.supplementaryResult.created ? "supplementary_authorized" : "supplementary_failed")
                    : data.stripeResult.skipped
                    ? "unchanged"
                    : "succeeded",
                total_difference: data.totals.totalDifference,
                reservations_created: data.reservationResult.reservationCount,
                reservations_updated: data.reservationUpdateResult.updatedCount + data.reservationUpdateResult.createdCount,
                // Supplementary PaymentCollection info
                supplementary_charge_created: data.supplementaryResult.created || false,
                supplementary_payment_collection_id: data.supplementaryResult.paymentCollectionId,
                supplementary_amount: data.stripeResult.supplementaryAmount || 0,
                requires_supplementary_charge: data.stripeResult.requiresSupplementaryCharge || false,
            })
        );

        return new WorkflowResponse(result);
    }
);

export default batchModifyOrderWorkflow;
