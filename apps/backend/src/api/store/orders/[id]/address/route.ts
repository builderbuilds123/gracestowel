import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { modificationTokenService } from "../../../../../services/modification-token";

/**
 * POST /store/orders/:id/address
 * 
 * Update the shipping address for an order within the 1-hour modification window.
 * 
 * Body:
 * - token: The modification JWT token (required)
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
 */
export async function POST(
    req: MedusaRequest,
    res: MedusaResponse
): Promise<void> {
    const { id } = req.params;
    const { token, address } = req.body as {
        token: string;
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
    };

    // Validate required fields
    if (!token) {
        res.status(400).json({
            error: "Modification token is required",
            code: "TOKEN_REQUIRED",
        });
        return;
    }

    if (!address) {
        res.status(400).json({
            error: "Address is required",
            code: "ADDRESS_REQUIRED",
        });
        return;
    }

    // Validate address fields
    const requiredFields = ['first_name', 'last_name', 'address_1', 'city', 'postal_code', 'country_code'];
    for (const field of requiredFields) {
        if (!address[field as keyof typeof address]) {
            res.status(400).json({
                error: `${field} is required`,
                code: "INVALID_ADDRESS",
            });
            return;
        }
    }

    // Validate the token
    const validation = modificationTokenService.validateToken(token);

    if (!validation.valid) {
        res.status(401).json({
            error: validation.error,
            code: validation.expired ? "TOKEN_EXPIRED" : "TOKEN_INVALID",
            expired: validation.expired,
            message: validation.expired 
                ? "The 1-hour modification window has expired. Please contact support for assistance."
                : "Invalid modification token",
        });
        return;
    }

    // Verify the token is for this order
    if (validation.payload?.order_id !== id) {
        res.status(403).json({
            error: "Token does not match this order",
            code: "TOKEN_MISMATCH",
        });
        return;
    }

    // Check if the order is still within the modification window
    const remainingTime = modificationTokenService.getRemainingTime(token);
    if (remainingTime <= 0) {
        res.status(400).json({
            error: "Modification window has expired",
            code: "WINDOW_EXPIRED",
            message: "The 1-hour modification window has expired. Please contact support for assistance.",
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
            error: "Order not found",
            code: "ORDER_NOT_FOUND",
        });
        return;
    }

    const order = orders[0];
    if (order.status === "canceled") {
        res.status(400).json({
            error: "Cannot modify a canceled order",
            code: "ORDER_CANCELED",
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

        console.log(`Address updated for order ${id}`);

        res.status(200).json({
            success: true,
            message: "Shipping address updated successfully",
            order_id: id,
            new_address: address,
        });
    } catch (error) {
        console.error("Error updating address:", error);
        res.status(500).json({
            error: "Failed to update address",
            code: "UPDATE_FAILED",
            message: "An error occurred while updating the address. Please try again.",
        });
    }
}

