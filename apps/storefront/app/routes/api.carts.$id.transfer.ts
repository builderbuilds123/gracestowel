import { type ActionFunctionArgs, data } from "react-router";
import { MedusaCartService } from "../services/medusa-cart";
import { validateCSRFToken } from "../utils/csrf.server";

/**
 * POST /api/carts/:id/transfer
 * Transfer a guest cart to an authenticated customer
 */
export async function action({ request, params, context }: ActionFunctionArgs) {
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

  const service = new MedusaCartService(context);
  
  try {
    const cart = await service.transferCart(cartId);
    return data({ success: true, cart }, { status: 200 });
  } catch (error: any) {
    console.error(`Error transferring cart ${cartId}:`, error);
    
    // Check if it's already transferred or other client error
    const status = error.status || 500;
    return data({ 
      error: "Failed to transfer cart", 
      details: error.message 
    }, { status });
  }
}
