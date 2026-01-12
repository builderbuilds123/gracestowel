import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { modificationTokenService } from "../../../../../services/modification-token";
import { logger } from "../../../../../utils/logger";
import { formatModificationWindow } from "../../../../../lib/payment-capture-queue";

/**
 * POST /store/orders/:id/address
 *
 * Update the shipping address for an order within the modification window.
 *
 * Headers:
 * - x-modification-token: JWT token from order creation (REQUIRED - must be in header, not body)
 * - x-publishable-api-key: Medusa publishable key (required)
 *
 * Body:
 * - address: The new shipping address (required)
 *   - first_name: string
 *   - last_name: string
 *   - address_1: string
 *   - address_2?: string
 *   - city: string
 *   - province?: string
 *   - postal_code: string
 *   - country_code: string
 *   - phone?: string
 *
 * Error Codes:
 * - 400 TOKEN_REQUIRED: Missing x-modification-token header
 * - 400 ADDRESS_REQUIRED: Missing address in request body
 * - 400 INVALID_ADDRESS: Missing required address fields
 * - 401 TOKEN_EXPIRED: Token has expired
 * - 401 TOKEN_INVALID: Malformed or invalid token
 * - 403 TOKEN_MISMATCH: Token order_id doesn't match route parameter
 * - 404 ORDER_NOT_FOUND: Order does not exist
 * - 400 ORDER_CANCELED: Cannot modify a canceled order
 */
interface UpdateAddressBody {
    address: {
        first_name: string;
        last_name: string;
        address_1: string;
        address_2?: string;
        city: string;
        province?: string;
        postal_code: string;
        country_code: string;
        phone?: string;
    };
}

function validateRequestBody(body: unknown): {
    valid: boolean;
    data?: UpdateAddressBody;
    error?: { code: string; message: string };
} {
    if (!body || typeof body !== "object") {
        return { valid: false, error: { code: "ADDRESS_REQUIRED", message: "Address is required in request body" } };
    }

    const b = body as Record<string, unknown>;
    
    // Check if address object exists
    if (!b.address || typeof b.address !== "object") {
        return { valid: false, error: { code: "ADDRESS_REQUIRED", message: "Address is required in request body" } };
    }

    const address = b.address as Record<string, unknown>;
    const requiredFields = ['first_name', 'last_name', 'address_1', 'city', 'postal_code', 'country_code'];
    
    for (const field of requiredFields) {
        if (!address[field] || typeof address[field] !== 'string' || (address[field] as string).trim() === '') {
            return { 
                valid: false, 
                error: { code: "INVALID_ADDRESS", message: `${field} is required` } 
            };
        }
    }

    // Construct valid object
    return {
        valid: true,
        data: {
            address: {
                first_name: address.first_name as string,
                last_name: address.last_name as string,
                address_1: address.address_1 as string,
                address_2: (address.address_2 as string) || undefined,
                city: address.city as string,
                province: (address.province as string) || undefined,
                postal_code: address.postal_code as string,
                country_code: address.country_code as string,
                phone: (address.phone as string) || undefined,
            }
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

    const { address } = validationResult.data!;

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

    // Verify order exists and is not canceled
    const query = req.scope.resolve("query");
    const { data: orders } = await query.graph({
        entity: "order",
        fields: ["id", "status", "shipping_address.*"],
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

    try {
        // Update the shipping address
        const orderService = req.scope.resolve("order");
        
        await orderService.updateOrders([{
            id,
            shipping_address: {
                first_name: address.first_name,
                last_name: address.last_name,
                address_1: address.address_1,
                address_2: address.address_2 || "",
                city: address.city,
                province: address.province || "",
                postal_code: address.postal_code,
                country_code: address.country_code.toLowerCase(),
                phone: address.phone || "",
            },
        }]);

        logger.info("order-address", "Address updated", { orderId: id });

        res.status(200).json({
            success: true,
            message: "Shipping address updated successfully",
            order_id: id,
            new_address: address,
        });
    } catch (error) {
        logger.error("order-address", "Error updating address", { orderId: id }, error instanceof Error ? error : new Error(String(error)));
        res.status(500).json({
            code: "UPDATE_FAILED",
            message: "An error occurred while updating the address. Please try again.",
        });
    }
}
