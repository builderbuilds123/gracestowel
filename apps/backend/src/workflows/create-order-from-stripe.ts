import {
    createStep,
    createWorkflow,
    StepResponse,
    WorkflowResponse,
    transform,
    when,
} from "@medusajs/framework/workflows-sdk";
import {
    createOrdersWorkflow,
    updateInventoryLevelsStep,
    acquireLockStep,
    releaseLockStep,
} from "@medusajs/core-flows";
import { Modules } from "@medusajs/framework/utils";
import { modificationTokenService } from "../services/modification-token";
import { InsufficientStockError } from "./add-item-to-order";

/**
 * Lock configuration constants for concurrent order creation prevention
 */
const LOCK_CONFIG = {
    /** Maximum time in seconds to wait for acquiring the lock */
    TIMEOUT_SECONDS: 30,
    /** Lock expiration time in seconds (safety mechanism) */
    TTL_SECONDS: 120,
} as const;

let inventoryDecrementService: InventoryDecrementService | null = null;

/**
 * Input for the create-order-from-stripe workflow
 */
export interface CreateOrderFromStripeInput {
    paymentIntentId: string;
    cartId: string; // Required for SEC-01
    // cartData removed - deprecated metadata flow not supported
    customerEmail?: string;
    // shippingAddress removed - should come from cart
    // shippingAmount removed - should come from cart
    amount: number;
    currency: string;
}

/**
 * SHP-01 Review Fix (Issue 10): Proper TypeScript types for shipping methods
 */
export interface ShippingMethodInput {
    shipping_option_id?: string;
    name?: string;
    amount?: number;
    data?: Record<string, unknown>;
}

export interface ShippingMethodOutput {
    shipping_option_id: string;
    name: string;
    amount: number;
    data: Record<string, unknown>;
}

/**
 * Ensure shipping methods include option ID and provider data
 * AC guard for SHP-01.
 * 
 * SHP-01 Review Fix (Issue 10): Added proper TypeScript types instead of `any`
 */
export const validateShippingMethods = (
    shippingMethods: ShippingMethodInput[] | null | undefined
): ShippingMethodOutput[] => {
    const validMethods = (shippingMethods || []).filter(
        (sm): sm is NonNullable<ShippingMethodInput> => sm != null
    );

    return validMethods.map((sm) => {
        if (!sm.shipping_option_id) {
            throw new Error("Shipping method missing shipping_option_id (SHP-01 violation)");
        }

        if (typeof sm.name !== 'string' || sm.name === '') {
            throw new Error(`Shipping method ${sm.shipping_option_id} missing name (SHP-01 violation)`);
        }

        if (typeof sm.amount !== 'number') {
            throw new Error(`Shipping method ${sm.shipping_option_id} missing amount (SHP-01 violation)`);
        }

        const hasProviderData = sm.data && Object.keys(sm.data).length > 0;
        if (!hasProviderData) {
            throw new Error(`Shipping method ${sm.shipping_option_id} missing provider data (SHP-01 AC2)`);
        }

        return {
            shipping_option_id: sm.shipping_option_id,
            name: sm.name,
            amount: sm.amount,
            data: sm.data!,
        };
    });
};

/**
 * Step to validate and prepare order data from Stripe payment
 */
