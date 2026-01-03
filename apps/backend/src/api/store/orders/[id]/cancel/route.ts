import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { modificationTokenService } from "../../../../../services/modification-token";
import { logger } from "../../../../../utils/logger";
import { 
    cancelOrderWithRefundWorkflow,
    LateCancelError,
    PartialCaptureError,
    OrderAlreadyCanceledError,
    QueueRemovalError,
    OrderNotFoundError,
} from "../../../../../workflows/cancel-order-with-refund";

/**
 * POST /store/orders/:id/cancel
 *
 * Cancel an order within the 1-hour modification window.
 * Handles payment void/refund and inventory restocking.
 *
 * Headers:
 * - x-modification-token: JWT token from order creation (REQUIRED - must be in header, not body)
 * - x-publishable-api-key: Medusa publishable key (required)
 *
 * Body:
 * - reason: Optional cancellation reason (string)
 *
 * Error Codes:
 * - 400 TOKEN_REQUIRED: Missing x-modification-token header
 * - 401 TOKEN_EXPIRED: Token has expired
 * - 401 TOKEN_INVALID: Malformed or invalid token
 * - 403 TOKEN_MISMATCH: Token order_id doesn't match route parameter
 * - 404 ORDER_NOT_FOUND: Order does not exist
 * - 400 ALREADY_CANCELED: Order is already canceled (idempotent 200)
 * - 409 late_cancel: Payment already captured, cannot cancel
 * - 422 partial_capture: Payment partially captured, manual refund required
 * - 503 service_unavailable: Queue service unavailable, retry later
 */
export async function POST(
    req: MedusaRequest,
    res: MedusaResponse
): Promise<void> {
    const { id } = req.params;
    const token = req.headers["x-modification-token"] as string;
    const { reason } = (req.body ?? {}) as { reason?: string };

    if (!token) {
        res.status(400).json({
            code: "TOKEN_REQUIRED",
            message: "x-modification-token header is required. Token must be sent in header, not request body.",
        });
        return;
    }

    // Validate the token
    const validation = modificationTokenService.validateToken(token);

    if (!validation.valid) {
        res.status(401).json({
            code: validation.expired ? "TOKEN_EXPIRED" : "TOKEN_INVALID",
            message: validation.expired
                ? "The 1-hour modification window has expired. Please contact support for assistance."
                : "Invalid modification token",
            expired: validation.expired,
        });
        return;
    }

    // Verify the token is for this order
    if (validation.payload?.order_id !== id) {
        res.status(403).json({
            code: "TOKEN_MISMATCH",
            message: "Token does not match this order",
        });
        return;
    }

    // Check if the order is still within the modification window
    const remainingTime = modificationTokenService.getRemainingTime(token);
    if (remainingTime <= 0) {
        res.status(400).json({
            code: "WINDOW_EXPIRED",
            message: "The 1-hour modification window has expired. Please contact support for assistance.",
        });
        return;
    }

    // Verify order exists and is not already canceled
    const query = req.scope.resolve("query");
    const { data: orders } = await query.graph({
        entity: "order",
        fields: ["id", "status", "metadata"],
        filters: { id },
    });

    if (!orders.length) {
        res.status(404).json({
            code: "ORDER_NOT_FOUND",
            message: "Order not found",
        });
        return;
    }

    const order = orders[0];
    if (order.status === "canceled") {
        res.status(400).json({
            code: "ALREADY_CANCELED",
            message: "Order is already canceled",
        });
        return;
    }

    try {
        // Run the cancellation workflow
        const { result } = await cancelOrderWithRefundWorkflow(req.scope).run({
            input: {
                orderId: id,
                paymentIntentId: validation.payload.payment_intent_id,
                reason: reason || "Customer requested cancellation within modification window",
            },
        });

        // Story 3.4: Response schema per AC
        res.status(200).json({
            order_id: result.order_id,
            status: result.status,
            payment_action: result.payment_action,
            // Include warning if void failed (zombie case) for monitoring
            ...(result.voidFailed && {
                warning: "Order canceled but payment void failed. Manual intervention may be required.",
            }),
        });
    } catch (error) {
        // Story 3.4 AC #4: Race Condition Handling - 409 Conflict
        if (error instanceof LateCancelError) {
            res.status(409).json({
                code: "late_cancel",
                message: error.message,
            });
            return;
        }

        // Story 3.4 AC #6: Partial Capture - 422 Unprocessable
        if (error instanceof PartialCaptureError) {
            res.status(422).json({
                code: "partial_capture",
                message: error.message,
            });
            return;
        }

        // Story 3.4: Double Cancel - Idempotent 200 (already canceled)
        if (error instanceof OrderAlreadyCanceledError) {
            res.status(200).json({
                order_id: id,
                status: "canceled",
                payment_action: "none",
                message: "Order was already canceled",
            });
            return;
        }

        // Review Fix: Queue removal failure - 503 Service Unavailable
        // User should retry when service is available
        if (error instanceof QueueRemovalError) {
            res.status(503).json({
                code: "service_unavailable",
                message: "Unable to process cancellation at this time. Please try again in a few moments.",
            });
            return;
        }

        // Order not found (race condition - deleted between route check and workflow)
        if (error instanceof OrderNotFoundError) {
            res.status(404).json({
                code: "order_not_found",
                message: error.message,
            });
            return;
        }

        logger.error("order-cancel", "Error canceling order", { orderId: id }, error instanceof Error ? error : new Error(String(error)));
        res.status(500).json({
            code: "CANCELLATION_FAILED",
            message: "An error occurred while processing the cancellation. Please try again or contact support.",
        });
    }
}
