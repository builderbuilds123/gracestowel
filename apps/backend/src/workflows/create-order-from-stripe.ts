import {
    createStep,
    createWorkflow,
    StepResponse,
    WorkflowResponse,
    transform,
} from "@medusajs/framework/workflows-sdk";
import { createOrderWorkflow, adjustInventoryLevelsStep, emitEventStep } from "@medusajs/medusa/core-flows";
import type { InventoryTypes } from "@medusajs/framework/types";

/**
 * Input for the create-order-from-stripe workflow
 */
export interface CreateOrderFromStripeInput {
    paymentIntentId: string;
    cartData: {
        items: Array<{
            variantId?: string;
            sku?: string;
            title: string;
            price: string;
            quantity: number;
            color?: string;
        }>;
    };
    customerEmail?: string;
    shippingAddress?: {
        firstName: string;
        lastName: string;
        address1: string;
        address2?: string;
        city: string;
        state?: string;
        postalCode: string;
        countryCode: string;
        phone?: string;
    };
    amount: number;
    currency: string;
}

/**
 * Step to validate and prepare order data from Stripe payment
 */
const prepareOrderDataStep = createStep(
    "prepare-order-data-from-stripe",
    async (input: CreateOrderFromStripeInput, { container }) => {
        const { cartData, customerEmail, shippingAddress, amount, currency, paymentIntentId } = input;

        const regionService = container.resolve("region");
        const regions = await regionService.listRegions({
            currency_code: currency.toLowerCase(),
        });

        console.log("[create-order-from-stripe] Regions for currency", currency, regions.map((r: any) => ({ id: r.id, name: r.name, currency_code: r.currency_code, countries: r.countries })));

        if (!regions.length) {
            console.error(`[create-order-from-stripe] No region found for currency: ${currency}`);
            throw new Error(`No region found for currency: ${currency}`);
        }

        const region = regions[0];
        console.log("[create-order-from-stripe] Using region", { id: region.id, name: region.name, currency_code: region.currency_code });

        // Transform cart items to order line items
        const items = cartData.items.map((item) => ({
            variant_id: item.variantId || undefined,
            title: item.title,
            quantity: item.quantity,
            unit_price: parseFloat(item.price.replace("$", "")) * 100, // Convert to cents
            metadata: {
                color: item.color,
                sku: item.sku,
            },
        }));

        console.log("[create-order-from-stripe] Prepared items", items);

        // Prepare shipping address
        const shipping_address = shippingAddress
            ? {
                  first_name: shippingAddress.firstName,
                  last_name: shippingAddress.lastName,
                  address_1: shippingAddress.address1,
                  address_2: shippingAddress.address2 || "",
                  city: shippingAddress.city,
                  province: shippingAddress.state || "",
                  postal_code: shippingAddress.postalCode,
                  country_code: shippingAddress.countryCode.toLowerCase(),
                  phone: shippingAddress.phone || "",
              }
            : undefined;

        const orderData = {
            region_id: region.id,
            email: customerEmail,
            items,
            shipping_address,
            status: "pending" as const,
            metadata: {
                stripe_payment_intent_id: paymentIntentId,
            },
        };

        console.log("[create-order-from-stripe] Prepared order data", {
            region_id: orderData.region_id,
            email: orderData.email,
            items_count: orderData.items.length,
            has_shipping: !!orderData.shipping_address,
            currency,
            amount,
        });

        return new StepResponse(orderData);
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
            eventBusModuleService = container.resolve("eventBus") as any;
        } catch (err) {
            console.warn("[create-order-from-stripe] eventBus not configured, skipping emit", {
                event: input.eventName,
                error: err instanceof Error ? err.message : err,
            });
            return new StepResponse({ success: false, skipped: true });
        }

        await eventBusModuleService.emit(input.eventName, input.data);
        console.log(`Event ${input.eventName} emitted with data:`, input.data);
        return new StepResponse({ success: true });
    }
);

/**
 * Step to prepare inventory adjustments from cart items
 */
const prepareInventoryAdjustmentsStep = createStep(
    "prepare-inventory-adjustments",
    async (input: { cartItems: CreateOrderFromStripeInput["cartData"]["items"] }, { container }) => {
        const query = container.resolve("query");
        const adjustments: InventoryTypes.BulkAdjustInventoryLevelInput[] = [];

        for (const item of input.cartItems) {
            if (!item.variantId) continue;

            try {
                // Get the inventory item linked to this variant
                const { data: variants } = await query.graph({
                    entity: "product_variant",
                    fields: ["id", "inventory_items.inventory_item_id"],
                    filters: { id: item.variantId },
                });

                if (!variants.length) continue;

                const variant = variants[0];
                const inventoryItemId = variant.inventory_items?.[0]?.inventory_item_id;

                if (!inventoryItemId) continue;

                // Get the stock location for this inventory item
                const { data: inventoryLevels } = await query.graph({
                    entity: "inventory_level",
                    fields: ["id", "location_id", "inventory_item_id"],
                    filters: { inventory_item_id: inventoryItemId },
                });

                if (!inventoryLevels.length) continue;

                const locationId = inventoryLevels[0].location_id;

                // Add adjustment (negative to decrement)
                adjustments.push({
                    inventory_item_id: inventoryItemId,
                    location_id: locationId,
                    adjustment: -item.quantity, // Negative to reduce stock
                });
            } catch (error) {
                console.error(`Error preparing inventory adjustment for variant ${item.variantId}:`, error);
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
    async (input: { orderId: string; paymentIntentId: string; inventoryAdjusted: boolean }) => {
        console.log(`Order ${input.orderId} created from Stripe PaymentIntent ${input.paymentIntentId}`);
        if (input.inventoryAdjusted) {
            console.log(`Inventory levels adjusted for order ${input.orderId}`);
        }
        return new StepResponse({ success: true });
    }
);

/**
 * Workflow to create an order from a Stripe payment
 *
 * This workflow:
 * 1. Validates and prepares order data from Stripe payment metadata
 * 2. Creates the order using Medusa's createOrderWorkflow
 * 3. Adjusts inventory levels (decrements stock)
 * 4. Logs the order creation
 */
export const createOrderFromStripeWorkflow = createWorkflow(
    "create-order-from-stripe",
    (input: CreateOrderFromStripeInput) => {
        // Step 1: Prepare order data from Stripe payment
        const orderData = prepareOrderDataStep(input);

        // Step 2: Create the order using Medusa's built-in workflow
        const order = createOrderWorkflow.runAsStep({
            input: orderData,
        });

        // Step 3: Prepare inventory adjustments from cart items
        const cartItemsInput = transform({ input }, (data) => ({
            cartItems: data.input.cartData.items,
        }));
        const inventoryAdjustments = prepareInventoryAdjustmentsStep(cartItemsInput);

        // Step 4: Adjust inventory levels (decrement stock)
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

        // Call the inventory adjustment step
        adjustInventoryLevelsStep(adjustedInventory);

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
        }));
        logOrderCreatedStep(logInput);

        // Step 6: Emit order.placed event to trigger email notification
        const eventData = transform({ order }, (data) => ({
            eventName: "order.placed" as const,
            data: { id: data.order.id },
        }));
        emitEventStep(eventData);

        return new WorkflowResponse(order);
    }
);

export default createOrderFromStripeWorkflow;

