import { 
    MedusaRequest, 
    MedusaResponse,
    AuthenticatedMedusaRequest,
} from "@medusajs/framework/http";
import { authenticateOrderAccess } from "../../../../utils/order-auth";
import { logger } from "../../../../utils/logger";
import { logOrderModificationAttempt } from "../../../../utils/audit-logger";

/**
 * GET /store/orders/:id
 * 
 * Story 2.2, 2.3: Fetch order details with dual authentication support
 * 
 * Supports:
 * - Customer session (logged-in customers)
 * - Guest token (via x-modification-token header)
 * 
 * Query Parameters:
 * - token: The modification JWT token (optional if customer is logged in)
 */
export async function GET(
    req: MedusaRequest | AuthenticatedMedusaRequest,
    res: MedusaResponse
): Promise<void> {
    const { id } = req.params;

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
                "customer_id",
                "items.*",
                "items.variant.*",
                "items.variant.product.*",
                "shipping_address.*",
                "metadata",
                "payment_collections.*",
                "payment_collections.payments.*",
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

        // Story 2.3: Unified authentication
        const authResult = await authenticateOrderAccess(req, order);

        // Story 2.5: Audit logging
        const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0] || 
                   (req.headers["x-real-ip"] as string) || 
                   req.ip || 
                   "unknown";
        const userAgent = req.headers["user-agent"] || "unknown";

        logOrderModificationAttempt({
            orderId: order.id,
            action: "view",
            authMethod: authResult.method,
            customerId: authResult.customerId,
            ip,
            userAgent,
            success: authResult.authenticated,
            failureReason: authResult.authenticated ? undefined : "UNAUTHORIZED",
        });

        if (!authResult.authenticated) {
            res.status(401).json({
                error: "You do not have permission to view this order.",
                code: "UNAUTHORIZED",
            });
            return;
        }

        // Calculate modification window (if guest token)
        let remainingTime = 0;
        let canModify = false;
        
        if (authResult.method === "guest_token") {
            const token = req.headers["x-modification-token"] as string;
            if (token) {
                const { modificationTokenService } = await import("../../../../services/modification-token");
                remainingTime = modificationTokenService.getRemainingTime(token);
                canModify = remainingTime > 0 && order.status !== "canceled";
            }
        } else {
            // For customer sessions, check eligibility via separate endpoint
            // Frontend will call /store/orders/:id/eligibility separately
            canModify = false; // Will be determined by eligibility check
        }

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
            },
            authMethod: authResult.method,
            canEdit: canModify, // Frontend will call eligibility endpoint separately
            modification: authResult.method === "guest_token" ? {
                can_modify: canModify,
                remaining_seconds: remainingTime,
                expires_at: new Date(Date.now() + remainingTime * 1000).toISOString(),
            } : undefined,
        });
    } catch (error) {
        logger.error("order-view", "Error fetching order", { orderId: id }, error as Error);
        res.status(500).json({
            error: "Failed to fetch order",
            code: "INTERNAL_ERROR",
        });
    }
}

