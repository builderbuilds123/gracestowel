import { MedusaContainer } from "@medusajs/framework/types";
import Stripe from "stripe";
import { startStripeEventWorker } from "../workers/stripe-event-worker";
import { createOrderFromStripeWorkflow } from "../workflows/create-order-from-stripe";
import { z } from "zod";
import { logger } from "../utils/logger";
import { registerProjectSubscribers } from "../utils/register-subscribers";
import { Modules } from "@medusajs/framework/utils";

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

        case "charge.refunded":
            await handleChargeRefunded(event.data.object as Stripe.Charge, container);
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
    
    // SEC-01: Extract cartId from metadata (required for authoritative cart)
    const cartId = metadata.cart_id;
    
    if (!cartId) {
        logger.warn("stripe-worker", "No cart_id in PaymentIntent metadata - skipping order creation", {
            paymentIntentId: paymentIntent.id,
            hasMetadata: !!metadata,
            metadataKeys: Object.keys(metadata),
        });
        return;
    }

    const customerEmail = metadata.customer_email || paymentIntent.receipt_email;

    logger.info("stripe-worker", "Invoking createOrderFromStripeWorkflow", {
        paymentIntentId: paymentIntent.id,
        cartId,
        hasCustomerEmail: !!customerEmail,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
    });

    const { result: order } = await createOrderFromStripeWorkflow(container).run({
        input: {
            paymentIntentId: paymentIntent.id,
            cartId,
            customerEmail: customerEmail || undefined,
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

/**
 * RET-01: Handle charge refunded webhook
 *
 * This handler processes Stripe charge.refunded webhooks to:
 * 1. Find the associated order via PaymentIntent ID
 * 2. Update PaymentCollection status based on refund amount
 * 3. Create OrderTransaction record for the refund
 * 4. Update order status if fully refunded
 *
 * Supports both full and partial refunds.
 *
 * @param charge - Stripe Charge object from webhook
 * @param container - Medusa dependency injection container
 */
async function handleChargeRefunded(charge: Stripe.Charge, container: MedusaContainer): Promise<void> {
    const paymentIntentId = typeof charge.payment_intent === 'string'
        ? charge.payment_intent
        : charge.payment_intent?.id;

    if (!paymentIntentId) {
        logger.warn("stripe-worker", "charge.refunded event missing payment_intent", {
            chargeId: charge.id
        });
        return;
    }

    logger.info("stripe-worker", "Processing charge.refunded", {
        chargeId: charge.id,
        paymentIntentId,
        amountRefunded: charge.amount_refunded,
        totalAmount: charge.amount,
        refunded: charge.refunded,
    });

    try {
        // Step 1: Find order by PaymentIntent ID
        const order = await findOrderByPaymentIntentId(paymentIntentId, container);

        if (!order) {
            logger.warn("stripe-worker", "No order found for refunded charge", {
                paymentIntentId,
                chargeId: charge.id,
            });
            return;
        }

        logger.info("stripe-worker", "Found order for refund", {
            orderId: order.id,
            paymentIntentId,
            currentStatus: order.status,
        });

        // Step 2: Determine refund type (full vs partial)
        const isFullRefund = charge.refunded || charge.amount_refunded === charge.amount;
        const refundAmountCents = charge.amount_refunded;

        // Step 3: Update PaymentCollection status
        await updatePaymentCollectionOnRefund(
            order.id,
            refundAmountCents,
            isFullRefund,
            container
        );

        // Step 4: Create OrderTransaction for refund
        await createOrderTransactionOnRefund(
            order.id,
            refundAmountCents,
            charge.currency,
            paymentIntentId,
            container
        );

        // Step 5: Update order status if fully refunded
        if (isFullRefund) {
            await updateOrderStatusOnFullRefund(order.id, container);
        }

        logger.info("stripe-worker", "Refund processed successfully", {
            orderId: order.id,
            refundAmountCents,
            isFullRefund,
        });

    } catch (error) {
        logger.critical("stripe-worker", "Failed to process charge.refunded webhook", {
            chargeId: charge.id,
            paymentIntentId,
            error: (error as Error).message,
            stack: (error as Error).stack?.split("\n").slice(0, 3).join(" | "),
        });
        throw error; // Re-throw to trigger Stripe webhook retry
    }
}

/**
 * RET-01: Update PaymentCollection status on refund
 *
 * Updates PaymentCollection to either:
 * - "canceled" for full refunds
 * - "partially_refunded" for partial refunds (if Medusa supports this status)
 *
 * @param orderId - Medusa order ID
 * @param refundAmountCents - Amount refunded in cents
 * @param isFullRefund - Whether this is a full refund
 * @param container - Medusa container
 */
async function updatePaymentCollectionOnRefund(
    orderId: string,
    refundAmountCents: number,
    isFullRefund: boolean,
    container: MedusaContainer
): Promise<void> {
    try {
        const query = container.resolve("query");

        // Get order with payment collections
        const { data: orders } = await query.graph({
            entity: "order",
            fields: [
                "id",
                "payment_collections.id",
                "payment_collections.status",
            ],
            filters: { id: orderId },
        });

        const order = orders?.[0];
        if (!order) {
            logger.warn("stripe-worker", "Order not found for refund update", { orderId });
            return;
        }

        const paymentCollection = order.payment_collections?.[0];
        if (!paymentCollection) {
            logger.error("stripe-worker", "Order has no PaymentCollection for refund", {
                orderId,
                message: "Cannot update payment status without PaymentCollection",
            });
            return;
        }

        // Update PaymentCollection status via Payment Module
        const paymentModuleService = container.resolve(Modules.PAYMENT) as any;

        // For full refund, mark as canceled
        // For partial refund, we need to check if Medusa v2 supports "partially_refunded" status
        // If not, we'll keep it as "completed" and track via OrderTransactions
        const newStatus = isFullRefund ? "canceled" : "completed";

        await paymentModuleService.updatePaymentCollections([
            {
                id: paymentCollection.id,
                status: newStatus,
            },
        ]);

        logger.info("stripe-worker", "PaymentCollection updated on refund", {
            orderId,
            paymentCollectionId: paymentCollection.id,
            previousStatus: paymentCollection.status,
            newStatus,
            refundAmountCents,
            isFullRefund,
        });

    } catch (error) {
        logger.error("stripe-worker", "Failed to update PaymentCollection on refund", {
            orderId,
            error: (error as Error).message,
        });
        // Don't throw - refund was processed in Stripe, PC update is secondary
    }
}

/**
 * RET-01: Create OrderTransaction record for refund
 *
 * Creates an OrderTransaction with reference type "refund" to track the refund
 * in Medusa's transaction history. This enables downstream features to calculate
 * refundable amounts by querying OrderTransactions.
 *
 * @param orderId - Medusa order ID
 * @param refundAmountCents - Amount refunded in cents (Stripe minor units)
 * @param currencyCode - Currency code (e.g., "usd")
 * @param paymentIntentId - Stripe PaymentIntent ID (used as reference)
 * @param container - Medusa container
 */
async function createOrderTransactionOnRefund(
    orderId: string,
    refundAmountCents: number,
    currencyCode: string,
    paymentIntentId: string,
    container: MedusaContainer
): Promise<void> {
    try {
        const orderModuleService = container.resolve(Modules.ORDER) as any;

        // Medusa v2 uses MAJOR UNITS for all amount fields
        // Convert Stripe minor units (cents) → Medusa major units (dollars)
        const amountInMajorUnits = refundAmountCents / 100;

        // Create OrderTransaction with reference to the refund
        // Note: Amount is NEGATIVE for refunds to indicate money going back to customer
        await orderModuleService.addOrderTransactions({
            order_id: orderId,
            amount: -amountInMajorUnits, // Negative for refund
            currency_code: currencyCode,
            reference: "refund",
            reference_id: paymentIntentId,
        });

        logger.info("stripe-worker", "OrderTransaction created for refund", {
            orderId,
            amount: -amountInMajorUnits,
            currencyCode: currencyCode.toUpperCase(),
            referenceId: paymentIntentId,
        });

    } catch (error) {
        logger.error("stripe-worker", "Failed to create OrderTransaction for refund", {
            orderId,
            error: (error as Error).message,
        });
        // Don't throw - OrderTransaction is for tracking, not critical
    }
}

/**
 * RET-01: Update order status on full refund
 *
 * Updates order status to "canceled" when fully refunded.
 * For partial refunds, order status remains unchanged (likely "completed").
 *
 * @param orderId - Medusa order ID
 * @param container - Medusa container
 */
async function updateOrderStatusOnFullRefund(
    orderId: string,
    container: MedusaContainer
): Promise<void> {
    try {
        const orderService = container.resolve("order");

        await orderService.updateOrders([{
            id: orderId,
            status: "canceled",
        }]);

        logger.info("stripe-worker", "Order status updated on full refund", {
            orderId,
            newStatus: "canceled",
        });

    } catch (error) {
        logger.error("stripe-worker", "Failed to update order status on refund", {
            orderId,
            error: (error as Error).message,
        });
        // Don't throw - order status update is secondary to refund processing
    }
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
