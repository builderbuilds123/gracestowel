/**
 * GET /store/orders/:id/eligibility
 * 
 * Story 3.3: Check if an order is eligible for editing
 * 
 * Returns eligibility status and error code if not eligible.
 * Used by frontend to determine if checkout edit mode should be enabled.
 * 
 * Supports:
 * - Customer session (logged-in customers)
 * - Guest token (via x-modification-token header)
 */

import { 
    MedusaRequest, 
    MedusaResponse,
    AuthenticatedMedusaRequest,
} from "@medusajs/framework/http";
import { authenticateOrderAccess } from "../../../../../utils/order-auth";
import { checkOrderEditEligibility } from "../../../../../utils/order-eligibility";
import { logger } from "../../../../../utils/logger";
import { logOrderModificationAttempt } from "../../../../../utils/audit-logger";

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
                "fulfillment_status",
                "created_at",
                "customer_id",
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

        // Authenticate access
        const authResult = await authenticateOrderAccess(req, order);

        // Audit logging
        const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0] || 
                   (req.headers["x-real-ip"] as string) || 
                   req.ip || 
                   "unknown";
        const userAgent = req.headers["user-agent"] || "unknown";

        logOrderModificationAttempt({
            orderId: order.id,
            action: "eligibility_check",
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

        // Check eligibility
        const eligibility = await checkOrderEditEligibility(order);

        if (!eligibility.eligible) {
            // Log debug context but don't send to client
            logger.warn("order-eligibility", "Edit rejected", {
                orderId: order.id,
                errorCode: eligibility.errorCode,
                ...eligibility.debugContext,
            });
        }

        res.status(200).json({
            eligible: eligibility.eligible,
            errorCode: eligibility.errorCode || undefined,
        });
    } catch (error) {
        logger.error("order-eligibility", "Error checking eligibility", { orderId: id }, error as Error);
        res.status(500).json({
            error: "Failed to check eligibility",
            code: "INTERNAL_ERROR",
        });
    }
}
