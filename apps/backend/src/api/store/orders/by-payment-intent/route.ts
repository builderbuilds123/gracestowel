import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { modificationTokenService } from "../../../../services/modification-token";

/**
 * GET /store/orders/by-payment-intent?payment_intent_id=pi_xxx
 * 
 * Fetch order details by Stripe PaymentIntent ID.
 * Returns order info and modification token if within the 1-hour window.
 * 
 * This endpoint is used by the frontend after payment to get the order
 * and modification token for the 1-hour modification window.
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

    const query = req.scope.resolve("query");

    try {
        // Find order by payment intent ID in metadata
        // Note: We need to fetch all orders and filter manually since metadata filtering isn't directly supported
        const { data: allOrders } = await query.graph({
            entity: "order",
            fields: [
                "id",
                "status",
                "created_at",
                "total",
                "currency_code",
                "metadata",
                "items.*",
                "shipping_address.*",
            ],
        });

        // Filter orders by payment intent ID in metadata
        const orders = allOrders.filter((order: any) =>
            order.metadata?.stripe_payment_intent_id === paymentIntentId
        );

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

        // Generate a new modification token for this order
        const token = modificationTokenService.generateToken(
            order.id,
            paymentIntentId
        );

        const remainingSeconds = modificationTokenService.getRemainingTime(token);
        const modificationAllowed = remainingSeconds > 0;

        res.status(200).json({
            order: {
                id: order.id,
                status: order.status,
                created_at: order.created_at,
                total: order.total,
                currency_code: order.currency_code,
                items: order.items?.map((item: any) => ({
                    id: item.id,
                    title: item.title,
                    quantity: item.quantity,
                    unit_price: item.unit_price,
                    thumbnail: item.thumbnail,
                })) || [],
                shipping_address: order.shipping_address,
            },
            modification_token: token,
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

