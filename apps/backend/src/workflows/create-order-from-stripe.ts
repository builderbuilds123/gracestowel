import {
    createStep,
    createWorkflow,
    StepResponse,
    WorkflowResponse,
    transform,
} from "@medusajs/framework/workflows-sdk";
import { createOrdersWorkflow, updateInventoryLevelsStep } from "@medusajs/core-flows";
import type { UpdateInventoryLevelInput } from "@medusajs/types";
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
            const cartService = container.resolve("cart");
            const cart = await cartService.retrieve(cartId, {
                relations: ["items", "items.variant", "region", "shipping_methods", "shipping_address"]
            });

            if (!cart) {
                throw new Error(`Cart ${cartId} not found`);
            }

            console.log(`[create-order-from-stripe] Using authoritative Medusa Cart ${cartId}`);
            
            // Transform Medusa cart items to Order items
            const items = cart.items.map(item => ({
                variant_id: item.variant_id,
                title: item.title,
                quantity: item.quantity,
                unit_price: item.unit_price, // Already in correct units (cents) from Medusa
                metadata: item.metadata || {},
            }));

            const orderData = {
                region_id: cart.region_id,
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
                shipping_methods: cart.shipping_methods?.map(sm => ({
                    name: sm.name,
                    amount: sm.amount,
                    data: sm.data,
                })),
                status: "pending" as const,
                sales_channel_id: cart.sales_channel_id,
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
 * Cart item structure for inventory adjustments
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
    async (input: { orderId: string; paymentIntentId: string; createdAt?: Date }) => {
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
 * Workflow to create an order from a Stripe payment
 *
 * This workflow:
 * 1. Validates and prepares order data from Stripe payment metadata
 * 2. Creates the order using Medusa's createOrderWorkflow
 * 3. Adjusts inventory levels (decrements stock)
 * 4. Generates a modification token for the 1-hour modification window
 * 5. Logs the order creation
 * 6. Emits order.placed event (triggers email + payment capture scheduling)
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
            cartItems: data.orderData.items
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

        // Step 5: Generate modification token for 1-hour window
        const tokenInput = transform({ order, input }, (data) => ({
            orderId: data.order.id,
            paymentIntentId: data.input.paymentIntentId,
            createdAt: new Date(data.order.created_at),
        }));
        const tokenResult = generateModificationTokenStep(tokenInput);

        // Step 6: Log the order creation
        const logInput = transform({ order, input, shouldAdjustInventory, tokenResult }, (data) => ({
            orderId: data.order.id,
            paymentIntentId: data.input.paymentIntentId,
            inventoryAdjusted: data.shouldAdjustInventory,
            modificationToken: data.tokenResult.token,
        }));
        logOrderCreatedStep(logInput);

        // Step 7: Emit order.placed event to trigger email notification and payment capture scheduling
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
