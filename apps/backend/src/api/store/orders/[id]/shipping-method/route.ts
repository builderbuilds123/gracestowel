import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { modificationTokenService } from "../../../../../services/modification-token";
import { logger } from "../../../../../utils/logger";
import { formatModificationWindow } from "../../../../../lib/payment-capture-queue";

/**
 * POST /store/orders/:id/shipping-method
 *
 * Update the shipping method for an order within the modification window.
 *
 * Headers:
 * - x-modification-token: JWT token from order creation (REQUIRED)
 * - x-publishable-api-key: Medusa publishable key (required)
 *
 * Body:
 * - shipping_option_id: ID of the new shipping option (required)
 *
 * Error Codes:
 * - 400 TOKEN_REQUIRED: Missing x-modification-token header
 * - 400 SHIPPING_OPTION_REQUIRED: Missing shipping_option_id in request body
 * - 401 TOKEN_EXPIRED: Token has expired
 * - 401 TOKEN_INVALID: Malformed or invalid token
 * - 403 TOKEN_MISMATCH: Token order_id doesn't match route parameter
 * - 404 ORDER_NOT_FOUND: Order does not exist
 * - 404 SHIPPING_OPTION_NOT_FOUND: Shipping option does not exist
 * - 400 ORDER_CANCELED: Cannot modify a canceled order
 * - 400 SAME_SHIPPING_METHOD: New shipping option is the same as current
 */
interface UpdateShippingMethodBody {
    shipping_option_id: string;
}

function validateRequestBody(body: unknown): {
    valid: boolean;
    data?: UpdateShippingMethodBody;
    error?: { code: string; message: string };
} {
    if (!body || typeof body !== "object") {
        return {
            valid: false,
            error: { code: "SHIPPING_OPTION_REQUIRED", message: "shipping_option_id is required in request body" }
        };
    }

    const b = body as Record<string, unknown>;

    if (!b.shipping_option_id || typeof b.shipping_option_id !== "string" || b.shipping_option_id.trim() === "") {
        return {
            valid: false,
            error: { code: "SHIPPING_OPTION_REQUIRED", message: "shipping_option_id is required in request body" }
        };
    }

    return {
        valid: true,
        data: {
            shipping_option_id: b.shipping_option_id as string,
        }
    };
}

export async function POST(
    req: MedusaRequest,
    res: MedusaResponse
): Promise<void> {
    const { id } = req.params;
    const token = req.headers["x-modification-token"] as string;

    // Validate required fields
    if (!token) {
        res.status(400).json({
            code: "TOKEN_REQUIRED",
            message: "x-modification-token header is required. Token must be sent in header, not request body.",
        });
        return;
    }

    const validationResult = validateRequestBody(req.body);
    if (!validationResult.valid) {
        res.status(400).json({
            code: validationResult.error!.code,
            message: validationResult.error!.message,
        });
        return;
    }

    const { shipping_option_id } = validationResult.data!;

    // Validate the token
    const validation = modificationTokenService.validateToken(token);

    if (!validation.valid) {
        res.status(401).json({
            code: validation.expired ? "TOKEN_EXPIRED" : "TOKEN_INVALID",
            message: validation.expired
                ? `The ${formatModificationWindow()} modification window has expired. Please contact support for assistance.`
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
            message: `The ${formatModificationWindow()} modification window has expired. Please contact support for assistance.`,
        });
        return;
    }

    try {
        // Fetch order with shipping methods
        const query = req.scope.resolve("query");
        const { data: orders } = await query.graph({
            entity: "order",
            fields: [
                "id",
                "status",
                "region_id",
                "shipping_methods.*",
                "shipping_methods.shipping_option.*",
            ],
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
                code: "ORDER_CANCELED",
                message: "Cannot modify a canceled order",
            });
            return;
        }

        // Get current shipping method
        const currentShippingMethod = order.shipping_methods?.[0] as {
            id: string;
            shipping_option_id?: string;
            amount?: number;
        } | undefined;
        const currentShippingOptionId = currentShippingMethod?.shipping_option_id;

        // Check if the new shipping option is different
        if (currentShippingOptionId === shipping_option_id) {
            res.status(400).json({
                code: "SAME_SHIPPING_METHOD",
                message: "The selected shipping method is the same as the current one",
            });
            return;
        }

        // Fetch the new shipping option to get its details
        const fulfillmentModuleService = req.scope.resolve("fulfillment");
        const shippingOptions = await fulfillmentModuleService.listShippingOptions({
            id: shipping_option_id,
        }, {
            relations: ["prices"],
        });

        if (!shippingOptions.length) {
            res.status(404).json({
                code: "SHIPPING_OPTION_NOT_FOUND",
                message: "Shipping option not found",
            });
            return;
        }

        const newShippingOption = shippingOptions[0] as {
            id: string;
            name: string;
            price_type?: string;
            prices?: Array<{ amount: number; currency_code?: string }>;
        };

        // Get the price for this shipping option
        // For flat rate options, the price is in the prices array
        const shippingPrice = newShippingOption.prices?.[0]?.amount || 0;

        // Update the shipping method on the order
        // We update the existing shipping method rather than add/remove
        // since this is within the modification window before payment capture
        const orderModuleService = req.scope.resolve("order");

        if (currentShippingMethod) {
            // Update the existing shipping method with new option details
            await orderModuleService.updateOrderShippingMethods({
                id: currentShippingMethod.id,
                name: newShippingOption.name,
                shipping_option_id: shipping_option_id,
                amount: shippingPrice,
            });

            logger.info("order-shipping-method", "Shipping method updated", {
                orderId: id,
                oldShippingOptionId: currentShippingOptionId,
                newShippingOptionId: shipping_option_id,
                newAmount: shippingPrice,
            });

            res.status(200).json({
                success: true,
                message: "Shipping method updated successfully",
                order_id: id,
                shipping_method: {
                    id: currentShippingMethod.id,
                    shipping_option_id: shipping_option_id,
                    name: newShippingOption.name,
                    amount: shippingPrice,
                },
            });
        } else {
            // No existing shipping method - this shouldn't happen for a valid order
            // but handle it gracefully
            res.status(400).json({
                code: "NO_SHIPPING_METHOD",
                message: "Order does not have a shipping method to update",
            });
        }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        logger.error(
            "order-shipping-method",
            "Error updating shipping method",
            { orderId: id, shippingOptionId: shipping_option_id },
            error instanceof Error ? error : new Error(String(error))
        );

        res.status(500).json({
            code: "UPDATE_FAILED",
            message: "An error occurred while updating the shipping method. Please try again.",
            details: process.env.NODE_ENV === "development" ? errorMessage : undefined,
        });
    }
}