const prepareOrderDataStep = createStep(
    "prepare-order-data-from-stripe",
    async (input: CreateOrderFromStripeInput, { container }) => {
        const { cartId, customerEmail, amount, currency, paymentIntentId } = input;

        // SEC-01: Strictly enforce authoritative Medusa Cart
        if (!cartId) {
            console.error(`[create-order-from-stripe] Missing cartId. Metadata flow is deprecated.`);
            throw new Error("Valid Medusa Cart ID is required for order creation.");
        }

        try {
            // Use query service to retrieve cart (Medusa v2 pattern)
            const query = container.resolve("query");
            const { data: carts } = await query.graph({
                entity: "cart",
                fields: [
                    "id",
                    "email",
                    "region_id",
                    "sales_channel_id",
                    "items.*",
                    "items.variant.*",
                    "region.*",
                    "shipping_methods.*",
                    "shipping_methods.shipping_option_id", // SHP-01: Explicitly fetch option ID
                    "shipping_address.*",
                ],
                filters: { id: cartId },
            });

            if (!carts || carts.length === 0) {
                throw new Error(`Cart ${cartId} not found`);
            }

            const cart = carts[0];

            console.log(`[create-order-from-stripe] Using authoritative Medusa Cart ${cartId}`);
            
            // Transform Medusa cart items to Order items
            // Filter out items without variant_id (required for inventory) and null items
            const items = (cart.items || [])
                .filter((item): item is NonNullable<typeof item> => item != null && item.variant_id != null)
                .map(item => ({
                    variant_id: item.variant_id as string, // Already filtered for null
                    title: item.title,
                    quantity: item.quantity,
                    unit_price: item.unit_price, // Already in correct units (cents) from Medusa
                    metadata: item.metadata || {},
                }));

            const orderData = {
                region_id: cart.region_id ?? undefined, // Convert null to undefined
                email: cart.email || customerEmail,
                items,
                shipping_address: cart.shipping_address ? {
                    first_name: cart.shipping_address.first_name,
                    last_name: cart.shipping_address.last_name,
                    address_1: cart.shipping_address.address_1,
                    address_2: cart.shipping_address.address_2,
                    city: cart.shipping_address.city,
                    province: cart.shipping_address.province,
                    postal_code: cart.shipping_address.postal_code,
                    country_code: cart.shipping_address.country_code,
                    phone: cart.shipping_address.phone,
                } : undefined,
                shipping_methods: validateShippingMethods(cart.shipping_methods as any),
                status: "pending" as const,
                sales_channel_id: cart.sales_channel_id ?? undefined, // Convert null to undefined
                currency_code: cart.region?.currency_code || currency,
                metadata: {
                    stripe_payment_intent_id: paymentIntentId,
                    source_cart_id: cartId,
                }
            };

            return new StepResponse(orderData);
        } catch (e) {
            console.error(`[create-order-from-stripe] Failed to retrieve cart ${cartId}`, e);
            throw new Error(`Failed to retrieve cart ${cartId}: ${(e as Error).message}`);
        }
    }
);

/**
 * Step to emit an event
 */
const emitEventStep = createStep(
    "emit-event",
    async (input: { eventName: string; data: any }, { container }) => {
        let eventBusModuleService: any;
        try {
            // Try multiple resolution strategies for event bus (Medusa v2 compatibility)
            try {
                eventBusModuleService = container.resolve("eventBusModuleService") as any;
            } catch {
                try {
                    eventBusModuleService = container.resolve("eventBus") as any;
                } catch {
                    // Try using Modules constant
                    const { Modules } = await import("@medusajs/framework/utils");
                    eventBusModuleService = container.resolve(Modules.EVENT_BUS) as any;
                }
            }
        } catch (err) {
            console.warn("[create-order-from-stripe] eventBus not configured, skipping emit", {
                event: input.eventName,
                error: err instanceof Error ? err.message : err,
            });
            return new StepResponse({ success: false, skipped: true });
        }

        try {
            await eventBusModuleService.emit({ name: input.eventName, data: input.data });
        } catch (err) {
            await eventBusModuleService.emit(input.eventName, input.data);
        }
        console.log(`Event ${input.eventName} emitted with data:`, input.data);
        return new StepResponse({ success: true });
    }
);

import InventoryDecrementService, { 
    CartItemForInventory, 
    AtomicInventoryInput, 
    InventoryAdjustment 
} from "../services/inventory-decrement-logic";

// Logic moved to InventoryDecrementService

/**
 * Step to prepare inventory adjustments for decrement
 *
 * This step calculates what inventory adjustments need to be made based on cart items.
 * The actual inventory update is performed by updateInventoryLevelsStep at the workflow level.
 *
 * Note: updateInventoryLevelsStep has built-in compensation that automatically restores
 * previous inventory levels if a later step in the workflow fails.
 */
const prepareInventoryAdjustmentsStep = createStep(
    "prepare-inventory-adjustments",
    async (input: AtomicInventoryInput, { container }) => {
        // Address PR feedback: Delegate logic to a dedicated service
        if (!inventoryDecrementService) {
            // Prefer DI container resolution when registered
            if (typeof container.hasRegistration === "function" && container.hasRegistration("inventoryDecrementService")) {
                inventoryDecrementService = container.resolve("inventoryDecrementService");
            } else {
                // Fallback to manual instantiation for tests/legacy contexts
                // although registration is the standard V2 way.
                const logger = container.resolve("logger");
                const query = container.resolve("query");
                const pg_connection = container.resolve("pg_connection");
                inventoryDecrementService = new InventoryDecrementService({ logger, query, pg_connection });
            }
        }
        const service = inventoryDecrementService;
        if (!service) {
            throw new Error("InventoryDecrementService not initialized");
        }
        const adjustments = await service.atomicDecrementInventory(input);
        return new StepResponse(adjustments);
    }
);

