import { MedusaContainer } from "@medusajs/framework/types";
import Stripe from "stripe";
import { startStripeEventWorker } from "../workers/stripe-event-worker";
import { createOrderFromStripeWorkflow } from "../workflows/create-order-from-stripe";
import { z } from "zod";
import { logger } from "../utils/logger";

const CartItemSchema = z.object({
  variantId: z.string().optional(),
  sku: z.string().optional(),
  title: z.string(),
  price: z.string(),
  quantity: z.number(),
  color: z.string().optional(),
});

const CartDataSchema = z.object({
  items: z.array(CartItemSchema),
});

const ShippingAddressSchema = z.object({
  firstName: z.string(),
  lastName: z.string(),
  address1: z.string(),
  address2: z.string().nullish().transform(v => v || undefined),
  city: z.string(),
  state: z.string().nullish().transform(v => v || undefined),
  postalCode: z.string(),
  countryCode: z.string(),
  phone: z.string().nullish().transform(v => v || undefined),
});

/**
 * Stripe Event Worker Loader - Story 6.1
 * 
 * Initializes the BullMQ worker that processes Stripe webhook events
 * with retry logic (5 attempts, exponential backoff).
 * 
 * This loader is registered in src/loaders/index.ts and runs on backend startup.
 */

/**
 * Handle Stripe events - called by the worker for each queued event
 * This contains the actual business logic for processing different event types
 */
async function handleStripeEvent(event: Stripe.Event, container: MedusaContainer): Promise<void> {
    logger.info("stripe-worker", "Processing event", { eventId: event.id, eventType: event.type });

    switch (event.type) {
        case "payment_intent.succeeded":
            await handlePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent, container);
            break;

        case "payment_intent.amount_capturable_updated":
            await handlePaymentIntentAuthorized(event.data.object as Stripe.PaymentIntent, container);
            break;

        case "payment_intent.payment_failed":
            await handlePaymentIntentFailed(event.data.object as Stripe.PaymentIntent);
            break;

        case "checkout.session.completed":
            await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
            break;

        default:
            logger.info("stripe-worker", "Unhandled event type", { eventType: event.type });
    }
}

// Track if subscribers have been registered
let subscribersRegistered = false;

async function ensureSubscribersRegistered(container: MedusaContainer) {
    if (subscribersRegistered) return;

    try {
        console.log("[SUBSCRIBERS] Registering project subscribers from Stripe worker...");
        const { Modules } = await import("@medusajs/framework/utils");
        const eventBusModuleService = container.resolve(Modules.EVENT_BUS);

        // Use static imports instead of dynamic imports to avoid path issues
        const orderPlacedModule = require("../subscribers/order-placed");
        const customerCreatedModule = require("../subscribers/customer-created");
        const fulfillmentCreatedModule = require("../subscribers/fulfillment-created");
        const orderCanceledModule = require("../subscribers/order-canceled");

        // Register order-placed subscriber
        eventBusModuleService.subscribe(orderPlacedModule.config.event, async (data: any) => {
            await orderPlacedModule.default({ event: { name: orderPlacedModule.config.event, data }, container });
        });
        console.log(`[SUBSCRIBERS] ✅ Registered: ${orderPlacedModule.config.event}`);

        // Register customer-created subscriber
        eventBusModuleService.subscribe(customerCreatedModule.config.event, async (data: any) => {
            await customerCreatedModule.default({ event: { name: customerCreatedModule.config.event, data }, container });
        });
        console.log(`[SUBSCRIBERS] ✅ Registered: ${customerCreatedModule.config.event}`);

        // Register fulfillment-created subscriber
        eventBusModuleService.subscribe(fulfillmentCreatedModule.config.event, async (data: any) => {
            await fulfillmentCreatedModule.default({ event: { name: fulfillmentCreatedModule.config.event, data }, container });
        });
        console.log(`[SUBSCRIBERS] ✅ Registered: ${fulfillmentCreatedModule.config.event}`);

        // Register order-canceled subscriber
        eventBusModuleService.subscribe(orderCanceledModule.config.event, async (data: any) => {
            await orderCanceledModule.default({ event: { name: orderCanceledModule.config.event, data }, container });
        });
        console.log(`[SUBSCRIBERS] ✅ Registered: ${orderCanceledModule.config.event}`);

        subscribersRegistered = true;
        console.log("[SUBSCRIBERS] All subscribers registered successfully");
    } catch (error) {
        console.error("[SUBSCRIBERS] Failed to register subscribers:", error);
    }
}

