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
    shippingAmount?: number; // Shipping cost in cents
    amount: number;
    currency: string;
}

/**
 * Step to validate and prepare order data from Stripe payment
 */
const prepareOrderDataStep = createStep(
    "prepare-order-data-from-stripe",
    async (input: CreateOrderFromStripeInput, { container }) => {
        const { cartData, customerEmail, shippingAddress, shippingAmount, amount, currency, paymentIntentId } = input;

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
        // If variantId is missing, try to look it up from the product
        const query = container.resolve("query");
        const items = await Promise.all(cartData.items.map(async (item) => {
            let variantId = item.variantId;

            // If no variantId, try to find it by SKU or product title
            if (!variantId && item.sku) {
                try {
                    const { data: variants } = await query.graph({
                        entity: "product_variant",
                        fields: ["id", "sku"],
                        filters: { sku: item.sku },
                    });
                    if (variants.length > 0) {
                        variantId = variants[0].id;
                        console.log(`[create-order-from-stripe] Resolved variantId from SKU: ${item.sku} -> ${variantId}`);
                    }
                } catch (e) {
                    console.warn(`[create-order-from-stripe] Failed to lookup variant by SKU: ${item.sku}`, e);
                }
            }

            // If still no variantId, log warning but continue (order will have custom line item)
            if (!variantId) {
                console.warn(`[create-order-from-stripe] No variantId for item: ${item.title}. Order will have custom line item.`);
            }

            // Parse price - extract dollar amount from formatted string like "$35.00"
            // Medusa's createOrdersWorkflow expects unit_price in DOLLARS (it converts to cents internally)
            let unitPrice: number;
            if (typeof item.price === 'number') {
                // If number, assume it's already in dollars
                unitPrice = item.price;
            } else if (typeof item.price === 'string') {
                // Remove currency symbols and parse the number
                // "$35.00" -> 35.00 (dollars)
                const cleanPrice = item.price.replace(/[$€£,\s]/g, '').trim();
                unitPrice = parseFloat(cleanPrice);
            } else {
                unitPrice = 0;
                console.warn(`[create-order-from-stripe] Invalid price format for ${item.title}: ${item.price}`);
            }

            // Validate unitPrice is a valid number
            if (isNaN(unitPrice) || !isFinite(unitPrice)) {
                console.error(`[create-order-from-stripe] Invalid unit_price for ${item.title}: ${unitPrice}`);
                unitPrice = 0;
            }
            
            console.log(`[create-order-from-stripe] Price parsing: "${item.price}" -> ${unitPrice} dollars`);

            return {
                variant_id: variantId || undefined,
                title: item.title,
                quantity: item.quantity,
                unit_price: unitPrice, // Dollar amount - Medusa converts to cents internally
                metadata: {
                    color: item.color,
                    sku: item.sku,
                },
            };
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

        // Build shipping methods array if shipping amount exists
        const shipping_methods = shippingAmount && shippingAmount > 0
            ? [{
                name: "Standard Shipping",
                amount: shippingAmount,
              }]
            : undefined;

        // Resolve default Sales Channel
        const salesChannelService = container.resolve("sales_channel");
        let salesChannelId: string | undefined;
        try {
            const salesChannels = await salesChannelService.listSalesChannels({}, { take: 1 });
            if (salesChannels.length > 0) {
                salesChannelId = salesChannels[0].id;
                console.log("[create-order-from-stripe] Using default Sales Channel:", salesChannelId);
            } else {
                console.warn("[create-order-from-stripe] No sales channels found");
            }
        } catch (e) {
            console.warn("[create-order-from-stripe] Failed to list sales channels:", e);
        }

        const orderData = {
            region_id: region.id,
            email: customerEmail,
            items,
            shipping_address,
            shipping_methods,
            status: "pending" as const,
            sales_channel_id: salesChannelId, // Optional but recommended
            currency_code: currency.toLowerCase(), // Explicitly set currency code
            metadata: {
                stripe_payment_intent_id: paymentIntentId,
                shipping_amount: shippingAmount || 0,
            },
        };


        console.log("[create-order-from-stripe] Prepared order data", {
            region_id: orderData.region_id,
            email: orderData.email,
            items_count: orderData.items.length,
            has_shipping: !!orderData.shipping_address,
            shipping_amount: shippingAmount,
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
 * Step to prepare inventory adjustments from cart items
 */
const prepareInventoryAdjustmentsStep = createStep(
    "prepare-inventory-adjustments",
    async (input: { cartItems: CreateOrderFromStripeInput["cartData"]["items"] }, { container }) => {
        const query = container.resolve("query");
        const adjustments: UpdateInventoryLevelInput[] = [];

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
        const cartItemsInput = transform({ input }, (data) => ({
            cartItems: data.input.cartData.items,
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

