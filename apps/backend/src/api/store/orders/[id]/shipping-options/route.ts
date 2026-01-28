import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { Modules } from "@medusajs/framework/utils";
import { listShippingOptionsForCartWorkflow } from "@medusajs/medusa/core-flows";
import { modificationTokenService } from "../../../../../services/modification-token";
import { logger } from "../../../../../utils/logger";

/**
 * GET /store/orders/:id/shipping-options
 *
 * Get available shipping options for an order using temporary cart approach.
 * This ensures pricing matches the checkout flow (includes calculated prices,
 * promotions, and pricing rules).
 *
 * Implementation:
 * 1. Creates a temporary cart with order's region, address, and items
 * 2. Uses listShippingOptionsForCartWorkflow for accurate pricing
 * 3. Deletes the temporary cart in finally block (prevents abandoned cart metrics pollution)
 *
 * Headers:
 * - x-modification-token: JWT token from order creation (REQUIRED)
 * - x-publishable-api-key: Medusa publishable key (required)
 *
 * Returns:
 * - shipping_options: Array of available shipping options with calculated prices
 * - current_shipping_option_id: ID of the currently selected shipping option
 *
 * Error Codes:
 * - 400 TOKEN_REQUIRED: Missing x-modification-token header
 * - 401 TOKEN_EXPIRED: Token has expired
 * - 401 TOKEN_INVALID: Malformed or invalid token
 * - 403 TOKEN_MISMATCH: Token order_id doesn't match route parameter
 * - 404 ORDER_NOT_FOUND: Order does not exist
 */

interface OrderItem {
    title: string;
    unit_price: number;
    quantity: number;
    variant_id?: string;
}

interface ShippingAddress {
    first_name?: string;
    last_name?: string;
    address_1?: string;
    address_2?: string;
    city?: string;
    province?: string;
    postal_code?: string;
    country_code?: string;
    phone?: string;
}

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

    let tempCartId: string | null = null;

    try {
        // Fetch order with region, shipping methods, items, and address
        const query = req.scope.resolve("query");
        const { data: orders } = await query.graph({
            entity: "order",
            fields: [
                "id",
                "region_id",
                "currency_code",
                "shipping_address.*",
                "shipping_methods.*",
                "shipping_methods.shipping_option.*",
                "items.*",
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
        const regionId = order.region_id as string | null;
        const currencyCode = (order.currency_code as string | null) || "usd";

        // Validate region exists (required for shipping options)
        if (!regionId) {
            res.status(400).json({
                code: "NO_REGION",
                message: "Order does not have a region assigned",
            });
            return;
        }

        // Get the current shipping option ID
        const currentShippingMethod = order.shipping_methods?.[0] as {
            id: string;
            shipping_option_id?: string;
        } | undefined;
        const currentShippingOptionId = currentShippingMethod?.shipping_option_id || null;

        // Create temporary cart for accurate shipping option pricing
        // This ensures we get the same calculated_price values as checkout
        const cartModuleService = req.scope.resolve(Modules.CART);

        // Prepare cart items from order items
        const orderItems = (order.items || []) as OrderItem[];
        const cartItems = orderItems.map((item) => ({
            title: item.title,
            unit_price: item.unit_price,
            quantity: item.quantity,
            variant_id: item.variant_id,
        }));

        // Prepare shipping address
        const orderAddress = order.shipping_address as ShippingAddress | undefined;
        const shippingAddress = orderAddress ? {
            first_name: orderAddress.first_name || "",
            last_name: orderAddress.last_name || "",
            address_1: orderAddress.address_1 || "",
            address_2: orderAddress.address_2,
            city: orderAddress.city || "",
            province: orderAddress.province,
            postal_code: orderAddress.postal_code || "",
            country_code: orderAddress.country_code || "us",
            phone: orderAddress.phone,
        } : undefined;

        // Create temporary cart
        const tempCart = await cartModuleService.createCarts({
            currency_code: currencyCode,
            region_id: regionId,
            items: cartItems,
            shipping_address: shippingAddress,
            // Mark as temporary for debugging/audit purposes
            metadata: {
                _temp_for_order_edit: true,
                _source_order_id: id,
            },
        });

        tempCartId = tempCart.id;

        logger.info("order-shipping-options", "Created temporary cart for shipping options", {
            orderId: id,
            tempCartId,
            itemCount: cartItems.length,
        });

        // Use the workflow to get shipping options with proper pricing
        const { result: shippingOptions } = await listShippingOptionsForCartWorkflow(req.scope)
            .run({
                input: {
                    cart_id: tempCartId,
                },
            });

        // Format response - use calculated_price for accurate pricing
        const formattedOptions = (shippingOptions || [])
            .filter((opt: any) => !opt.is_return)
            .map((opt: any) => {
                // Use calculated_price for tiered/rule-based pricing (matches checkout flow)
                const calculatedPrice = opt.calculated_price;
                const amount = calculatedPrice?.calculated_amount ?? opt.amount ?? 0;

                return {
                    id: opt.id,
                    name: opt.name,
                    amount,
                    price_type: opt.price_type,
                    provider_id: opt.provider_id,
                };
            });

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
            { orderId: id, tempCartId },
            error instanceof Error ? error : new Error(String(error))
        );
        res.status(500).json({
            code: "FETCH_FAILED",
            message: "Failed to fetch shipping options",
        });
    } finally {
        // CRITICAL: Always delete the temporary cart to prevent abandoned cart metrics pollution
        if (tempCartId) {
            try {
                const cartModuleService = req.scope.resolve(Modules.CART);
                await cartModuleService.deleteCarts([tempCartId]);
                logger.info("order-shipping-options", "Deleted temporary cart", {
                    tempCartId,
                    orderId: id,
                });
            } catch (deleteError) {
                // Log but don't fail the request - the response has already been sent
                logger.error(
                    "order-shipping-options",
                    "Failed to delete temporary cart (manual cleanup may be needed)",
                    { tempCartId, orderId: id },
                    deleteError instanceof Error ? deleteError : new Error(String(deleteError))
                );
            }
        }
    }
}
