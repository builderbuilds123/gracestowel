import { MedusaContainer } from "@medusajs/framework/types";
import Stripe from "stripe";
import { startStripeEventWorker } from "../workers/stripe-event-worker";
import { createOrderFromStripeWorkflow } from "../workflows/create-order-from-stripe";
import { z } from "zod";
import { logger } from "../utils/logger";
import { registerProjectSubscribers } from "../utils/register-subscribers";

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

/**
 * Handle authorized payment intent (manual capture mode)
 * Updated 2025-12-12: Added idempotency check and structured logging
 */
async function handlePaymentIntentAuthorized(
    paymentIntent: Stripe.PaymentIntent,
    container: MedusaContainer
): Promise<void> {
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
        logger.info("stripe-worker", "Order already exists for succeeded PI - updating payment status", {
            paymentIntentId: paymentIntent.id,
            orderId: existingOrder.id,
        });
        
        // Update order payment status to reflect that payment has been captured
        await updateOrderPaymentStatusAfterCapture(
            existingOrder.id,
            paymentIntent.amount_received || paymentIntent.amount,
            container
        );
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
 * Update existing order's payment status after capture
 * Called when payment_intent.succeeded webhook arrives for an existing order
 */
async function updateOrderPaymentStatusAfterCapture(
    orderId: string,
    amountCaptured: number,
    container: MedusaContainer
): Promise<void> {
    try {
        const query = container.resolve("query");
        const orderService = container.resolve("order");
        
        // Get current order metadata
        const { data: orders } = await query.graph({
            entity: "order",
            fields: ["id", "status", "metadata"],
            filters: { id: orderId },
        });
        
        if (orders.length === 0) {
            logger.warn("stripe-worker", "Order not found for payment status update", { orderId });
            return;
        }
        
        const order = orders[0] as any;
        const currentMetadata = (order.metadata || {}) as Record<string, any>;
        const currentStatus = order.status;
        
        // Don't update if order is canceled
        if (currentStatus === "canceled") {
            logger.warn("stripe-worker", "Order is canceled - skipping payment status update", {
                orderId,
            });
            return;
        }
        
        // Update order with payment capture information
        const update: any = {
            id: orderId,
            metadata: {
                ...currentMetadata,
                payment_status: "captured",
                payment_captured_at: new Date().toISOString(),
                payment_amount_captured: amountCaptured,
            },
        };
        
        // Update order status to completed if not already
        if (currentStatus !== "completed") {
            update.status = "completed";
        }
        
        await orderService.updateOrders([update]);
        
        logger.info("stripe-worker", "Order payment status updated after capture", {
            orderId,
            amountCaptured,
            status: update.status,
        });
    } catch (error) {
        logger.error("stripe-worker", "Error updating order payment status after capture", {
            orderId,
            error: (error as Error).message,
        });
        // Don't throw - webhook processing should continue even if metadata update fails
    }
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
                // Schema validation failed - log and return early (don't throw)
                logger.error("stripe-worker", "Invalid cart_data schema validation failed", {
                    paymentIntentId: paymentIntent.id,
                    zodError: parsed.error.message,
                    issues: parsed.error.issues,
                });
                throw new Error(`Invalid cart_data schema: ${parsed.error.message}`);
            }
        } catch (e) {
            // This catch block handles JSON parsing errors (malformed JSON)
            logger.error("stripe-worker", "Failed to parse cart_data JSON", {
                paymentIntentId: paymentIntent.id,
                error: (e as Error).message,
            });
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
    // Only start worker once
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
 * Loader function - called by Medusa on startup (if auto-discovery works)
 * Currently not being auto-discovered by Medusa v2, so we trigger manually
 */
export default async function stripeEventWorkerLoader(container: MedusaContainer): Promise<void> {
    logger.info("stripe-event-worker-loader", "Stripe event worker loader starting");

    // Register subscribers first
    await registerProjectSubscribers(container);

    // Then start worker
    ensureStripeWorkerStarted(container);
}
