import { type ActionFunctionArgs, data } from "react-router";
import { MedusaCartService } from "../services/medusa-cart";
import { createLogger, getTraceIdFromRequest } from "../lib/logger";

interface AddShippingMethodRequest {
  option_id: string;
}

/**
 * POST /api/carts/:id/shipping-methods
 * Add a shipping method to the cart
 * 
 * SHP-01: This persists the customer's shipping selection to the cart
 * so it is available when the order is created from cart data.
 * 
 * This endpoint replaces any existing shipping method on the cart.
 */
import { validateCSRFToken } from "../utils/csrf.server";

// ... (imports)

export async function action({ request, params, context }: ActionFunctionArgs) {
  const traceId = getTraceIdFromRequest(request);
  const logger = createLogger({ traceId });

  if (request.method !== "POST") {
    return data({ error: "Method not allowed" }, { status: 405 });
  }

  // CSRF Check
  const env = context.cloudflare.env as any;
  const jwtSecret = env.JWT_SECRET || "dev-secret-key";
  const isValidCSRF = await validateCSRFToken(request, jwtSecret);
  if (!isValidCSRF) {
     return data({ error: "Invalid CSRF token" }, { status: 403 });
  }

  const cartId = params.id;
  if (!cartId) {
    return data({ error: "Cart ID is required" }, { status: 400 });
  }

  let body: AddShippingMethodRequest;
  try {
    body = await request.json();
  } catch {
    return data({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { option_id } = body;

  if (!option_id) {
    return data({ error: "'option_id' is required" }, { status: 400 });
  }

  // Validate option_id format (Medusa shipping option IDs start with "so_")
  if (!option_id.startsWith("so_")) {
    return data({ 
      error: "Invalid shipping option ID format",
      details: "Shipping option IDs must start with 'so_'"
    }, { status: 400 });
  }

  const service = new MedusaCartService(context);

  try {
    // Verify cart exists (SHP-01 Review Fix: Handle expired carts)
    const cart = await service.getCart(cartId);
    if (!cart) {
      logger.warn('[SHP-01] Cart not found (possibly expired)', { cartId, optionId: option_id });
      return data({
        error: "Cart not found",
        code: "CART_EXPIRED",
        details: "The cart may have expired. Please refresh the page to create a new cart."
      }, { status: 404 });
    }

    // Add shipping method to cart
    const updatedCart = await service.addShippingMethod(cartId, option_id);

    // SHP-01 Review Fix (Issue 9): Use structured logging instead of console.log
    logger.info('[SHP-01] Added shipping method to cart', { 
      cartId, 
      optionId: option_id 
    });

    return data({
      success: true,
      cart_id: cartId,
      shipping_method_id: option_id,
      shipping_methods: updatedCart.shipping_methods,
    }, { status: 200 });

  } catch (error: any) {
    logger.error('[SHP-01] Error adding shipping method to cart', error as Error, { 
      cartId, 
      optionId: option_id 
    });
    
    // Determine status code from upstream error
    const status = error.status || 500;
    
    // Forward upstream 4xx errors
    if (status >= 400 && status < 500) {
      return data({
        error: error.message || "Invalid request",
        // Only show detailed errors in development to prevent leaking sensitive info
        details: import.meta.env.DEV ? error.details : undefined,
      }, { status });
    }

    return data({
      error: "Failed to add shipping method",
      details: import.meta.env.DEV ? error.message : undefined,
    }, { status: 502 }); // 502 indicates upstream (Medusa) failure
  }
}
