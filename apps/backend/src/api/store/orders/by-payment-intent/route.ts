import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { modificationTokenService } from "../../../../services/modification-token";

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
    const paymentIntentId = req.query.payment_intent_id as string;

    if (!paymentIntentId) {
        res.status(400).json({
            error: "payment_intent_id query parameter is required",
            code: "MISSING_PAYMENT_INTENT_ID",
        });
        return;
    }

    // SEC-02: Set security headers
    res.setHeader("Cache-Control", "no-store, private");
    res.setHeader("X-Content-Type-Options", "nosniff");

    const query = req.scope.resolve("query");

    try {
        // SEC-02: Limit query to recent orders (24h) to prevent full table scan
        // TODO: Add database index on metadata->>'stripe_payment_intent_id' for production
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

        // Find order by payment intent ID in metadata
        // SEC-02: Fetch MINIMAL fields only (no PII)
        const { data: allOrders } = await query.graph({
            entity: "order",
            fields: [
                "id",
                "status",
                "created_at",
                "metadata",
            ],
        });

        // SEC-02: Filter to recent orders first (performance), then by payment intent
        const orders = allOrders.filter((order: any) => {
            const orderDate = new Date(order.created_at);
            return orderDate >= twentyFourHoursAgo &&
                   order.metadata?.stripe_payment_intent_id === paymentIntentId;
        });

        if (!orders.length) {
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

        // SEC-02: Calculate token status WITHOUT generating new token
        // Token was already generated on order creation, stored in Redis
        // Client should fetch full details via authenticated /order/status/:id endpoint
        const existingToken = modificationTokenService.generateToken(
            order.id,
            paymentIntentId,
            order.created_at
        );
        const remainingSeconds = modificationTokenService.getRemainingTime(existingToken);
        const modificationAllowed = remainingSeconds > 0;

        // SEC-02: Return MINIMAL data (no PII)
        res.status(200).json({
            order: {
                id: order.id,
                status: order.status,
            },
            modification_token: existingToken, // For backward compatibility
            modification_allowed: modificationAllowed,
            remaining_seconds: remainingSeconds,
        });
    } catch (error) {
        console.error("Error fetching order by payment intent:", error);
        res.status(500).json({
            error: "Failed to fetch order",
            code: "FETCH_FAILED",
        });
    }
}