/**
 * Handle authorized payment intent (manual capture mode)
 * Updated 2025-12-12: Added idempotency check and structured logging
 */
async function handlePaymentIntentAuthorized(
    paymentIntent: Stripe.PaymentIntent,
    container: MedusaContainer
): Promise<void> {
    // Ensure subscribers are registered before processing (Medusa v2 workaround)
    await ensureSubscribersRegistered(container);

    const traceId = paymentIntent.metadata?.trace_id || `webhook_${paymentIntent.id}`;
    const piId = paymentIntent.id;

    logger.info("stripe-worker", "PaymentIntent authorized - processing", {
        paymentIntentId: piId,
        traceId,
        status: paymentIntent.status,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
        hasCartData: !!paymentIntent.metadata?.cart_data,
        hasShipping: !!paymentIntent.shipping,
        customerEmail: paymentIntent.metadata?.customer_email || paymentIntent.receipt_email,
    });

    if (paymentIntent.status !== "requires_capture") {
        logger.info("stripe-worker", "Skipping - not in requires_capture status", {
            paymentIntentId: piId,
            actualStatus: paymentIntent.status,
        });
        return;
    }

    // IDEMPOTENCY CHECK: See if order already exists for this PaymentIntent
    try {
        const existingOrder = await findOrderByPaymentIntentId(paymentIntent.id, container);

        if (existingOrder) {
            logger.info("stripe-worker", "Order already exists - skipping creation", {
                paymentIntentId: piId,
                existingOrderId: existingOrder.id,
            });
            return;
        }
    } catch (checkError) {
        logger.warn("stripe-worker", "Could not check for existing order - proceeding", {
            paymentIntentId: piId,
            error: (checkError as Error).message,
        });
    }

    // Proceed with order creation
    try {
        logger.info("stripe-worker", "Creating order from PaymentIntent", { paymentIntentId: piId });
        await createOrderFromPaymentIntent(paymentIntent, container);
        logger.info("stripe-worker", "Order created successfully", { paymentIntentId: piId });
    } catch (error) {
        logger.critical("stripe-worker", "Failed to create order from PaymentIntent", {
            paymentIntentId: piId,
            cartData: paymentIntent.metadata?.cart_data ? "present" : "missing",
            customerEmail: paymentIntent.metadata?.customer_email,
            error: (error as Error).message,
            stack: (error as Error).stack?.split("\n").slice(0, 3).join(" | "),
        });
        throw error; // Re-throw so Stripe retries the webhook
    }
}

/**
 * Handle successful payment intent (captured)
 */
async function handlePaymentIntentSucceeded(
    paymentIntent: Stripe.PaymentIntent,
    container: MedusaContainer
): Promise<void> {
    logger.info("stripe-worker", "PaymentIntent succeeded", { paymentIntentId: paymentIntent.id });

    // Check if order already exists - query by metadata filter (not O(n) scan)
    const existingOrder = await findOrderByPaymentIntentId(paymentIntent.id, container);

    if (existingOrder) {
        logger.info("stripe-worker", "Order already exists for succeeded PI", {
            paymentIntentId: paymentIntent.id,
            orderId: existingOrder.id,
        });
        return;
    }

    await createOrderFromPaymentIntent(paymentIntent, container);
}

/**
 * Find order by Stripe PaymentIntent ID
 * Queries recent orders to avoid O(n) full table scan
 * 
 * Note: Medusa v2 doesn't support JSONB filtering in query.graph(),
 * so we limit to recent orders and filter in memory.
 * For high-volume systems, consider adding a dedicated index or column.
 */
