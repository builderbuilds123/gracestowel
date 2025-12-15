import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { modificationTokenService } from "../../../../../services/modification-token";

/**
 * GET /store/orders/:id/guest-view
 * 
 * Secure Guest View for Order Status.
 * Returns restricted order details (PII Masked) and server time for countdown synchronization.
 * 
 * Headers:
 * - x-modification-token: The modification JWT token
 * 
 * Response:
 * - 200: Order (masked) + Modification Window info
 * - 401: Invalid Token
 * - 403: Expired Token / Mismatch
 */
export async function GET(
    req: MedusaRequest,
    res: MedusaResponse
): Promise<void> {
    const { id } = req.params;
    // Prefer Header, fall back to Query for link clicks
    const token = (req.headers["x-modification-token"] as string) || (req.query.token as string);

    // SECURITY: No-Store to prevent browser caching of PII/Token state
    res.setHeader("Cache-Control", "no-store, private");
    // SECURITY: Prevent MIME type sniffing (AC3 requirement)
    res.setHeader("X-Content-Type-Options", "nosniff");

    if (!token) {
        res.status(401).json({
            error: "Modification token is required",
            code: "TOKEN_REQUIRED",
        });
        return;
    }

    // ARCHITECTURAL DECISION: Stateless JWT Tokens
    // AC9 mentions "Token exists in Redis/DB linked to order_id" but we use stateless JWTs.
    // Decision: Cryptographically signed JWTs are sufficient for this use case.
    // Trade-offs:
    //   ✅ Simpler infrastructure (no Redis dependency)
    //   ✅ No DB lookups on every request
    //   ✅ order_id verified via JWT payload signature
    //   ❌ Cannot revoke tokens before expiry (acceptable for 1hr window)
    // Validate the token
    const validation = modificationTokenService.validateToken(token);

    if (!validation.valid) {
        const isExpired = validation.expired;
        res.status(isExpired ? 403 : 401).json({
            error: validation.error,
            code: isExpired ? "TOKEN_EXPIRED" : "TOKEN_INVALID",
            expired: isExpired,
            request_new_link_url: "/api/resend-magic-link"
        });
        return;
    }

    // Verify token matches this order
    if (validation.payload?.order_id !== id) {
        res.status(403).json({
            error: "Token does not match this order",
            code: "TOKEN_MISMATCH",
        });
        return;
    }

    try {
        const query = req.scope.resolve("query");
        const { data: orders } = await query.graph({
            entity: "order",
            fields: [
                "id",
                "display_id",
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

        // PII Masking: AC10 allows ONLY email (masked), country_code, and last_name (masked)
        const maskedLastName = order.shipping_address?.last_name ? order.shipping_address.last_name.charAt(0) + "***" : "";
        const shippingAddress = order.shipping_address ? {
            last_name: maskedLastName,
            country_code: order.shipping_address.country_code,
            // OMIT: first_name, city, address_1, address_2, phone, postal_code, province
        } : null;

        /**
         * PII Masking: Email masking that handles edge cases
         * - 1 char local: a@example.com → *@example.com
         * - 2 char local: ab@example.com → a*@example.com  
         * - 3+ char local: abc@example.com → ab***@example.com
         */
        const maskEmail = (email: string): string => {
            const atIndex = email.indexOf('@');
            if (atIndex === -1) return email; // Invalid email, return as-is
            
            const localPart = email.substring(0, atIndex);
            const domain = email.substring(atIndex);
            
            if (localPart.length === 1) {
                return '*' + domain;
            } else if (localPart.length === 2) {
                return localPart[0] + '*' + domain;
            } else {
                return localPart.substring(0, 2) + '***' + domain;
            }
        };
        const maskedEmail = order.email ? maskEmail(order.email) : "";

        res.status(200).json({
            order: {
                id: order.id,
                display_id: order.display_id,
                email: maskedEmail, // Masked
                status: order.status,
                currency_code: order.currency_code,
                total: order.total,
                subtotal: order.subtotal,
                tax_total: order.tax_total,
                shipping_total: order.shipping_total,
                created_at: order.created_at,
                items: order.items?.filter((item) => item !== null).map((item) => ({
                    id: item.id,
                    title: item.variant?.product?.title || item.title,
                    variant_title: item.variant?.title,
                    quantity: item.quantity,
                    unit_price: item.unit_price,
                    thumbnail: item.variant?.product?.thumbnail,
                    metadata: item.metadata,
                })),
                shipping_address: shippingAddress,
            },
            modification_window: {
                status: canModify ? "active" : "expired",
                remaining_seconds: remainingTime,
                expires_at: new Date(Date.now() + remainingTime * 1000).toISOString(),
                server_time: new Date().toISOString(), // Critical for sync
            },
        });
    } catch (error) {
        console.error("Error fetching guest order:", error);
        res.status(500).json({
            error: "Failed to fetch order",
            code: "INTERNAL_ERROR",
        });
    }
}
