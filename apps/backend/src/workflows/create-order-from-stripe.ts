import {
    createStep,
    createWorkflow,
    StepResponse,
    WorkflowResponse,
    transform,
} from "@medusajs/framework/workflows-sdk";
import { createOrdersWorkflow, updateInventoryLevelsStep } from "@medusajs/core-flows";
import type { UpdateInventoryLevelInput } from "@medusajs/types";
import { Modules } from "@medusajs/framework/utils";
import { modificationTokenService } from "../services/modification-token";

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
                shipping_methods: cart.shipping_methods?.filter((sm): sm is NonNullable<typeof sm> => sm != null).map(sm => ({
                    name: sm.name,
                    amount: sm.amount,
                    data: sm.data ?? undefined, // Convert null to undefined
                })),
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

/**
 * Interface for inventory adjustment input
 */
interface CartItemForInventory {
    variant_id: string;
    quantity: number;
}

/**
 * Step to prepare inventory adjustments from cart items
 */
const prepareInventoryAdjustmentsStep = createStep(
    "prepare-inventory-adjustments",
    async (input: { cartItems: CartItemForInventory[] }, { container }) => {
        const query = container.resolve("query");
        const adjustments: UpdateInventoryLevelInput[] = [];

        for (const item of input.cartItems) {
            if (!item.variant_id) continue;

            try {
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

                // Get the stock location for this inventory item
                const { data: inventoryLevels } = await query.graph({
                    entity: "inventory_level",
                    fields: ["id", "location_id", "inventory_item_id", "stocked_quantity"],
                    filters: { inventory_item_id: inventoryItemId },
                });

                if (!inventoryLevels.length) continue;

                const locationId = inventoryLevels[0].location_id;

                // Get current stocked quantity
                const currentStockedQuantity = inventoryLevels[0].stocked_quantity || 0;

                // Add update to reduce stock
                adjustments.push({
                    inventory_item_id: inventoryItemId,
                    location_id: locationId,
                    stocked_quantity: currentStockedQuantity - item.quantity, // Reduce stock
                });
            } catch (error) {
                console.error(`Error preparing inventory adjustment for variant ${item.variant_id}:`, error);
            }
        }

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
        // Step 1: Prepare order data from Stripe payment
        const orderData = prepareOrderDataStep(input);

        // Step 2: Create the order using Medusa's built-in workflow
        const order = createOrdersWorkflow.runAsStep({
            input: orderData,
        });

        // Step 3: Prepare inventory adjustments from cart items
        // Use items from the prepared order data (which came from authoritative cart)
        const cartItemsInput = transform({ orderData }, (data) => ({
            cartItems: data.orderData.items.map(item => ({
                variant_id: item.variant_id,
                quantity: item.quantity,
            }))
        }));
        const inventoryAdjustments = prepareInventoryAdjustmentsStep(cartItemsInput);

        // Step 4: Update inventory levels (decrement stock)
        const shouldAdjustInventory = transform({ inventoryAdjustments }, (data) =>
            data.inventoryAdjustments.length > 0
        );

        // Only adjust if there are adjustments to make
        const adjustedInventory = transform({ inventoryAdjustments, shouldAdjustInventory }, (data) => {
            if (data.shouldAdjustInventory) {
                return data.inventoryAdjustments;
            }
            return [];
        });

        // Call the inventory update step
        updateInventoryLevelsStep(adjustedInventory);

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

        return new WorkflowResponse(result);
    }
);

export default createOrderFromStripeWorkflow;
