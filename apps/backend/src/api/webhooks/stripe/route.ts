import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import Stripe from "stripe";
import { createOrderFromStripeWorkflow } from "../../../workflows/create-order-from-stripe";

/**
 * Stripe Webhook Handler
 * 
 * Handles Stripe webhook events, particularly payment_intent.succeeded
 * to create orders in Medusa when payments complete.
 * 
 * Endpoint: POST /webhooks/stripe
 */

// Initialize Stripe client
const getStripeClient = () => {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
        throw new Error("STRIPE_SECRET_KEY is not configured");
    }
    return new Stripe(secretKey, {
        apiVersion: "2025-04-30.basil",
    });
};

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

    try {
        // Verify the webhook signature
        // Note: req.body should be the raw body for signature verification
        const rawBody = typeof req.body === "string" 
            ? req.body 
            : JSON.stringify(req.body);
        
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
            await handlePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent, req);
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
 * Handle successful payment intent
 */
async function handlePaymentIntentSucceeded(
    paymentIntent: Stripe.PaymentIntent,
    req: MedusaRequest
): Promise<void> {
    console.log(`PaymentIntent succeeded: ${paymentIntent.id}`);
    console.log(`Amount: ${paymentIntent.amount / 100} ${paymentIntent.currency.toUpperCase()}`);

    // Extract cart data from metadata (added in Task 2.3)
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
        // Create order in Medusa using workflow
        const { result: order } = await createOrderFromStripeWorkflow(req.scope).run({
            input: {
                paymentIntentId: paymentIntent.id,
                cartData,
                customerEmail,
                shippingAddress,
                amount: paymentIntent.amount,
                currency: paymentIntent.currency,
            }
        });

        console.log(`Order created successfully: ${order.id}`);
    } catch (error) {
        console.error("Failed to create order:", error);
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