async function findOrderByPaymentIntentId(
    paymentIntentId: string,
    container: MedusaContainer
): Promise<any | null> {
    const query = container.resolve("query");
    
    // Query recent orders only (last 1000) to avoid O(n) full scan
    // Orders are typically processed within minutes of payment
    const { data: recentOrders } = await query.graph({
        entity: "order",
        fields: ["id", "metadata", "created_at"],
        pagination: { take: 1000, skip: 0 },
    });

    // Filter by payment intent ID in metadata
    const matchingOrder = recentOrders.find((order: any) =>
        order.metadata?.stripe_payment_intent_id === paymentIntentId
    );

    if (!matchingOrder && recentOrders.length >= 1000) {
        // If we hit the limit and didn't find it, log warning
        logger.warn("stripe-worker", "Order lookup may be incomplete - hit 1000 order limit", {
            paymentIntentId,
            ordersChecked: recentOrders.length,
        });
    }

    return matchingOrder || null;
}

/**
 * Create order from PaymentIntent
 */
async function createOrderFromPaymentIntent(
    paymentIntent: Stripe.PaymentIntent,
    container: MedusaContainer
): Promise<void> {
    const metadata = paymentIntent.metadata || {};
    
    // Validate cart_data using Zod
    let cartData: z.infer<typeof CartDataSchema> | null = null;
    if (metadata.cart_data) {
        try {
             // Parse JSON first, then validate
            const rawCart = JSON.parse(metadata.cart_data);
            const parsed = CartDataSchema.safeParse(rawCart);
            if (parsed.success) {
                cartData = parsed.data;
            } else {
                logger.error("stripe-worker", "Invalid cart_data schema", {
                    paymentIntentId: paymentIntent.id,
                    zodError: parsed.error.message,
                });
                // Fail safe - do not process invalid cart data
                return;
            }
        } catch (e) {
            logger.error("stripe-worker", "Failed to parse cart_data JSON", {
                paymentIntentId: paymentIntent.id,
            }, e as Error);
            return;
        }
    }

    const customerEmail = metadata.customer_email || paymentIntent.receipt_email;
    
    // Extract shipping amount from metadata (stored in cents)
    const shippingAmount = metadata.shipping_amount ? parseInt(metadata.shipping_amount, 10) : 0;

    let shippingAddress: z.infer<typeof ShippingAddressSchema> | undefined = undefined;

    if (metadata.shipping_address) {
        try {
            const rawAddress = JSON.parse(metadata.shipping_address);
            const parsed = ShippingAddressSchema.safeParse(rawAddress);
            if (parsed.success) {
                shippingAddress = parsed.data;
            } else {
                logger.warn("stripe-worker", "Invalid shipping_address schema, using Stripe data", {
                    paymentIntentId: paymentIntent.id,
                });
                // Fallback to undefined will trigger Stripe data usage below
            }
        } catch (e) {
            logger.warn("stripe-worker", "Failed to parse shipping_address JSON, using Stripe data", {
                paymentIntentId: paymentIntent.id,
            });
        }
    }

    if (!shippingAddress && paymentIntent.shipping) {
        const stripeShipping = paymentIntent.shipping;
        shippingAddress = {
            firstName: stripeShipping.name?.split(' ')[0] || '',
            lastName: stripeShipping.name?.split(' ').slice(1).join(' ') || '',
            address1: stripeShipping.address?.line1 || '',
            address2: stripeShipping.address?.line2 || undefined,
            city: stripeShipping.address?.city || '',
            state: stripeShipping.address?.state || undefined,
            postalCode: stripeShipping.address?.postal_code || '',
            countryCode: stripeShipping.address?.country || 'US',
            phone: stripeShipping.phone || undefined,
        };
    }

    if (!cartData) {
        logger.warn("stripe-worker", "No cart data in PaymentIntent - skipping order creation", {
            paymentIntentId: paymentIntent.id,
            hasMetadata: !!metadata,
            metadataKeys: Object.keys(metadata),
        });
        return;
    }

    logger.info("stripe-worker", "Invoking createOrderFromStripeWorkflow", {
        paymentIntentId: paymentIntent.id,
        itemCount: cartData.items.length,
        hasShipping: !!shippingAddress,
        shippingAmount,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
    });

    const { result: order } = await createOrderFromStripeWorkflow(container).run({
        input: {
            paymentIntentId: paymentIntent.id,
            cartData,
            customerEmail: customerEmail || undefined,
            shippingAddress,
            shippingAmount,
            amount: paymentIntent.amount,
            currency: paymentIntent.currency,
        }
    });

    logger.info("stripe-worker", "Order created from PaymentIntent", {
        paymentIntentId: paymentIntent.id,
        orderId: order.id,
    });
}

