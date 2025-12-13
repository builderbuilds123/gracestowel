import { MedusaContainer } from "@medusajs/framework/types";
import Stripe from "stripe";
import { startStripeEventWorker } from "../lib/stripe-event-queue";
import { createOrderFromStripeWorkflow } from "../workflows/create-order-from-stripe";
import { z } from "zod";

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
    console.log(`[StripeEventWorker] Handling event ${event.id} (${event.type})`);

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
            console.log(`[StripeEventWorker] Unhandled event type: ${event.type}`);
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
    const traceId = paymentIntent.metadata?.trace_id || `webhook_${paymentIntent.id}`;
    
    const log = (level: "info" | "warn" | "error", message: string, extra?: Record<string, unknown>) => {
        const entry = JSON.stringify({
            timestamp: new Date().toISOString(),
            level,
            message,
            context: { traceId, paymentIntentId: paymentIntent.id, ...extra },
        });
        if (level === "error") console.error(entry);
        else if (level === "warn") console.warn(entry);
        else console.log(entry);
    };

    log("info", "PaymentIntent authorized webhook received", {
        status: paymentIntent.status,
        amount: paymentIntent.amount,
        hasCartData: !!paymentIntent.metadata?.cart_data,
    });

    if (paymentIntent.status !== "requires_capture") {
        log("info", "Skipping - not in requires_capture status", {
            actualStatus: paymentIntent.status,
        });
        return;
    }

    // IDEMPOTENCY CHECK: See if order already exists for this PaymentIntent
    try {
        const existingOrder = await findOrderByPaymentIntentId(paymentIntent.id, container);

        if (existingOrder) {
            log("info", "Order already exists for PaymentIntent - skipping creation", {
                existingOrderId: existingOrder.id,
            });
            return;
        }
    } catch (checkError) {
        log("warn", "Could not check for existing order - proceeding with creation", {
            error: (checkError as Error).message,
        });
    }

    // Proceed with order creation
    try {
        log("info", "Creating order from PaymentIntent");
        await createOrderFromPaymentIntent(paymentIntent, container);
        log("info", "Order created successfully");
    } catch (error) {
        log("error", "Failed to create order from PaymentIntent", {
            cartData: paymentIntent.metadata?.cart_data ? "present" : "missing",
            customerEmail: paymentIntent.metadata?.customer_email,
            error: (error as Error).message,
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
    console.log(`[StripeEventWorker] PaymentIntent succeeded: ${paymentIntent.id}`);

    // Check if order already exists - query by metadata filter (not O(n) scan)
    const existingOrder = await findOrderByPaymentIntentId(paymentIntent.id, container);

    if (existingOrder) {
        console.log(`[StripeEventWorker] Order already exists for PaymentIntent ${paymentIntent.id}`);
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
        console.warn(
            `[StripeEventWorker] Order lookup for PI ${paymentIntentId} may be incomplete - ` +
            `checked 1000 recent orders. Consider adding indexed lookup.`
        );
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
                console.error("[StripeEventWorker] Invalid cart_data schema:", parsed.error);
                // Fail safe - do not process invalid cart data
                return;
            }
        } catch (e) {
            console.error("[StripeEventWorker] Failed to parse cart_data JSON:", e);
            return;
        }
    }

    const customerEmail = metadata.customer_email || paymentIntent.receipt_email;

    let shippingAddress: z.infer<typeof ShippingAddressSchema> | undefined = undefined;

    if (metadata.shipping_address) {
        try {
            const rawAddress = JSON.parse(metadata.shipping_address);
            const parsed = ShippingAddressSchema.safeParse(rawAddress);
            if (parsed.success) {
                shippingAddress = parsed.data;
            } else {
                console.warn("[StripeEventWorker] Invalid shipping_address schema, falling back to Stripe data:", parsed.error);
                // Fallback to undefined will trigger Stripe data usage below
            }
        } catch (e) {
            console.warn("[StripeEventWorker] Failed to parse shipping_address JSON, falling back to Stripe data:", e);
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
        console.log("[StripeEventWorker] No cart data - skipping order creation");
        return;
    }

    const { result: order } = await createOrderFromStripeWorkflow(container).run({
        input: {
            paymentIntentId: paymentIntent.id,
            cartData,
            customerEmail: customerEmail || undefined,
            shippingAddress,
            amount: paymentIntent.amount,
            currency: paymentIntent.currency,
        }
    });

    console.log(`[StripeEventWorker] Order created: ${order.id}`);
}

/**
 * Handle failed payment intent
 */
async function handlePaymentIntentFailed(paymentIntent: Stripe.PaymentIntent): Promise<void> {
    console.log(`[StripeEventWorker] PaymentIntent failed: ${paymentIntent.id}`);
    console.log(`[StripeEventWorker] Failure reason: ${paymentIntent.last_payment_error?.message || "Unknown"}`);
}

/**
 * Handle completed checkout session
 */
async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session): Promise<void> {
    console.log(`[StripeEventWorker] Checkout session completed: ${session.id}`);
}

/**
 * Loader function - called by Medusa on startup
 */
export default async function stripeEventWorkerLoader(container: MedusaContainer): Promise<void> {
    // Only start worker if Redis is configured
    if (!process.env.REDIS_URL) {
        console.warn("[StripeEventWorker] REDIS_URL not configured - worker not started");
        return;
    }

    try {
        startStripeEventWorker(container, handleStripeEvent);
        console.log("[StripeEventWorker] Loader completed - worker is processing Stripe events");
    } catch (error) {
        console.error("[StripeEventWorker] Failed to start worker:", error);
        // Don't throw - allow backend to start even if worker fails
    }
}
