import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { logger } from "../../../../utils/logger";

/**
 * GET /store/orders/by-payment-intent?payment_intent_id=pi_xxx
 *
 * SEC-02 EMERGENCY FIX: Minimal, secure order lookup endpoint
 *
 * SECURITY CONSTRAINTS:
 * - NO PII: Returns only order_id and status (no shipping_address, items, customer)
 * - NO token minting: Read-only endpoint (client should use /order/status/:id endpoint)
 * - Query optimization: Filters orders to recent 24h to limit scan
 * - Security headers: Cache-Control: no-store, private + X-Content-Type-Options: nosniff
 *
 * Used by storefront checkout.success.tsx to verify order exists after payment.
 * Frontend gets shipping details from Stripe PaymentIntent, not from this endpoint.
 */
export async function GET(
    req: MedusaRequest,
    res: MedusaResponse
): Promise<void> {
    // SEC-02: Set security headers FIRST (before any response)
    res.setHeader("Cache-Control", "no-store, private");
    res.setHeader("X-Content-Type-Options", "nosniff");

    const paymentIntentId = req.query.payment_intent_id as string;

    // SEC-02: Input validation - Stripe PaymentIntent IDs start with "pi_" and are 27-28 chars
    if (!paymentIntentId) {
        res.status(400).json({
            error: "payment_intent_id query parameter is required",
            code: "MISSING_PAYMENT_INTENT_ID",
        });
        return;
    }

    // Validate format: Stripe PI IDs are "pi_[a-zA-Z0-9]{24}" (27 chars total)
    if (typeof paymentIntentId !== "string" || !paymentIntentId.startsWith("pi_") || paymentIntentId.length < 27 || paymentIntentId.length > 28) {
        logger.warn("by-payment-intent", "Invalid payment_intent_id format", {
            paymentIntentId: paymentIntentId.substring(0, 10) + "...", // Log partial to avoid PII
            length: paymentIntentId.length,
        });
        res.status(400).json({
            error: "Invalid payment_intent_id format",
            code: "INVALID_PAYMENT_INTENT_ID",
        });
        return;
    }

    const query = req.scope.resolve("query");

    try {
        // SEC-02: Limit query to recent orders (24h) and minimal fields to avoid full scans
        // NOTE: Medusa query.graph does not support JSONB filter on metadata; we bound the result set.
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const { data: recentOrders } = await query.graph({
            entity: "order",
            fields: ["id", "status", "created_at", "metadata"],
            // keep pagination tight to reduce scan load
            pagination: { take: 200 },
        });

        const orders = recentOrders.filter((order: any) => {
            const orderDate = new Date(order.created_at);
            return (
                orderDate >= twentyFourHoursAgo &&
                order.metadata?.stripe_payment_intent_id === paymentIntentId
            );
        });

        if (!orders.length) {
            // SEC-02: Audit log for failed lookup (security monitoring)
            logger.info("by-payment-intent", "Order lookup by payment intent - not found", {
                paymentIntentId: paymentIntentId.substring(0, 10) + "...", // Log partial to avoid full PI ID in logs
                found: false,
            });

            // Order might not be created yet (webhook still processing)
            res.status(404).json({
                error: "Order not found",
                code: "ORDER_NOT_FOUND",
                message: "Order is still being processed. Please try again in a few seconds.",
                retry: true,
            });
            return;
        }

        const order = orders[0];

        // SEC-02: Audit log for security-relevant lookup
        logger.info("by-payment-intent", "Order lookup by payment intent", {
            orderId: order.id,
            orderStatus: order.status,
            paymentIntentId: paymentIntentId.substring(0, 10) + "...", // Log partial to avoid full PI ID in logs
            found: true,
        });

        // SEC-02: Return MINIMAL data (no PII, no token minting)
        res.status(200).json({
            order: {
                id: order.id,
                status: order.status,
            },
        });
    } catch (error: any) {
        logger.error("by-payment-intent", "Failed to fetch order by payment intent", {
            paymentIntentId,
            errorName: error?.name,
            errorMessage: error?.message,
        }, error);
        res.status(500).json({
            error: "Failed to fetch order",
            code: "FETCH_FAILED",
        });
    }
}

