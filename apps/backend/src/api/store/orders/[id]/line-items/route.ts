import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import {
    addItemToOrderWorkflow,
    InsufficientStockError,
    InvalidOrderStateError,
    InvalidPaymentStateError,
    CardDeclinedError,
    AuthMismatchError,
} from "../../../../../workflows/add-item-to-order";

/**
 * POST /store/orders/:id/line-items
 *
 * Add items to an order within the 1-hour modification window.
 * Handles incremental authorization for the additional amount.
 *
 * Headers:
 * - x-modification-token: JWT token from order creation (required)
 *
 * Body:
 * - variant_id: string (required)
 * - quantity: number (required, positive integer)
 * - metadata: object (optional)
 *
 * Response (200 OK):
 * {
 *   "order": {
 *     "id": "ord_123",
 *     "items": [...],
 *     "total": 5500,
 *     "difference_due": 0
 *   },
 *   "payment_status": "succeeded"
 * }
 *
 * Errors:
 * - 400 Bad Request: Invalid input
 * - 401 Unauthorized: Token invalid/expired
 * - 402 Payment Required: Card declined
 * - 403 Forbidden: Token mismatch
 * - 409 Conflict: Insufficient stock
 * - 422 Unprocessable Entity: Invalid order state
 * - 500 Internal Server Error: System error / Auth mismatch
 */

/**
 * Validate the add line item request body
 */
function validateRequestBody(body: unknown): {
    valid: boolean;
    data?: { variant_id: string; quantity: number; metadata?: Record<string, string> };
    errors?: Record<string, string[]>;
} {
    if (!body || typeof body !== "object") {
        return { valid: false, errors: { body: ["Request body is required"] } };
    }

    const errors: Record<string, string[]> = {};
    const b = body as Record<string, unknown>;

    // Validate variant_id
    if (!b.variant_id || typeof b.variant_id !== "string" || b.variant_id.length === 0) {
        errors.variant_id = ["variant_id is required and must be a non-empty string"];
    }

    // Validate quantity
    if (b.quantity === undefined || b.quantity === null) {
        errors.quantity = ["quantity is required"];
    } else if (typeof b.quantity !== "number" || !Number.isInteger(b.quantity) || b.quantity <= 0) {
        errors.quantity = ["quantity must be a positive integer"];
    }

    // Validate metadata (optional)
    if (b.metadata !== undefined && (typeof b.metadata !== "object" || b.metadata === null)) {
        errors.metadata = ["metadata must be an object"];
    }

    if (Object.keys(errors).length > 0) {
        return { valid: false, errors };
    }

    return {
        valid: true,
        data: {
            variant_id: b.variant_id as string,
            quantity: b.quantity as number,
            metadata: b.metadata as Record<string, string> | undefined,
        },
    };
}

export async function POST(
    req: MedusaRequest,
    res: MedusaResponse
): Promise<void> {
    const { id } = req.params;

    // Get modification token from header (per API contract)
    const modificationToken = req.headers["x-modification-token"] as string;

    // Also support token in body for backwards compatibility
    const bodyToken = (req.body as any)?.token as string;
    const token = modificationToken || bodyToken;

    if (!token) {
        res.status(400).json({
            code: "TOKEN_REQUIRED",
            message: "x-modification-token header is required",
        });
        return;
    }

    // Validate request body
    const parseResult = validateRequestBody(req.body);
    if (!parseResult.valid) {
        res.status(400).json({
            code: "INVALID_INPUT",
            message: "Invalid request body",
            errors: parseResult.errors,
        });
        return;
    }

    const { variant_id, quantity, metadata } = parseResult.data!;

    try {
        // Execute the add-item-to-order workflow
        const result = await addItemToOrderWorkflow(req.scope).run({
            input: {
                orderId: id,
                modificationToken: token,
                variantId: variant_id,
                quantity,
                metadata,
            },
        });

        // Return success response matching API contract
        res.status(200).json({
            order: result.result.order,
            payment_status: result.result.payment_status,
        });
    } catch (error) {
        // Handle specific error types with appropriate HTTP codes
        if (error instanceof InsufficientStockError) {
            res.status(409).json({
                code: "insufficient_stock",
                message: error.message,
            });
            return;
        }

        if (error instanceof InvalidOrderStateError) {
            res.status(422).json({
                code: "invalid_state",
                message: error.message,
            });
            return;
        }

        if (error instanceof InvalidPaymentStateError) {
            res.status(422).json({
                code: "invalid_payment_state",
                message: error.message,
            });
            return;
        }

        if (error instanceof CardDeclinedError) {
            res.status(402).json({
                code: "card_declined",
                message: error.message,
            });
            return;
        }

        if (error instanceof AuthMismatchError) {
            // This is the critical rollback trap - 500 with audit logged
            console.error("CRITICAL: AuthMismatch during line item addition", error);
            res.status(500).json({
                code: "AUTH_MISMATCH_OVERSOLD",
                message: "A critical error occurred. Please contact support.",
            });
            return;
        }

        // Handle token errors
        const errorMessage = (error as Error).message || "";
        if (errorMessage.includes("TOKEN_EXPIRED")) {
            res.status(401).json({
                code: "TOKEN_EXPIRED",
                message: "The 1-hour modification window has expired.",
            });
            return;
        }

        if (errorMessage.includes("TOKEN_INVALID")) {
            res.status(401).json({
                code: "TOKEN_INVALID",
                message: "Invalid modification token.",
            });
            return;
        }

        if (errorMessage.includes("TOKEN_MISMATCH")) {
            res.status(403).json({
                code: "TOKEN_MISMATCH",
                message: "Token does not match this order.",
            });
            return;
        }

        if (errorMessage.includes("ORDER_NOT_FOUND")) {
            res.status(404).json({
                code: "ORDER_NOT_FOUND",
                message: `Order ${id} not found.`,
            });
            return;
        }

        if (errorMessage.includes("VARIANT_NOT_FOUND")) {
            res.status(400).json({
                code: "VARIANT_NOT_FOUND",
                message: `Variant ${variant_id} not found.`,
            });
            return;
        }

        if (errorMessage.includes("PRICE_NOT_FOUND")) {
            res.status(400).json({
                code: "PRICE_NOT_FOUND",
                message: `No price found for variant ${variant_id}.`,
            });
            return;
        }

        // Generic error handler
        console.error("[line-items] Error adding item to order:", error);
        res.status(500).json({
            code: "ADD_ITEMS_FAILED",
            message: "An error occurred while adding items. Please try again.",
        });
    }
}
