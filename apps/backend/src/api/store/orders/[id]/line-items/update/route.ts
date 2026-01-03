import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import {
    updateLineItemQuantityWorkflow,
    LineItemNotFoundError,
    InvalidQuantityError,
    NoQuantityChangeError,
} from "../../../../../../workflows/update-line-item-quantity";
import {
    InsufficientStockError,
    InvalidOrderStateError,
    InvalidPaymentStateError,
    CardDeclinedError,
    AuthMismatchError,
    TokenExpiredError,
    TokenInvalidError,
    TokenMismatchError,
    OrderNotFoundError,
    PaymentIntentMissingError,
    OrderLockedError,
} from "../../../../../../workflows/add-item-to-order";
import { logger } from "../../../../../../utils/logger";

/**
 * POST /store/orders/:id/line-items/update
 *
 * Update the quantity of an existing line item within the 1-hour modification window.
 * Handles incremental authorization if increasing quantity, refund if decreasing.
 *
 * Headers:
 * - x-modification-token: JWT token from order creation (REQUIRED - must be in header, not body)
 * - x-publishable-api-key: Medusa publishable key (required)
 *
 * Body:
 * - item_id: string (required)
 * - quantity: number (required, non-negative integer)
 *
 * Error Codes:
 * - 400 TOKEN_REQUIRED: Missing x-modification-token header
 * - 401 TOKEN_EXPIRED: Token has expired
 * - 401 TOKEN_INVALID: Malformed or invalid token
 * - 403 TOKEN_MISMATCH: Token order_id doesn't match route parameter
 * - 404 LINE_ITEM_NOT_FOUND: Item ID not found in order
 * - 409 insufficient_stock: Requested quantity exceeds available stock
 * - 422 invalid_state: Order or payment in invalid state for modification
 * - 402 card_declined: Payment authorization failed
 */

interface UpdateItemBody {
    item_id: string;
    quantity: number;
}

function validateRequestBody(body: unknown): {
    valid: boolean;
    data?: UpdateItemBody;
    errors?: Record<string, string[]>;
} {
    if (!body || typeof body !== "object") {
        return { valid: false, errors: { body: ["Request body is required"] } };
    }

    const errors: Record<string, string[]> = {};
    const b = body as Record<string, unknown>;

    if (!b.item_id || typeof b.item_id !== "string") {
        errors.item_id = ["item_id is required and must be a string"];
    }

    if (b.quantity === undefined || b.quantity === null) {
        errors.quantity = ["quantity is required"];
    } else if (typeof b.quantity !== "number" || b.quantity < 0 || !Number.isInteger(b.quantity)) {
        errors.quantity = ["quantity must be a non-negative integer"];
    }

    if (Object.keys(errors).length > 0) {
        return { valid: false, errors };
    }

    return {
        valid: true,
        data: {
            item_id: b.item_id as string,
            quantity: b.quantity as number,
        },
    };
}

export async function POST(
    req: MedusaRequest,
    res: MedusaResponse
): Promise<void> {
    const { id } = req.params;
    const token = req.headers["x-modification-token"] as string;

    if (!token) {
        res.status(400).json({
            code: "TOKEN_REQUIRED",
            message: "x-modification-token header is required. Token must be sent in header, not request body.",
        });
        return;
    }

    const parseResult = validateRequestBody(req.body);
    if (!parseResult.valid) {
        res.status(400).json({
            code: "INVALID_INPUT",
            message: "Invalid request body",
            errors: parseResult.errors,
        });
        return;
    }

    const { item_id, quantity } = parseResult.data!;
    
    // Require x-request-id for idempotency (fallback to UUID only for backward compatibility)
    const requestId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    if (!req.headers["x-request-id"]) {
        logger.warn("order-line-items-update", "Missing x-request-id header - using random UUID (not idempotent)", {
            orderId: id,
            itemId: item_id,
        });
    }

    try {
        const result = await updateLineItemQuantityWorkflow(req.scope).run({
            input: {
                orderId: id,
                modificationToken: token,
                itemId: item_id,
                quantity,
                requestId,
            },
        });

        res.status(200).json({
            order_id: result.result.orderId,
            new_total: result.result.newTotal,
            quantity_diff: result.result.quantityDiff,
            message: "Item quantity updated successfully",
        });

    } catch (error) {
        // Use same robust error handling pattern as add-item and cancel

        // 409 Conflict - Order Locked
        if (error instanceof OrderLockedError) {
            res.status(409).json({ code: error.code, message: error.message });
            return;
        }

        // 409 Conflict - Stock Issues
        if (error instanceof InsufficientStockError) {
            res.status(409).json({
                code: "insufficient_stock",
                message: error.message,
                variant_id: error.variantId,
                available: error.available,
                requested: error.requested,
            });
            return;
        }

        // 404 Not Found
        if (error instanceof OrderNotFoundError) {
            res.status(404).json({ code: error.code, message: error.message, order_id: error.orderId });
            return;
        }
        if (error instanceof LineItemNotFoundError) {
             res.status(404).json({ code: error.code, message: error.message, item_id: error.itemId });
             return;
        }

        // 422 Unprocessable - Invalid State
        if (error instanceof InvalidOrderStateError) {
            res.status(422).json({ code: "invalid_state", message: error.message });
            return;
        }
        if (error instanceof InvalidPaymentStateError) {
            res.status(422).json({ code: "invalid_payment_state", message: error.message });
            return;
        }
        if (error instanceof InvalidQuantityError) {
            res.status(422).json({ code: error.code, message: error.message });
            return;
        }
        
        // 200 OK - No change (not an error, but handled here for consistency)
        if (error instanceof NoQuantityChangeError) {
            res.status(200).json({
                order_id: id,
                message: "Quantity unchanged - no update needed",
                item_id: item_id,
            });
            return;
        }
        if (error instanceof PaymentIntentMissingError) {
            res.status(422).json({ code: error.code, message: error.message });
            return;
        }

        // 401/403 Auth Errors
        if (error instanceof TokenExpiredError) {
            res.status(401).json({ code: error.code, message: error.message, expired: true });
            return;
        }
        if (error instanceof TokenInvalidError) {
            res.status(401).json({ code: error.code, message: error.message });
            return;
        }
        if (error instanceof TokenMismatchError) {
            res.status(403).json({ code: error.code, message: error.message });
            return;
        }

        // 402 Payment Required - Card Declined
        if (error instanceof CardDeclinedError) {
            res.status(402).json({
                code: error.code,
                message: error.userMessage,
                type: error.type,
                retryable: error.retryable,
                decline_code: error.declineCode, // Frontend might use for analytics, though message is sanitized
            });
            return;
        }

        // 500 Critical
        if (error instanceof AuthMismatchError) {
            logger.critical("order-line-items-update", "AUTH_MISMATCH_OVERSOLD - Critical payment mismatch", {
                alert: "CRITICAL",
                issue: "AUTH_MISMATCH_OVERSOLD",
                orderId: id,
                itemId: item_id,
                quantity,
                requestId,
            }, error instanceof Error ? error : new Error(String(error)));
            res.status(500).json({
                code: "AUTH_MISMATCH_OVERSOLD",
                message: "A critical error occurred. Please contact support.",
            });
            return;
        }

        // Generic error handler
        logger.error("order-line-items-update", "Error updating item quantity", {
            orderId: id,
            itemId: item_id,
            quantity,
            requestId,
        }, error instanceof Error ? error : new Error(String(error)));
        res.status(500).json({
            code: "UPDATE_FAILED",
            message: "An error occurred while updating the item.",
        });
    }
}