/**
 * Step to generate modification token for the order
 * This token allows customers to modify their order within a 1-hour window
 */
const generateModificationTokenStep = createStep(
    "generate-modification-token",
    async (input: { orderId: string; paymentIntentId: string; createdAt: Date | string }) => {
        // SEC-03: Runtime guard - createdAt is required to anchor token expiry
        if (!input.createdAt) {
            throw new Error("createdAt is required to anchor token expiry to order creation time");
        }
        const token = modificationTokenService.generateToken(
            input.orderId,
            input.paymentIntentId,
            input.createdAt
        );
        console.log(`Generated modification token for order ${input.orderId}`);
        return new StepResponse({ token });
    }
);

/**
 * Step to log order creation for debugging
 */
const logOrderCreatedStep = createStep(
    "log-order-created",
    async (input: { orderId: string; paymentIntentId: string; inventoryAdjusted: boolean; modificationToken: string }) => {
        console.log(`Order ${input.orderId} created from Stripe PaymentIntent ${input.paymentIntentId}`);
        if (input.inventoryAdjusted) {
            console.log(`Inventory levels adjusted for order ${input.orderId}`);
        }
        console.log(`Modification token generated (valid for 1 hour)`);
        return new StepResponse({ success: true, modificationToken: input.modificationToken });
    }
);

/**
 * PAY-01: Step to create PaymentCollection linked to order
 * 
 * Creates a PaymentCollection with:
 * - provider_id: "pp_stripe" (Stripe payment provider)
 * - Payment record containing Stripe PaymentIntent ID
 * - Initial status: "authorized" (manual capture mode)
 * 
 * AC1: Orders have a linked PaymentCollection with provider pp_stripe
 * AC2: PaymentCollection contains Payment record with Stripe PI ID in data field
 */
const createPaymentCollectionStep = createStep(
    "create-payment-collection",
    async (
        input: {
            orderId: string;
            paymentIntentId: string;
            amount: number;
            currencyCode: string;
            regionId?: string;
        },
        { container }
    ) => {
        // AI-NOTE: PAY-01 - Creates PaymentCollection for Medusa v2 canonical payment tracking

        // REVIEW FIX: Input validation for security compliance
        if (!input.amount || typeof input.amount !== 'number' || input.amount <= 0) {
            throw new Error(`Invalid amount: ${input.amount}. Amount must be a positive number.`);
        }

        if (!input.currencyCode || typeof input.currencyCode !== 'string' || input.currencyCode.length !== 3) {
            throw new Error(`Invalid currency code: ${input.currencyCode}. Must be a 3-letter ISO code.`);
        }

        if (!input.paymentIntentId || !input.paymentIntentId.startsWith('pi_')) {
            throw new Error(`Invalid Stripe PaymentIntent ID: ${input.paymentIntentId}`);
        }

        // NOTE: Medusa v2 does not export IPaymentModuleService as a public type
        // Using 'as any' is the standard pattern for resolving module services in Medusa v2
        // The service provides methods like createPaymentCollections() and createPaymentSession()
        const paymentModuleService = container.resolve(Modules.PAYMENT) as any;

        try {
            // Create payment collection with payment record
            const [paymentCollection] = await paymentModuleService.createPaymentCollections([
                {
                    amount: input.amount,
                    currency_code: input.currencyCode.toLowerCase(),
                    region_id: input.regionId,
                }
            ]);

            // REVIEW FIX (Issue #10): Validate PaymentCollection was created with expected status
            if (!paymentCollection || !paymentCollection.id) {
                throw new Error("PaymentCollection creation returned invalid result");
            }

            // Log initial status for debugging
            console.log(
                `[PAY-01] PaymentCollection created: id=${paymentCollection.id}, ` +
                `initial_status=${paymentCollection.status || 'unknown'}`
            );

            // Create payment session for the collection
            // This represents the authorized Stripe payment
            const paymentSession = await paymentModuleService.createPaymentSession(paymentCollection.id, {
                provider_id: "pp_stripe",
                amount: input.amount,
                currency_code: input.currencyCode.toLowerCase(),
                data: {
                    id: input.paymentIntentId,
                    status: "requires_capture",
                },
            });

            // REVIEW FIX (Issue #10): Validate PaymentSession was created successfully
            if (!paymentSession || !paymentSession.id) {
                throw new Error("PaymentSession creation returned invalid result");
            }

            console.log(
                `[PAY-01] Created PaymentCollection ${paymentCollection.id} with PaymentSession ${paymentSession.id} ` +
                `for order ${input.orderId} (PI: ${input.paymentIntentId}, amount: ${input.amount})`
            );

            return new StepResponse({
                paymentCollectionId: paymentCollection.id,
            });
        } catch (error) {
            // REVIEW FIX (Issue #11): Enhanced error handling with metric emission
            console.error(
                `[PAY-01][ERROR] Failed to create PaymentCollection for order ${input.orderId}:`,
                error
            );

            // Emit metric for monitoring (placeholder - integrate with your metrics system)
            console.log(
                `[METRIC] payment_collection_creation_failed ` +
                `order=${input.orderId} error=${(error as Error).name} message="${(error as Error).message}"`
            );

            // CRITICAL: Don't throw - order creation should continue even if PC fails
            // This allows graceful degradation, but logs the failure for monitoring
            // Operators should monitor the payment_collection_creation_failed metric
            return new StepResponse({
                paymentCollectionId: null,
                error: (error as Error).message,
                errorName: (error as Error).name
            });
        }
    }
);

