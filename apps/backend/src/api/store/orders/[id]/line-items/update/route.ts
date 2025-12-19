import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import {
    updateLineItemQuantityWorkflow,
    LineItemNotFoundError,
    InvalidQuantityError,
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

/**
 * POST /store/orders/:id/line-items/update
 *
 * Update quantity of an existing line item.
 *
 * Headers:
 * - x-modification-token: JWT token (required)
 *
 * Body:
 * - item_id: string (required)
 * - quantity: number (required, >= 0)
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
    const modificationToken = req.headers["x-modification-token"] as string;
    const bodyToken = (req.body as any)?.token as string;
    const token = modificationToken || bodyToken;

    if (!token) {
        res.status(400).json({
            code: "TOKEN_REQUIRED",
            message: "x-modification-token header is required",
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
    const requestId = (req.headers["x-request-id"] as string) || crypto.randomUUID();

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
             console.error("CRITICAL: AuthMismatch during update items", error);
             res.status(500).json({
                code: "AUTH_MISMATCH_OVERSOLD",
                message: "A critical error occurred. Please contact support.",
            });
            return;
        }

        console.error("[update-items] Error updating item quantity:", error);
        res.status(500).json({
            code: "UPDATE_FAILED",
            message: "An error occurred while updating the item.",
        });
    }
}
