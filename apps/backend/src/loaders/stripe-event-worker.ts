import { MedusaContainer } from "@medusajs/framework/types";
import Stripe from "stripe";
import { startStripeEventWorker } from "../lib/stripe-event-queue";
import { createOrderFromStripeWorkflow } from "../workflows/create-order-from-stripe";

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
 */
async function handlePaymentIntentAuthorized(
    paymentIntent: Stripe.PaymentIntent,
    container: MedusaContainer
): Promise<void> {
    console.log(`[StripeEventWorker] PaymentIntent authorized: ${paymentIntent.id}`);

    if (paymentIntent.status !== "requires_capture") {
        console.log(`[StripeEventWorker] Skipping - status is ${paymentIntent.status}, not requires_capture`);
        return;
    }

    await createOrderFromPaymentIntent(paymentIntent, container);
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
    const cartData = metadata.cart_data ? JSON.parse(metadata.cart_data) : null;
    const customerEmail = metadata.customer_email || paymentIntent.receipt_email;

    let shippingAddress = metadata.shipping_address ? JSON.parse(metadata.shipping_address) : null;

    if (!shippingAddress && paymentIntent.shipping) {
        const stripeShipping = paymentIntent.shipping;
        shippingAddress = {
            firstName: stripeShipping.name?.split(' ')[0] || '',
            lastName: stripeShipping.name?.split(' ').slice(1).join(' ') || '',
            address1: stripeShipping.address?.line1 || '',
            address2: stripeShipping.address?.line2 || '',
            city: stripeShipping.address?.city || '',
            state: stripeShipping.address?.state || '',
            postalCode: stripeShipping.address?.postal_code || '',
            countryCode: stripeShipping.address?.country || 'US',
            phone: stripeShipping.phone || '',
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
