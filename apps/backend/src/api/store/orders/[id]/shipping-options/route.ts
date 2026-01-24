import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { modificationTokenService } from "../../../../../services/modification-token";
import { logger } from "../../../../../utils/logger";

/**
 * GET /store/orders/:id/shipping-options
 *
 * Get available shipping options for an order's region.
 * Used when editing an order to allow changing the shipping method.
 *
 * Headers:
 * - x-modification-token: JWT token from order creation (REQUIRED)
 * - x-publishable-api-key: Medusa publishable key (required)
 *
 * Returns:
 * - shipping_options: Array of available shipping options with prices
 * - current_shipping_option_id: ID of the currently selected shipping option
 *
 * Error Codes:
 * - 400 TOKEN_REQUIRED: Missing x-modification-token header
 * - 401 TOKEN_EXPIRED: Token has expired
 * - 401 TOKEN_INVALID: Malformed or invalid token
 * - 403 TOKEN_MISMATCH: Token order_id doesn't match route parameter
 * - 404 ORDER_NOT_FOUND: Order does not exist
 */
export async function GET(
    req: MedusaRequest,
    res: MedusaResponse
): Promise<void> {
    const { id } = req.params;
    const token = req.headers["x-modification-token"] as string;

    // Validate required fields
    if (!token) {
        res.status(400).json({
            code: "TOKEN_REQUIRED",
            message: "x-modification-token header is required",
        });
        return;
    }

    // Validate the token
    const validation = modificationTokenService.validateToken(token);

    if (!validation.valid) {
        res.status(401).json({
            code: validation.expired ? "TOKEN_EXPIRED" : "TOKEN_INVALID",
            message: validation.expired
                ? "The modification window has expired"
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

    try {
        // Fetch order with region and shipping methods
        const query = req.scope.resolve("query");
        const { data: orders } = await query.graph({
            entity: "order",
            fields: [
                "id",
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
        const regionId = order.region_id;

        // Get the current shipping option ID
        const currentShippingMethod = order.shipping_methods?.[0] as {
            id: string;
            shipping_option_id?: string;
        } | undefined;
        const currentShippingOptionId = currentShippingMethod?.shipping_option_id || null;

        // Fetch shipping options for the region using fulfillment module
        const fulfillmentModuleService = req.scope.resolve("fulfillment");

        // List shipping options for the region
        const shippingOptions = await fulfillmentModuleService.listShippingOptions({
            context: {
                is_return: false,
                enabled_in_store: true,
            },
        }, {
            relations: ["service_zone", "service_zone.geo_zones", "prices"],
        });

        // Filter shipping options that serve this region
        // Shipping options are linked to service zones which have geo zones
        const filteredOptions = shippingOptions.filter((option: any) => {
            // Skip return options
            if (option.service_zone?.fulfillment_set?.type === "return") {
                return false;
            }

            // Check if any geo zone matches the region
            const geoZones = option.service_zone?.geo_zones || [];
            return geoZones.some((gz: any) => {
                // Geo zones can be country-level or more specific
                // For now, we just check if the option is available
                return true; // Simplified - in production, match against order's country
            });
        });

        // Format response - get price from prices array for flat rate options
        const formattedOptions = filteredOptions.map((opt: any) => ({
            id: opt.id,
            name: opt.name,
            amount: opt.prices?.[0]?.amount || 0,
            price_type: opt.price_type,
            provider_id: opt.provider_id,
        }));

        logger.info("order-shipping-options", "Fetched shipping options for order", {
            orderId: id,
            regionId,
            optionCount: formattedOptions.length,
            currentShippingOptionId,
        });

        res.status(200).json({
            shipping_options: formattedOptions,
            current_shipping_option_id: currentShippingOptionId,
            region_id: regionId,
        });
    } catch (error) {
        logger.error(
            "order-shipping-options",
            "Error fetching shipping options",
            { orderId: id },
            error instanceof Error ? error : new Error(String(error))
        );
        res.status(500).json({
            code: "FETCH_FAILED",
            message: "Failed to fetch shipping options",
        });
    }
}
