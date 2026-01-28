import { type LoaderFunctionArgs, data } from "react-router";
import { MedusaCartService } from "../services/medusa-cart";
import { CHECKOUT_CONSTANTS } from "../constants/checkout";
import { createLogger, getTraceIdFromRequest } from "../lib/logger";

/**
 * GET /api/carts/:id/shipping-options
 * Get available shipping options for a cart
 * 
 * This is a pure read operation - cacheable and safe to retry.
 */
export async function loader({ params, context, request }: LoaderFunctionArgs) {
  const cartId = params.id;
  const traceId = getTraceIdFromRequest(request);
  const logger = createLogger({ traceId, context: "api.carts.shipping-options" });

  if (!cartId) {
    return data({ error: "Cart ID is required" }, { status: 400 });
  }

  const service = new MedusaCartService(context);

  try {
    // Verify cart exists
    const cart = await service.getCart(cartId);
    if (!cart) {
      return data({ error: "Cart not found" }, { status: 404 });
    }

    // Get shipping options for the cart
    const shippingOptions = await service.getShippingOptions(cartId);

    logger.info("Fetched shipping options", {
      cartId,
      optionsCount: shippingOptions.length,
      cartTotal: cart.total,
    });

    // Format response - amounts are in dollars from Medusa
    const formattedOptions = shippingOptions.map(opt => ({
      id: opt.id,
      displayName: opt.name,
      amount: opt.amount,
      isFree: opt.amount === 0,
      deliveryEstimate: null, // Could be enhanced with provider-specific estimates
    }));

    return data({
      shipping_options: formattedOptions,
      region_id: cart.region_id,
      cart_id: cartId,
    }, {
      headers: {
        // Cache for a short period - shipping options rarely change
        "Cache-Control": `private, max-age=${CHECKOUT_CONSTANTS.SHIPPING_OPTIONS_CACHE_SECONDS}`,
      },
    });

  } catch (error: any) {
    logger.error("Error fetching shipping options", error instanceof Error ? error : new Error(String(error)), { cartId });

    // Handle specific error cases
    const status = error.status === 404 || error.message?.includes("not found") ? 404 : 500;

    return data({
      error: status === 404 ? "Resource not found" : "Failed to fetch shipping options",
      details: (import.meta.env.DEV || import.meta.env.MODE === 'test') ? error.message : undefined,
    }, { status });
  }
}
