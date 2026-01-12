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
    OrderShippedError,
} from "../../../../../workflows/cancel-order-with-refund";

// Trigger rebuild
/**
 * POST /store/orders/:id/cancel
 *
 * Story 3.5: Unified Order Cancellation
 * Cancel an order at any time before shipping.
 * - Within modification window: Void authorization
 * - After modification window: Issue refund (if not shipped)
 * Note: Window duration is configured via PAYMENT_CAPTURE_DELAY_MS
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
 * - 401 TOKEN_INVALID: Malformed or invalid token
 * - 403 TOKEN_MISMATCH: Token order_id doesn't match route parameter
 * - 404 ORDER_NOT_FOUND: Order does not exist
 * - 400 ALREADY_CANCELED: Order is already canceled (idempotent 200)
 * - 409 late_cancel: Payment capture in progress, cannot cancel
 * - 409 order_shipped: Order has been shipped, cannot cancel
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

    // Validate the token - Story 3.5: Allow expired tokens for post-capture cancellation
    const validation = modificationTokenService.validateToken(token);

    // Story 3.5: Only reject truly invalid tokens (malformed, wrong signature)
    // Expired tokens are now allowed - workflow will determine void vs refund path
    if (!validation.valid && !validation.expired) {
        res.status(401).json({
            code: "TOKEN_INVALID",
            message: "Invalid modification token",
        });
        return;
    }

    // Verify the token is for this order (check payload even if expired)
    if (validation.payload?.order_id !== id) {
        console.warn(`[CancelOrder] Token mismatch. Token Order ID: ${validation.payload?.order_id}, Request Order ID: ${id}`);
        res.status(403).json({
            code: "TOKEN_MISMATCH",
            message: "Token does not match this order",
        });
        return;
    }

    // Story 3.5: Determine if within grace period for workflow branching
    const remainingTime = modificationTokenService.getRemainingTime(token);
    const isWithinGracePeriod = remainingTime > 0;

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
        // Run the cancellation workflow - Story 3.5: Pass grace period status for branching
        const { result } = await cancelOrderWithRefundWorkflow(req.scope).run({
            input: {
                orderId: id,
                paymentIntentId: validation.payload.payment_intent_id,
                reason: reason || (isWithinGracePeriod
                    ? "Customer requested cancellation within modification window"
                    : "Customer requested cancellation after modification window"),
                isWithinGracePeriod,
            },
        });

        // Story 3.4: Response schema per AC
        res.status(200).json({
            order_id: result.orderId,
            status: "canceled",
            action: "canceled", // Add action for storefront compatibility
        });
    } catch (error) {
        // Story 3.4 AC #4: Race Condition Handling - 409 Conflict
        if (error instanceof LateCancelError) {
            res.status(409).json({
                code: "CANCELLATION_LATE",
                message: "Order is already being processed. Please contact support for refund.",
            });
            return;
        }

        // Story 3.5 AC3: Order Already Shipped - 409 Conflict
        if (error instanceof OrderShippedError) {
            res.status(409).json({
                code: "ORDER_SHIPPED",
                message: error.message,
            });
            return;
        }

        if (error instanceof MissingPaymentCollectionError) {
            res.status(422).json({
                code: "MISSING_PAYMENT_COLLECTION",
                message: "Cannot cancel order: Missing payment information. Please contact support.",
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
