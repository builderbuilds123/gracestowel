import { type LoaderFunctionArgs, data } from "react-router";
import { MedusaCartService } from "../services/medusa-cart";

/**
 * GET /api/carts/:id/shipping-options
 * Get available shipping options for a cart
 * 
 * This is a pure read operation - cacheable and safe to retry.
 */
export async function loader({ params, context }: LoaderFunctionArgs) {
  const cartId = params.id;
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

    console.log(`Fetched ${shippingOptions.length} shipping options for cart ${cartId} (Total: ${cart.total})`);

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
        // Cache for 60 seconds - shipping options rarely change
        "Cache-Control": "private, max-age=60",
      },
    });

  } catch (error: any) {
    console.error(`Error fetching shipping options for cart ${cartId}:`, error);
    
    // Handle specific error cases
    const status = error.status === 404 || error.message?.includes("not found") ? 404 : 500;
    
    return data({
      error: status === 404 ? "Resource not found" : "Failed to fetch shipping options",
      details: (import.meta.env.DEV || import.meta.env.MODE === 'test') ? error.message : undefined,
    }, { status });
  }
}