/**
 * PAY-01: Step to link PaymentCollection to Order
 * 
 * Updates order with payment_collection_id reference
 * This establishes the relationship for canonical payment queries
 */
const linkPaymentCollectionStep = createStep(
    "link-payment-collection-to-order",
    async (
        input: { orderId: string; paymentCollectionId: string | null },
        { container }
    ) => {
        if (!input.paymentCollectionId) {
            console.warn(`[PAY-01] No PaymentCollection to link for order ${input.orderId}`);
            return new StepResponse({ linked: false });
        }

        try {
            // Use remote link to establish relationship between order and payment collection
            // NOTE: Medusa v2 does not export IRemoteLink as a public type
            // Using 'as any' is the standard pattern for resolving remoteLink service in Medusa v2
            // The service provides the create() method to establish cross-module relationships
            const remoteLink = container.resolve("remoteLink") as any;
            
            await remoteLink.create({
                [Modules.ORDER]: {
                    order_id: input.orderId,
                },
                [Modules.PAYMENT]: {
                    payment_collection_id: input.paymentCollectionId,
                },
            });

            console.log(`[PAY-01] Linked PaymentCollection ${input.paymentCollectionId} to order ${input.orderId}`);
            return new StepResponse({ linked: true });
        } catch (error) {
            console.error(`[PAY-01][ERROR] Failed to link PaymentCollection to order ${input.orderId}:`, error);
            // Don't throw - continue without link if it fails
            return new StepResponse({ linked: false, error: (error as Error).message });
        }
    }
);

/**
 * Workflow to create an order from a Stripe payment
 *
 * This workflow:
 * 1. Validates and prepares order data from Stripe payment metadata
 * 2. Creates the order using Medusa's createOrderWorkflow
 * 3. Adjusts inventory levels (decrements stock)
 * 4. PAY-01: Creates PaymentCollection with Stripe PI data
 * 5. PAY-01: Links PaymentCollection to Order
 * 6. Generates a modification token for the 1-hour modification window
 * 7. Logs the order creation
 * 8. Emits order.placed event (triggers email + payment capture scheduling)
 */
