import { type ActionFunctionArgs, data } from "react-router";
import { createLogger, getTraceIdFromRequest } from "../lib/logger";
import { monitoredFetch } from "../utils/monitored-fetch";

/**
 * POST /api/payment-collections
 * Creates a new PaymentCollection for a cart via Medusa backend.
 */

interface PaymentCollectionRequest {
  cartId: string;
}

export async function action({ request, context }: ActionFunctionArgs) {
  const traceId = getTraceIdFromRequest(request);
  const logger = createLogger({ traceId });

  if (request.method !== "POST") {
    return data({ error: "Method not allowed" }, { status: 405 });
  }

  let body: PaymentCollectionRequest;
  try {
    body = await request.json() as PaymentCollectionRequest;
  } catch (e) {
    return data({ error: "Invalid JSON body", traceId }, { status: 400 });
  }

  const { cartId } = body;

  if (!cartId || typeof cartId !== "string") {
    logger.error("Cart ID is required and must be a string");
    return data({ error: "Cart ID is required and must be a string", traceId }, { status: 400 });
  }

  // Validate cartId format (Medusa uses cart_ prefix)
  if (!cartId.startsWith("cart_") || cartId.length < 10) {
    logger.error("Invalid cart ID format", undefined, { cartId });
    return data({ error: "Invalid cart ID format", traceId }, { status: 400 });
  }

  // Access Cloudflare env
  const env = context.cloudflare.env as {
    MEDUSA_BACKEND_URL?: string;
    MEDUSA_PUBLISHABLE_KEY?: string;
    [key: string]: unknown;
  };

  const medusaBackendUrl = env.MEDUSA_BACKEND_URL || "http://localhost:9000";
  const publishableKey = env.MEDUSA_PUBLISHABLE_KEY;

  if (!publishableKey) {
    logger.error("MEDUSA_PUBLISHABLE_KEY not set");
    return data({ error: "Configuration error", traceId }, { status: 500 });
  }

  logger.info("Creating Payment Collection", { cartId });

  try {
    const response = await monitoredFetch(`${medusaBackendUrl}/store/payment-collections`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-publishable-api-key": publishableKey,
      },
      body: JSON.stringify({ cart_id: cartId }),
      label: "create-payment-collection",
      cloudflareEnv: env,
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error("Failed to create payment collection", new Error(errorText), { 
        status: response.status,
        statusText: response.statusText 
      });
      
      // Handle idempotency: if collection already exists, return success with existing collection
      if (response.status === 409) {
        // Fetch existing collection for this cart
        const existingResponse = await monitoredFetch(`${medusaBackendUrl}/store/payment-collections?cart_id=${cartId}`, {
          method: "GET",
          headers: {
            "x-publishable-api-key": publishableKey,
          },
          label: "fetch-existing-payment-collection",
          cloudflareEnv: env,
        });
        
        if (existingResponse.ok) {
          const existingData = await existingResponse.json();
          
          // Validate that the response contains at least one payment collection and
          // normalize the shape to match the POST /store/payment-collections response.
          const paymentCollections = (existingData as { payment_collections?: unknown[] })?.payment_collections;
          const existingPaymentCollection = Array.isArray(paymentCollections) && paymentCollections.length > 0
            ? paymentCollections[0]
            : undefined;

          if (existingPaymentCollection) {
            logger.info("Payment collection already exists, returning existing", { cartId });
            return data({ payment_collection: existingPaymentCollection });
          }

          // If the structure is not as expected, log and fall through to generic error handling.
          logger.error(
            "Existing payment collection fetch returned unexpected structure",
            undefined,
            { cartId, existingData }
          );
        }
      }
      
      // Don't expose internal error details to clients
      const userMessage = response.status === 404 
        ? "Cart not found"
        : response.status === 409
        ? "Payment collection already exists"
        : "Failed to create payment collection";
      
      return data({ error: userMessage, traceId }, { status: response.status });
    }

    const json = await response.json();
    return data(json);

  } catch (error) {
    logger.error("Error creating payment collection", error as Error);
    return data({ error: "Internal server error", traceId }, { status: 500 });
  }
}
