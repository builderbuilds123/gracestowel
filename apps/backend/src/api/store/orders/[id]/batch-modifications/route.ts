import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { randomUUID } from "crypto";
import {
    batchModifyOrderWorkflow,
    BatchValidationError,
    TokenExpiredError,
    TokenInvalidError,
    TokenMismatchError,
    InvalidOrderStateError,
    InvalidPaymentStateError,
    OrderLockedError,
    CardDeclinedError,
    BatchItemAction,
} from "../../../../../workflows/batch-modify-order";
import { logger } from "../../../../../utils/logger";

/**
 * POST /store/orders/:id/batch-modifications
 *
 * Batch modify order items within the modification window.
 * Handles multiple item additions in a single transaction with
 * a single Stripe PaymentIntent update.
 *
 * Headers:
 * - x-modification-token: JWT token from order creation (REQUIRED)
 * - x-publishable-api-key: Medusa publishable key (required)
 * - x-request-id: Optional idempotency key
 *
 * Body:
 * - items: Array<{ action: 'add' | 'remove' | 'update_quantity', variant_id: string, quantity: number }>
 *
 * Error Codes:
 * - 400 TOKEN_REQUIRED: Missing x-modification-token header
 * - 400 INVALID_INPUT: Invalid request body
 * - 401 TOKEN_EXPIRED: Token has expired
 * - 401 TOKEN_INVALID: Malformed or invalid token
 * - 403 TOKEN_MISMATCH: Token order_id doesn't match route parameter
 * - 404 ORDER_NOT_FOUND: Order not found
 * - 409 INSUFFICIENT_STOCK: One or more items have insufficient stock
 * - 409 ORDER_LOCKED: Order is being processed for capture
 * - 422 INVALID_ORDER_STATE: Order is not in pending state
 * - 422 INVALID_PAYMENT_STATE: PaymentIntent not in requires_capture state
 * - 402 PAYMENT_DECLINED: Card was declined during authorization increment
 */

interface BatchModificationRequestBody {
    items: Array<{
        action: string;
        variant_id: string;
        quantity: number;
    }>;
}

function validateRequestBody(body: unknown): {
    valid: boolean;
    data?: { items: BatchItemAction[] };
    errors?: Record<string, string[]>;
} {
    if (!body || typeof body !== "object") {
        return { valid: false, errors: { body: ["Request body is required"] } };
    }

    const errors: Record<string, string[]> = {};
    const b = body as Record<string, unknown>;

    if (!b.items || !Array.isArray(b.items)) {
        errors.items = ["items array is required"];
        return { valid: false, errors };
    }

    if (b.items.length === 0) {
        errors.items = ["items array cannot be empty"];
        return { valid: false, errors };
    }

    const validActions = ["add", "remove", "update_quantity"];
    const validatedItems: BatchItemAction[] = [];

    for (let i = 0; i < b.items.length; i++) {
        const item = b.items[i];
        const itemErrors: string[] = [];

        if (!item || typeof item !== "object") {
            errors[`items[${i}]`] = ["Item must be an object"];
            continue;
        }

        const itemObj = item as Record<string, unknown>;

        if (!itemObj.action || typeof itemObj.action !== "string" || !validActions.includes(itemObj.action)) {
            itemErrors.push(`action must be one of: ${validActions.join(", ")}`);
        }

        if (!itemObj.variant_id || typeof itemObj.variant_id !== "string" || itemObj.variant_id.length === 0) {
            itemErrors.push("variant_id is required and must be a non-empty string");
        }

        if (itemObj.quantity === undefined || itemObj.quantity === null) {
            itemErrors.push("quantity is required");
        } else if (typeof itemObj.quantity !== "number" || !Number.isInteger(itemObj.quantity) || itemObj.quantity <= 0) {
            itemErrors.push("quantity must be a positive integer");
        }

        if (itemErrors.length > 0) {
            errors[`items[${i}]`] = itemErrors;
        } else {
            validatedItems.push({
                action: itemObj.action as BatchItemAction["action"],
                variant_id: itemObj.variant_id as string,
                quantity: itemObj.quantity as number,
            });
        }
    }

    if (Object.keys(errors).length > 0) {
        return { valid: false, errors };
    }

    return {
        valid: true,
        data: { items: validatedItems },
    };
}

export async function POST(
    req: MedusaRequest,
    res: MedusaResponse
): Promise<void> {
    const { id: orderId } = req.params;
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

    const { items } = parseResult.data!;
    const requestId = (req.headers["x-request-id"] as string) || randomUUID();

    logger.info("batch-modifications", "Batch modification request received", {
        orderId,
        itemCount: items.length,
        requestId,
        actions: items.map(i => i.action),
    });

    try {
        const result = await batchModifyOrderWorkflow(req.scope).run({
            input: {
                orderId,
                modificationToken: token,
                items,
                requestId,
            },
        });

        logger.info("batch-modifications", "Batch modification completed", {
            orderId,
            itemsAdded: result.result.items_added,
            orderChangeId: result.result.order_change_id,
            paymentStatus: result.result.payment_status,
            requestId,
        });

        res.status(200).json({
            order: result.result.order,
            items_added: result.result.items_added,
            order_change_id: result.result.order_change_id,
            payment_status: result.result.payment_status,
            total_difference: result.result.total_difference,
        });
    } catch (error) {
        // Token errors - 401
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

        // Token mismatch - 403
        if (error instanceof TokenMismatchError) {
            res.status(403).json({
                code: error.code,
                message: error.message,
            });
            return;
        }

        // Batch validation errors (includes stock issues, order not found)
        if (error instanceof BatchValidationError) {
            const status = error.code === "ORDER_NOT_FOUND" ? 404 :
                          error.code === "INSUFFICIENT_STOCK" ? 409 : 400;

            res.status(status).json({
                code: error.code,
                message: error.message,
                failed_items: error.failedItems,
            });
            return;
        }

        // Order state errors - 422
        if (error instanceof InvalidOrderStateError) {
            res.status(422).json({
                code: error.code,
                message: error.message,
                order_id: error.orderId,
                current_status: error.status,
            });
            return;
        }

        if (error instanceof InvalidPaymentStateError) {
            res.status(422).json({
                code: error.code,
                message: error.message,
                payment_intent_id: error.paymentIntentId,
                current_status: error.status,
            });
            return;
        }

        // Order locked - 409
        if (error instanceof OrderLockedError) {
            res.status(409).json({
                code: error.code,
                message: error.message,
            });
            return;
        }

        // Card declined - 402
        if (error instanceof CardDeclinedError) {
            res.status(402).json({
                code: error.code,
                message: error.userMessage,
                decline_code: error.declineCode,
                retryable: error.retryable,
            });
            return;
        }

        // Generic error handler
        let errorMessage = "Unknown error";
        let errorDetails: Record<string, unknown> = {};

        if (error instanceof Error) {
            errorMessage = error.message;
            errorDetails = { stack: error.stack, name: error.name };
        } else if (typeof error === "object" && error !== null) {
            errorMessage = JSON.stringify(error);
            errorDetails = error as Record<string, unknown>;
        } else {
            errorMessage = String(error);
        }

        logger.error("batch-modifications", "Batch modification failed", {
            orderId,
            requestId,
            errorMessage,
            errorDetails,
        }, error instanceof Error ? error : new Error(errorMessage));

        res.status(500).json({
            code: "BATCH_MODIFICATION_FAILED",
            message: "An error occurred while processing batch modifications.",
        });
    }
}
