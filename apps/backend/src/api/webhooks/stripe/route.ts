import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import Stripe from "stripe";
import { getStripeClient } from "../../../utils/stripe";
import { createOrderFromStripeWorkflow } from "../../../workflows/create-order-from-stripe";

/**
 * Stripe Webhook Handler
 * 
 * Handles Stripe webhook events, particularly payment_intent.succeeded
 * to create orders in Medusa when payments complete.
 * 
 * Endpoint: POST /webhooks/stripe
 */

// Stripe client imported from ../../../utils/stripe

/**
 * Helper to read raw body from request stream
 * Required because bodyParser is disabled for this route via middlewares.ts
 */
async function getRawBody(req: MedusaRequest): Promise<string> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        req.on("data", (chunk: Buffer) => chunks.push(chunk));
        req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
        req.on("error", reject);
    });
}

export async function POST(
    req: MedusaRequest,
    res: MedusaResponse
): Promise<void> {
    const stripe = getStripeClient();
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
        console.error("STRIPE_WEBHOOK_SECRET is not configured");
        res.status(500).json({ error: "Webhook secret not configured" });
        return;
    }

    // Get the raw body for signature verification
    const sig = req.headers["stripe-signature"] as string;

    if (!sig) {
        console.error("No Stripe signature found in request");
        res.status(400).json({ error: "No signature provided" });
        return;
    }

    let event: Stripe.Event;
    let rawBody: string;

    try {
        // Read the raw body from the request stream
        // bodyParser is disabled for this route via middlewares.ts
        rawBody = await getRawBody(req);

        // Verify the webhook signature with the exact raw body
        event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
    } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error(`Webhook signature verification failed: ${message}`);
        res.status(400).json({ error: `Webhook Error: ${message}` });
        return;
    }

    console.log(`Received Stripe webhook event: ${event.type}`);

    // Handle the event
    switch (event.type) {
        case "payment_intent.succeeded":
            // This fires when payment is captured (after 1-hour window)
            await handlePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent, req);
            break;

        case "payment_intent.amount_capturable_updated":
            // This fires when payment is authorized (manual capture mode)
            // Create the order when payment is authorized
            await handlePaymentIntentAuthorized(event.data.object as Stripe.PaymentIntent, req);
            break;

        case "payment_intent.payment_failed":
            await handlePaymentIntentFailed(event.data.object as Stripe.PaymentIntent);
            break;

        case "checkout.session.completed":
            await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session, req);
            break;

        default:
            console.log(`Unhandled event type: ${event.type}`);
    }

    // Return a 200 response to acknowledge receipt of the event
    res.status(200).json({ received: true });
}

/**
 * Handle authorized payment intent (manual capture mode)
 * This is called when the payment is authorized but not yet captured.
 * We create the order here to start the 1-hour modification window.
 */
async function handlePaymentIntentAuthorized(
    paymentIntent: Stripe.PaymentIntent,
    req: MedusaRequest
): Promise<void> {
    console.log(`PaymentIntent authorized: ${paymentIntent.id}`);
    console.log(`Amount capturable: ${paymentIntent.amount_capturable / 100} ${paymentIntent.currency.toUpperCase()}`);

    // Only process if status is requires_capture (authorized)
    if (paymentIntent.status !== "requires_capture") {
        console.log(`Skipping - status is ${paymentIntent.status}, not requires_capture`);
        return;
    }

    await createOrderFromPaymentIntent(paymentIntent, req);
}

/**
 * Handle successful payment intent (captured)
 * This is called when the payment is captured (after 1-hour window or immediate capture).
 */
async function handlePaymentIntentSucceeded(
    paymentIntent: Stripe.PaymentIntent,
    req: MedusaRequest
): Promise<void> {
    console.log(`PaymentIntent succeeded: ${paymentIntent.id}`);
    console.log(`Amount: ${paymentIntent.amount / 100} ${paymentIntent.currency.toUpperCase()}`);

    // Check if order already exists (created during authorization)
    const query = req.scope.resolve("query");
    const { data: allOrders } = await query.graph({
        entity: "order",
        fields: ["id", "metadata"],
    });

    // Filter orders by payment intent ID in metadata
    const existingOrders = allOrders.filter((order: any) =>
        order.metadata?.stripe_payment_intent_id === paymentIntent.id
    );

    if (existingOrders.length > 0) {
        console.log(`Order already exists for PaymentIntent ${paymentIntent.id} - skipping creation`);
        return;
    }

    // If no order exists (e.g., immediate capture mode), create one
    await createOrderFromPaymentIntent(paymentIntent, req);
}

/**
 * Helper function to create order from PaymentIntent
 */
async function createOrderFromPaymentIntent(
    paymentIntent: Stripe.PaymentIntent,
    req: MedusaRequest
): Promise<void> {
    // Extract cart data from metadata
    const metadata = paymentIntent.metadata || {};
    const cartData = metadata.cart_data ? JSON.parse(metadata.cart_data) : null;

    // Get customer email from metadata or from Stripe's receipt_email
    const customerEmail = metadata.customer_email || paymentIntent.receipt_email;

    // Get shipping address from metadata or from Stripe's shipping property
    let shippingAddress = metadata.shipping_address ? JSON.parse(metadata.shipping_address) : null;

    // If no shipping address in metadata, try to get from PaymentIntent's shipping
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
        console.log("No cart data in PaymentIntent metadata - skipping order creation");
        return;
    }

    try {
        console.log("[webhook] Starting order creation from PaymentIntent", {
            payment_intent_id: paymentIntent.id,
            currency: paymentIntent.currency,
            amount: paymentIntent.amount,
            amount_capturable: paymentIntent.amount_capturable,
            status: paymentIntent.status,
            has_cart: !!cartData,
            has_shipping: !!shippingAddress,
        });

        // Create order in Medusa using workflow
        const { result: order } = await createOrderFromStripeWorkflow(req.scope).run({
            input: {
                paymentIntentId: paymentIntent.id,
                cartData,
                customerEmail: customerEmail || undefined,
                shippingAddress,
                amount: paymentIntent.amount,
                currency: paymentIntent.currency,
            }
        });

        console.log(`Order created successfully: ${order.id}`);
        if (order.modification_token) {
            console.log(`Modification token generated for order ${order.id}`);
        }
    } catch (error) {
        console.error("[webhook] Failed to create order", {
            payment_intent_id: paymentIntent.id,
            currency: paymentIntent.currency,
            amount: paymentIntent.amount,
            amount_capturable: paymentIntent.amount_capturable,
            status: paymentIntent.status,
            cart_metadata_present: !!cartData,
        }, error);
        // Don't throw - we still want to return 200 to Stripe
    }
}

/**
 * Handle failed payment intent
 */
async function handlePaymentIntentFailed(
    paymentIntent: Stripe.PaymentIntent
): Promise<void> {
    console.log(`PaymentIntent failed: ${paymentIntent.id}`);
    console.log(`Failure reason: ${paymentIntent.last_payment_error?.message || "Unknown"}`);
    // Could send notification email, update analytics, etc.
}

/**
 * Handle completed checkout session
 */
async function handleCheckoutSessionCompleted(
    session: Stripe.Checkout.Session,
    req: MedusaRequest
): Promise<void> {
    console.log(`Checkout session completed: ${session.id}`);
    // Handle Stripe Checkout flow if used
}

