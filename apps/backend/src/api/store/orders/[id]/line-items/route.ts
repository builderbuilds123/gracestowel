import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import {
    addItemToOrderWorkflow,
    InsufficientStockError,
    InvalidOrderStateError,
    InvalidPaymentStateError,
    CardDeclinedError,
    AuthMismatchError,
    TokenExpiredError,
    TokenInvalidError,
    TokenMismatchError,
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

    if (!b.variant_id || typeof b.variant_id !== "string" || b.variant_id.length === 0) {
        errors.variant_id = ["variant_id is required and must be a non-empty string"];
    }

    if (b.quantity === undefined || b.quantity === null) {
        errors.quantity = ["quantity is required"];
    } else if (typeof b.quantity !== "number" || !Number.isInteger(b.quantity) || b.quantity <= 0) {
        errors.quantity = ["quantity must be a positive integer"];
    }

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

    const { variant_id, quantity, metadata } = parseResult.data!;

    // Generate stable request ID for idempotency
    // Use x-request-id header if provided, otherwise generate a UUID
    const requestId = (req.headers["x-request-id"] as string) || crypto.randomUUID();

    try {
        const result = await addItemToOrderWorkflow(req.scope).run({
            input: {
                orderId: id,
                modificationToken: token,
                variantId: variant_id,
                quantity,
                metadata,
                requestId,
            },
        });

        res.status(200).json({
            order: result.result.order,
            payment_status: result.result.payment_status,
        });
    } catch (error) {
        // FIX: Use proper error type checks instead of string matching

        // 409 Conflict - Stock issues
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

        // 422 Unprocessable Entity - State issues
        if (error instanceof InvalidOrderStateError) {
            res.status(422).json({
                code: "invalid_state",
                message: error.message,
                order_id: error.orderId,
                current_status: error.status,
            });
            return;
        }

        if (error instanceof InvalidPaymentStateError) {
            res.status(422).json({
                code: "invalid_payment_state",
                message: error.message,
                payment_intent_id: error.paymentIntentId,
                current_status: error.status,
            });
            return;
        }

        // 402 Payment Required - Card declined
        if (error instanceof CardDeclinedError) {
            res.status(402).json({
                code: "card_declined",
                message: error.message,
                stripe_code: error.stripeCode,
                decline_code: error.declineCode,
            });
            return;
        }

        // 500 Internal Server Error - Critical auth mismatch
        if (error instanceof AuthMismatchError) {
            console.error("CRITICAL: AuthMismatch during line item addition", error);
            res.status(500).json({
                code: "AUTH_MISMATCH_OVERSOLD",
                message: "A critical error occurred. Please contact support.",
            });
            return;
        }

        // 401 Unauthorized - Token expired/invalid
        if (error instanceof TokenExpiredError) {
            res.status(401).json({
                code: error.code,
                message: error.message,
                expired: true,
            });
            return;
        }

        if (error instanceof TokenInvalidError) {
            res.status(401).json({
                code: error.code,
                message: error.message,
            });
            return;
        }

        // 403 Forbidden - Token mismatch
        if (error instanceof TokenMismatchError) {
            res.status(403).json({
                code: error.code,
                message: error.message,
            });
            return;
        }

        // Handle remaining errors with message pattern matching as fallback
        const errorMessage = (error as Error).message || "";

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
                message: `No price found for variant.`,
            });
            return;
        }

        if (errorMessage.includes("NO_PAYMENT_INTENT")) {
            res.status(400).json({
                code: "NO_PAYMENT_INTENT",
                message: `Order has no associated payment intent.`,
            });
            return;
        }

        // Generic error handler
        console.error("[line-items] Error adding item to order:", error);
        res.status(500).json({
            code: "ADD_ITEMS_FAILED",
            message: "An error occurred while adding items.",
        });
    }
}