/**
 * Handle failed payment intent
 */
async function handlePaymentIntentFailed(paymentIntent: Stripe.PaymentIntent): Promise<void> {
    logger.warn("stripe-worker", "PaymentIntent failed", {
        paymentIntentId: paymentIntent.id,
        failureReason: paymentIntent.last_payment_error?.message || "Unknown",
        failureCode: paymentIntent.last_payment_error?.code,
    });
}

/**
 * Handle completed checkout session
 */
async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session): Promise<void> {
    logger.info("stripe-worker", "Checkout session completed", { sessionId: session.id });
}

let workerStarted = false;

/**
 * Ensure the Stripe event worker is started (idempotent)
 * Can be called multiple times safely - only starts worker once
 */
export function ensureStripeWorkerStarted(container: MedusaContainer): void {
    if (workerStarted) {
        return;
    }

    if (!process.env.REDIS_URL) {
        logger.warn("stripe-worker", "REDIS_URL not configured - worker not started");
        return;
    }

    try {
        console.log("[stripe-worker] Starting Stripe event worker...");
        startStripeEventWorker(container, handleStripeEvent);
        workerStarted = true;
        console.log("[stripe-worker] Worker started successfully");
    } catch (error) {
        logger.critical("stripe-worker", "Failed to start worker", {}, error as Error);
    }
}

/**
 * Loader function - called by Medusa on startup
 */
export default async function stripeEventWorkerLoader(container: MedusaContainer): Promise<void> {
    ensureStripeWorkerStarted(container);

    // Register project subscribers (Story fix: Medusa v2 doesn't auto-discover subscribers)
    try {
        console.log("[SUBSCRIBERS] Registering project subscribers...");
        const { Modules } = await import("@medusajs/framework/utils");
        const eventBusModuleService = container.resolve(Modules.EVENT_BUS);

        // Import and register order-placed subscriber
        const orderPlacedModule = await import("../subscribers/order-placed");
        const orderPlacedHandler = orderPlacedModule.default;
        const orderPlacedConfig = orderPlacedModule.config;

        eventBusModuleService.subscribe(orderPlacedConfig.event, async (data: any) => {
            await orderPlacedHandler({ event: { name: orderPlacedConfig.event, data }, container });
        });
        console.log(`[SUBSCRIBERS] ✅ Registered: ${orderPlacedConfig.event}`);

        // Import and register customer-created subscriber
        const customerCreatedModule = await import("../subscribers/customer-created");
        const customerCreatedHandler = customerCreatedModule.default;
        const customerCreatedConfig = customerCreatedModule.config;

        eventBusModuleService.subscribe(customerCreatedConfig.event, async (data: any) => {
            await customerCreatedHandler({ event: { name: customerCreatedConfig.event, data }, container });
        });
        console.log(`[SUBSCRIBERS] ✅ Registered: ${customerCreatedConfig.event}`);

        // Import and register fulfillment-created subscriber
        const fulfillmentCreatedModule = await import("../subscribers/fulfillment-created");
        const fulfillmentCreatedHandler = fulfillmentCreatedModule.default;
        const fulfillmentCreatedConfig = fulfillmentCreatedModule.config;

        eventBusModuleService.subscribe(fulfillmentCreatedConfig.event, async (data: any) => {
            await fulfillmentCreatedHandler({ event: { name: fulfillmentCreatedConfig.event, data }, container });
        });
        console.log(`[SUBSCRIBERS] ✅ Registered: ${fulfillmentCreatedConfig.event}`);

        // Import and register order-canceled subscriber
        const orderCanceledModule = await import("../subscribers/order-canceled");
        const orderCanceledHandler = orderCanceledModule.default;
        const orderCanceledConfig = orderCanceledModule.config;

        eventBusModuleService.subscribe(orderCanceledConfig.event, async (data: any) => {
            await orderCanceledHandler({ event: { name: orderCanceledConfig.event, data }, container });
        });
        console.log(`[SUBSCRIBERS] ✅ Registered: ${orderCanceledConfig.event}`);

        console.log("[SUBSCRIBERS] All subscribers registered successfully");
    } catch (error) {
        console.error("[SUBSCRIBERS] Failed to register subscribers:", error);
        throw error;
    }
}
