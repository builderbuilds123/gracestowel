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
    createReservationsWorkflow,
} from "@medusajs/core-flows";
import { logger } from "../utils/logger";
import { formatModificationWindow } from "../lib/payment-capture-queue";

// ============================================================================
// Input/Output Types
// ============================================================================

export interface BatchItemAction {
    action: 'add' | 'remove' | 'update_quantity';
    variant_id: string;
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

interface ItemTotalsResult {
    variantId: string;
    variantTitle: string;
    quantity: number;
    unitPrice: number;
    itemTotal: number;
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
}

interface BatchEditResult {
    orderChangeId: string;
    itemsAdded: number;
    newLineItemIds: string[];
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

        // 4. Get PaymentIntent ID
        let paymentIntentId = order.metadata?.stripe_payment_intent_id as string | undefined;

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

        // 6. Validate stock for all items being added
        const addItems = input.items.filter(i => i.action === 'add');
        const failedItems: Array<{ variant_id: string; reason: string }> = [];

        for (const item of addItems) {
            const { data: variants } = await query.graph({
                entity: "product_variant",
                fields: ["id", "title", "inventory_items.inventory_item_id"],
                filters: { id: item.variant_id },
            });

            if (!variants.length) {
                failedItems.push({ variant_id: item.variant_id, reason: "Variant not found" });
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
                        variant_id: item.variant_id,
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
        });
    }
);

/**
 * Step 2: Calculate totals for all items
 */
