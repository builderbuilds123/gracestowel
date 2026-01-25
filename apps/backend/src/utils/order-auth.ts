/**
 * Unified Order Authentication Utility
 *
 * Story 2.3: Single function that handles both guest and customer authentication
 *
 * Priority:
 * 1. Customer session (if logged in and owns order)
 * 2. Modification token (works for all orders, including those with customer_id)
 *
 * Note: The modification token is issued at checkout completion and allows
 * order modifications within the capture delay window. It works regardless
 * of whether the order has a customer_id, enabling logged-in customers who
 * checked out to still edit their orders via the token.
 *
 * @see docs/product/epics/order-modification-v2.md Story 2.3
 */

import { MedusaRequest } from "@medusajs/framework/http";
import { modificationTokenService } from "../services/modification-token";

export type AuthMethod = "guest_token" | "customer_session" | "none";

export interface AuthResult {
  authenticated: boolean;
  method: AuthMethod;
  customerId: string | null;
}

/**
 * Authenticate order access using either customer session or guest token
 * 
 * @param req - Medusa request object
 * @param order - Order object with id and optional customer_id
 * @returns AuthResult with authentication status and method
 */
export async function authenticateOrderAccess(
  req: MedusaRequest,
  order: { id: string; customer_id?: string | null }
): Promise<AuthResult> {
  // Priority 1: Logged-in customer
  const authContext = (req as any).auth_context;
  const authIdentity = authContext?.auth_identity_id;
  const actorId = authContext?.actor_id; // customer_id

  if (authIdentity && actorId) {
    // Verify customer owns this order
    if (order.customer_id === actorId) {
      return {
        authenticated: true,
        method: "customer_session",
        customerId: actorId,
      };
    }
    // Logged in but doesn't own this order
    return { authenticated: false, method: "none", customerId: null };
  }

  // Priority 2: Modification token (works for both guest and customer orders)
  // The modification token is issued at checkout completion and allows
  // order modifications within the capture delay window, regardless of
  // whether the order has a customer_id.
  const token = req.headers["x-modification-token"] as string | undefined;
  if (token) {
    const validation = modificationTokenService.validateToken(token);
    if (validation.valid && validation.payload?.order_id === order.id) {
      return {
        authenticated: true,
        method: "guest_token", // Keep as guest_token for API compatibility
        customerId: order.customer_id || null,
      };
    }
  }

  return { authenticated: false, method: "none", customerId: null };
}
