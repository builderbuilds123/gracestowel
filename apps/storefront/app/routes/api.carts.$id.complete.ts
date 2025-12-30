import { type ActionFunctionArgs, data } from "react-router";
import { monitoredFetch } from "../utils/monitored-fetch";
import type { CloudflareEnv } from "../utils/monitored-fetch";
import { createLogger, getTraceIdFromRequest } from "../lib/logger";

/**
 * POST /api/carts/:id/complete
 * Complete a cart to create an order (CHK-01: Canonical Medusa checkout flow)
 * 
 * This endpoint calls Medusa's cart.complete() which:
 * - Validates the cart
 * - Creates the order
 * - Returns the order object
 */
export async function action({ request, params, context }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return data({ error: "Method not allowed" }, { status: 405 });
  }

  const traceId = getTraceIdFromRequest(request);
  const logger = createLogger({ traceId });

  const cartId = params.id;
  if (!cartId) {
    logger.error("Cart ID missing from route params");
    return data({ error: "Cart ID is required" }, { status: 400 });
  }

  const env = context.cloudflare.env as CloudflareEnv & {
    MEDUSA_BACKEND_URL?: string;
    MEDUSA_PUBLISHABLE_KEY?: string;
  };

  const medusaBackendUrl = env.MEDUSA_BACKEND_URL || "http://localhost:9000";
  const medusaPublishableKey = env.MEDUSA_PUBLISHABLE_KEY;

  if (!medusaPublishableKey) {
    logger.error("MEDUSA_PUBLISHABLE_KEY not configured");
    return data({ error: "Payment service not configured" }, { status: 500 });
  }

  try {
    logger.info("Completing cart", { cartId });

    // CHK-01: Call Medusa's canonical cart completion endpoint
    const response = await monitoredFetch(
      `${medusaBackendUrl}/store/carts/${cartId}/complete`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-publishable-api-key": medusaPublishableKey,
        },
        label: "complete-cart",
        cloudflareEnv: env,
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      let errorData: any = {};
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { message: errorText };
      }

      logger.error("Cart completion failed", new Error(errorText), {
        cartId,
        status: response.status,
        error: errorData,
      });

      return data(
        {
          error: errorData.message || "Failed to complete cart",
          details: errorData,
          traceId,
        },
        { status: response.status }
      );
    }

    const result = await response.json() as {
      type: string;
      order: any;
    };

    logger.info("Cart completed successfully", {
      cartId,
      orderId: result.order?.id,
      orderDisplayId: result.order?.display_id,
    });

    return data(
      {
        order: result.order,
        traceId,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    logger.error("Cart completion error", error as Error, { cartId });
    return data(
      {
        error: "Failed to complete cart",
        traceId,
      },
      { status: 500 }
    );
  }
}