const calculateBatchTotalsStep = createStep(
    "calculate-batch-totals",
    async (
        input: {
            items: BatchItemAction[];
            currentTotal: number;
            currencyCode: string;
        },
        { container }
    ): Promise<StepResponse<BatchTotalsResult>> => {
        const query = container.resolve(ContainerRegistrationKeys.QUERY);

        const itemResults: ItemTotalsResult[] = [];
        let totalDifference = 0;

        for (const item of input.items) {
            if (item.action !== 'add') continue;

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
                variantId: item.variant_id,
                variantTitle: `${variant.product?.title || ""} - ${variant.title || ""}`.trim(),
                quantity: item.quantity,
                unitPrice,
                itemTotal,
            });
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
 * Step 3: Increment Stripe PaymentIntent (single update for all items)
 */
const incrementStripeBatchStep = createStep(
    "increment-stripe-batch",
    async (
        input: {
            paymentIntentId: string;
            currentAmount: number;
            newAmount: number;
            orderId: string;
            requestId: string;
        }
    ): Promise<StepResponse<BatchStripeResult>> => {
        const difference = input.newAmount - input.currentAmount;

        if (difference <= 0) {
            return new StepResponse({
                success: true,
                previousAmount: input.currentAmount,
                newAmount: input.currentAmount,
                skipped: true,
                paymentIntentId: input.paymentIntentId,
            });
        }

        const stripe = getStripeClient();
        const idempotencyKey = `batch-modify-${input.orderId}-${input.requestId}`;

        try {
            const updatedPI = await retryWithBackoff(
                async () => stripe.paymentIntents.update(
                    input.paymentIntentId,
                    { amount: input.newAmount },
                    { idempotencyKey }
                ),
                {
                    maxRetries: 3,
                    initialDelayMs: 200,
                    factor: 2,
                    shouldRetry: isRetryableStripeError,
                }
            );

            logger.info("batch-modify-order", "Stripe authorization incremented", {
                paymentIntentId: input.paymentIntentId,
                previousAmount: input.currentAmount,
                newAmount: updatedPI.amount,
            });

            return new StepResponse({
                success: true,
                previousAmount: input.currentAmount,
                newAmount: updatedPI.amount,
                skipped: false,
                paymentIntentId: input.paymentIntentId,
            });
        } catch (error) {
            if (error instanceof Stripe.errors.StripeCardError) {
                throw new CardDeclinedError(error.message, error.decline_code);
            }
            throw error;
        }
    },
    // Compensation: rollback PI amount if downstream steps fail
    async (prev?: BatchStripeResult) => {
        if (!prev || prev.skipped) return;

        const stripe = getStripeClient();
        try {
            await stripe.paymentIntents.update(prev.paymentIntentId, { amount: prev.previousAmount });
            logger.info("batch-modify-order", "Rolled back Stripe authorization", {
                paymentIntentId: prev.paymentIntentId,
                previousAmount: prev.previousAmount,
            });
        } catch (rollbackError) {
            logger.error("batch-modify-order", "Failed to rollback Stripe authorization", {
                paymentIntentId: prev.paymentIntentId,
            }, rollbackError instanceof Error ? rollbackError : new Error(String(rollbackError)));
        }
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

        // 0. Get existing line item IDs to identify new ones later
        const { data: existingOrder } = await query.graph({
            entity: "order",
            fields: ["items.id"],
            filters: { id: input.orderId },
        });
        const existingLineItemIds = new Set(
            existingOrder[0]?.items?.map((item: any) => item.id) || []
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

        // 2. Add all items to order edit
        const addItems = input.items.filter(i => i.action === 'add');
        let itemsAdded = 0;

        for (const item of addItems) {
            await orderEditAddNewItemWorkflow(container).run({
                input: {
                    order_id: input.orderId,
                    items: [{
                        variant_id: item.variant_id,
                        quantity: item.quantity,
                    }],
                },
            });
            itemsAdded++;
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
            newLineItemIds,
        });

        return new StepResponse({
            orderChangeId,
            itemsAdded,
            newLineItemIds,
            orderPreview: updatedOrder,
        });
    }
);

/**
 * Step 5: Update PaymentCollection to match new Order total
 */
const updateBatchPaymentCollectionStep = createStep(
    "update-batch-payment-collection",
    async (
        input: {
            paymentCollectionId: string | undefined;
            amount: number;
            previousAmount: number;
        },
        { container }
    ) => {
        if (!input.paymentCollectionId) {
            return new StepResponse({ updated: false, paymentCollectionId: "", previousAmount: 0 });
        }

        const paymentModuleService = container.resolve(Modules.PAYMENT);
        await paymentModuleService.updatePaymentCollections(
            input.paymentCollectionId,
            { amount: input.amount }
        );

        logger.info("batch-modify-order", "Updated PaymentCollection", {
            paymentCollectionId: input.paymentCollectionId,
            amount: input.amount,
        });

        return new StepResponse(
            { updated: true, paymentCollectionId: input.paymentCollectionId, previousAmount: input.previousAmount },
            { paymentCollectionId: input.paymentCollectionId, previousAmount: input.previousAmount }
        );
    },
    async (compensation, { container }) => {
        if (!compensation || !compensation.paymentCollectionId) return;

        const paymentModuleService = container.resolve(Modules.PAYMENT);
        await paymentModuleService.updatePaymentCollections(
            compensation.paymentCollectionId,
            { amount: compensation.previousAmount }
        );
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

        // Step 2: Calculate totals for all items
        const totalsInput = transform({ validation, input }, (data) => ({
            items: data.input.items,
            currentTotal: data.validation.order.total,
            currencyCode: data.validation.order.currency_code,
        }));
        const totals = calculateBatchTotalsStep(totalsInput);

        // Step 3: Single Stripe PI update for total difference
        const stripeInput = transform({ validation, totals, input }, (data) => ({
            paymentIntentId: data.validation.paymentIntentId,
            currentAmount: data.validation.paymentIntent.amount,
            newAmount: data.totals.newOrderTotal,
            orderId: data.input.orderId,
            requestId: data.input.requestId,
        }));
        const stripeResult = incrementStripeBatchStep(stripeInput);

        // Step 4: Execute batch order edit
        const editInput = transform({ validation, input }, (data) => ({
            orderId: data.input.orderId,
            items: data.input.items,
            userId: "guest_user",
        }));
        const editResult = executeBatchOrderEditStep(editInput);

        // Step 5: Update PaymentCollection
        const pcInput = transform({ validation, totals }, (data) => ({
            paymentCollectionId: data.validation.paymentCollectionId,
            amount: data.totals.newOrderTotal,
            previousAmount: data.validation.order.total,
        }));
        updateBatchPaymentCollectionStep(pcInput);

        // Step 6: Create inventory reservations for new line items
        const reservationInput = transform({ editResult, input }, (data) => ({
            orderId: data.input.orderId,
            newLineItemIds: data.editResult.newLineItemIds,
        }));
        const reservationResult = createBatchReservationsStep(reservationInput);

        // Build final result
        const result = transform(
            { validation, totals, stripeResult, editResult, reservationResult, input },
            (data) => ({
                order: data.editResult.orderPreview,
                items_added: data.editResult.itemsAdded,
                order_change_id: data.editResult.orderChangeId,
                payment_status: data.stripeResult.skipped ? "unchanged" : "succeeded",
                total_difference: data.totals.totalDifference,
                reservations_created: data.reservationResult.reservationCount,
            })
        );

        return new WorkflowResponse(result);
    }
);

export default batchModifyOrderWorkflow;