export const createOrderFromStripeWorkflow = createWorkflow(
    "create-order-from-stripe",
    (input: CreateOrderFromStripeInput) => {
        // Step 0: Acquire lock on PaymentIntent ID to prevent concurrent order creation
        // This prevents race conditions when Stripe sends duplicate webhooks
        acquireLockStep({
            key: input.paymentIntentId,
            timeout: LOCK_CONFIG.TIMEOUT_SECONDS,
            ttl: LOCK_CONFIG.TTL_SECONDS,
        });

        // Step 1: Prepare order data from Stripe payment
        const orderData = prepareOrderDataStep(input);

        // Step 2: Create the order using Medusa's built-in workflow
        const order = createOrdersWorkflow.runAsStep({
            input: orderData,
        });

        // Step 3: Prepare inventory adjustments
        const inventoryInput = transform({ orderData }, (data) => ({
            cartItems: (data.orderData.items || []).map((item: any) => ({
                variant_id: item.variant_id || "",
                quantity: item.quantity,
            })),
            preferredLocationIds: (data.orderData.shipping_methods || [])
                .map((method: any) => method?.data && (method.data as any).stock_location_id)
                .filter((id: string | undefined): id is string => Boolean(id)),
            salesChannelId: data.orderData.sales_channel_id || null,
        }));

        const inventoryAdjustments = prepareInventoryAdjustmentsStep(inventoryInput);

        // Step 4: Apply inventory adjustments using Medusa's built-in step
        // This step has automatic compensation (rollback) if any later step fails
        const updateInput = transform({ inventoryAdjustments }, (data) =>
            (data.inventoryAdjustments || []).map((adj: InventoryAdjustment) => ({
                inventory_item_id: adj.inventory_item_id,
                location_id: adj.location_id,
                stocked_quantity: adj.stocked_quantity,
            }))
        );
        updateInventoryLevelsStep(updateInput);

        const shouldAdjustInventory = transform({ inventoryAdjustments }, (data) =>
            data.inventoryAdjustments && data.inventoryAdjustments.length > 0
        );

        // Step 4b: Emit inventory.backordered event for items that went negative (AC3)
        const backorderedItems = transform({ inventoryAdjustments }, (data) =>
            (data.inventoryAdjustments || []).filter(
                (adj: InventoryAdjustment) => adj.stocked_quantity < 0
            )
        );
        const backorderEventData = transform({ backorderedItems, order }, (data) => ({
            eventName: "inventory.backordered" as const,
            data: {
                order_id: data.order?.id,
                items: data.backorderedItems.map((adj: InventoryAdjustment) => ({
                    variant_id: adj.variant_id,
                    inventory_item_id: adj.inventory_item_id,
                    location_id: adj.location_id,
                    delta: adj.previous_stocked_quantity - adj.stocked_quantity, // AC3: quantity decremented
                    new_stock: adj.stocked_quantity, // AC3: resulting stock level
                    previous_stocked_quantity: adj.previous_stocked_quantity,
                    available_quantity: adj.available_quantity,
                })),
            },
        }));
        // Conditionally emit backorder event (only if there are backordered items)
        when({ backorderedItems }, ({ backorderedItems }) => {
            return backorderedItems && backorderedItems.length > 0;
        }).then(() => {
            emitEventStep(backorderEventData).config({ name: "emit-backorder-event" });
        });

        // Step 5: PAY-01 - Create PaymentCollection for canonical payment tracking
        const paymentCollectionInput = transform({ order, input, orderData }, (data) => ({
            orderId: data.order.id,
            paymentIntentId: data.input.paymentIntentId,
            amount: data.input.amount,
            currencyCode: data.orderData.currency_code || data.input.currency,
            regionId: data.orderData.region_id,
        }));
        const paymentCollectionResult = createPaymentCollectionStep(paymentCollectionInput);

        // Step 6: PAY-01 - Link PaymentCollection to Order
        const linkInput = transform({ order, paymentCollectionResult }, (data) => ({
            orderId: data.order.id,
            paymentCollectionId: data.paymentCollectionResult.paymentCollectionId,
        }));
        linkPaymentCollectionStep(linkInput);

        // Step 7: Generate modification token for 1-hour window
        const tokenInput = transform({ order, input }, (data) => ({
            orderId: data.order.id,
            paymentIntentId: data.input.paymentIntentId,
            createdAt: new Date(data.order.created_at),
        }));
        const tokenResult = generateModificationTokenStep(tokenInput);

        // Step 8: Log the order creation
        const logInput = transform({ order, input, shouldAdjustInventory, tokenResult }, (data) => ({
            orderId: data.order.id,
            paymentIntentId: data.input.paymentIntentId,
            inventoryAdjusted: data.shouldAdjustInventory,
            modificationToken: data.tokenResult.token,
        }));
        logOrderCreatedStep(logInput);

        // Step 9: Emit order.placed event to trigger email notification and payment capture scheduling
        const eventData = transform({ order, tokenResult }, (data) => ({
            eventName: "order.placed" as const,
            data: {
                id: data.order.id,
                modification_token: data.tokenResult.token,
            },
        }));
        emitEventStep(eventData);

        // Return order with modification token
        const result = transform({ order, tokenResult }, (data) => ({
            ...data.order,
            modification_token: data.tokenResult.token,
        }));

        // Release lock after successful workflow completion
        // Note: Lock is automatically released via compensation if workflow fails
        releaseLockStep({
            key: input.paymentIntentId,
        });

        return new WorkflowResponse(result);
    }
);

export default createOrderFromStripeWorkflow;
