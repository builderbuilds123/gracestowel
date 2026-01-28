import { type ActionFunctionArgs, data } from "react-router";
import { medusaFetch } from "../lib/medusa-fetch";
import type { CloudflareEnv } from "../utils/monitored-fetch";
import { resolveCSRFSecret, validateCSRFToken } from "../utils/csrf.server";
import { createLogger, getTraceIdFromRequest } from "../lib/logger";

/**
 * POST /api/carts/:id/transfer
 * Transfer a guest cart to an authenticated customer
 */
export async function action({ request, params, context }: ActionFunctionArgs) {
  const traceId = getTraceIdFromRequest(request);
  const logger = createLogger({ traceId, context: "api.carts.transfer" });

  if (request.method !== "POST") {
    return data({ error: "Method not allowed" }, { status: 405 });
  }

  // CSRF Check
  const env = context.cloudflare.env as unknown as CloudflareEnv;
  const jwtSecret = resolveCSRFSecret(env.JWT_SECRET);
  if (!jwtSecret) {
    return data({ error: "Server configuration error" }, { status: 500 });
  }
  const isValidCSRF = await validateCSRFToken(request, jwtSecret);
  if (!isValidCSRF) {
    return data({ error: "Invalid CSRF token" }, { status: 403 });
  }

  const cartId = params.id;
  if (!cartId) {
    return data({ error: "Cart ID is required" }, { status: 400 });
  }

  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader) {
      return data({ error: "Unauthorized" }, { status: 401 });
    }

    const response = await medusaFetch(`/store/carts/${cartId}/transfer`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
      },
      context,
      label: "cart-transfer",
    });

    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as { message?: string };
      return data({ error: errorData.message || "Failed to transfer cart" }, { status: response.status });
    }

    const payload = (await response.json()) as { cart?: unknown };
    return data({ success: true, cart: payload.cart }, { status: 200 });
  } catch (error: any) {
    logger.error("Error transferring cart", error instanceof Error ? error : new Error(String(error)), { cartId });

    // Check if it's already transferred or other client error
    const status = error.status || 500;
    return data({
      error: "Failed to transfer cart",
      details: error.message
    }, { status });
  }
}
