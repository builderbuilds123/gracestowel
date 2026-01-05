import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { modificationTokenService } from "../../../../services/modification-token";

/**
 * GET /store/orders/:id
 * 
 * Fetch order details with modification token validation.
 * Returns order information including remaining modification time.
 * 
 * Query Parameters:
 * - token: The modification JWT token (required)
 */
export async function GET(
    req: MedusaRequest,
    res: MedusaResponse
): Promise<void> {
    const { id } = req.params;
    const token = (req.query.token as string) || (req.headers["x-modification-token"] as string);

    if (!token) {
        res.status(400).json({
            error: "Modification token is required",
            code: "TOKEN_REQUIRED",
        });
        return;
    }

    // Validate the token
    const validation = modificationTokenService.validateToken(token);

    if (!validation.valid) {
        res.status(401).json({
            error: validation.error,
            code: validation.expired ? "TOKEN_EXPIRED" : "TOKEN_INVALID",
            expired: validation.expired,
        });
        return;
    }

    // Verify the token is for this order
    if (validation.payload?.order_id !== id) {
        res.status(403).json({
            error: "Token does not match this order",
            code: "TOKEN_MISMATCH",
        });
        return;
    }

    try {
        // Fetch order from database
        const query = req.scope.resolve("query");
        const { data: orders } = await query.graph({
            entity: "order",
            fields: [
                "id",
                "email",
                "status",
                "currency_code",
                "total",
                "subtotal",
                "tax_total",
                "shipping_total",
                "created_at",
                "items.*",
                "items.variant.*",
                "items.variant.product.*",
                "shipping_address.*",
                "metadata",
            ],
            filters: { id },
        });

        if (!orders.length) {
            res.status(404).json({
                error: "Order not found",
                code: "ORDER_NOT_FOUND",
            });
            return;
        }

        const order = orders[0];
        const remainingTime = modificationTokenService.getRemainingTime(token);
        const canModify = remainingTime > 0 && order.status !== "canceled";

        res.status(200).json({
            order: {
                id: order.id,
                email: order.email,
                status: order.status,
                currency_code: order.currency_code,
                total: order.total,
                subtotal: order.subtotal,
                tax_total: order.tax_total,
                shipping_total: order.shipping_total,
                created_at: order.created_at,
                items: order.items?.map((item: any) => ({
                    id: item.id,
                    title: item.variant?.product?.title || item.title,
                    variant_title: item.variant?.title,
                    quantity: item.quantity,
                    unit_price: item.unit_price,
                    thumbnail: item.variant?.product?.thumbnail,
                    metadata: item.metadata,
                })),
                shipping_address: order.shipping_address,
                payment_intent_id: validation.payload?.payment_intent_id,
            },
            modification: {
                can_modify: canModify,
                remaining_seconds: remainingTime,
                expires_at: new Date(Date.now() + remainingTime * 1000).toISOString(),
            },
        });
    } catch (error) {
        console.error("Error fetching order:", error);
        res.status(500).json({
            error: "Failed to fetch order",
            code: "INTERNAL_ERROR",
        });
    }
}

