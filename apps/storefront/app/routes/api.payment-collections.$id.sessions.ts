import { type ActionFunctionArgs, data } from "react-router";
import { createLogger, getTraceIdFromRequest } from "../lib/logger";
import { monitoredFetch } from "../utils/monitored-fetch";

/**
 * POST /api/payment-collections/:id/sessions
 * Creates a PaymentSession for the given PaymentCollection via Medusa backend.
 */

interface PaymentSessionRequest {
  provider_id?: string;
}

export async function action({ request, params, context }: ActionFunctionArgs) {
  const traceId = getTraceIdFromRequest(request);
  const logger = createLogger({ traceId });
  const { id: collectionId } = params;

  if (request.method !== "POST") {
    return data({ error: "Method not allowed" }, { status: 405 });
  }

  if (!collectionId) {
    logger.error("Collection ID is required");
    return data({ error: "Collection ID is required", traceId }, { status: 400 });
  }

  // Validate collectionId format (Medusa uses pay_col_ or paycol_ prefix)
  if (!(collectionId.startsWith("pay_col_") || collectionId.startsWith("paycol_")) || collectionId.length < 10) {
    logger.error("Invalid collection ID format", undefined, { collectionId });
    return data({ error: "Invalid collection ID format", traceId }, { status: 400 });
  }

  let body: PaymentSessionRequest = {};
  try {
     const raw = await request.text();
     if (raw) {
       try {
         body = JSON.parse(raw);
       } catch (parseError) {
         logger.error("Invalid JSON body", parseError instanceof Error ? parseError : new Error(String(parseError)));
         return data({ error: "Invalid JSON body", traceId }, { status: 400 });
       }
     }
  } catch (e) {
     // If request.text() fails, body remains empty and defaults will be used
     logger.warn("Could not read request body", { error: e });
  }

  const provider_id = body.provider_id || "pp_stripe";
  
  // Validate provider_id format (Medusa uses pp_ prefix for payment providers)
  if (!provider_id.startsWith("pp_") || provider_id.length < 5) {
    logger.error("Invalid provider ID format", undefined, { provider_id });
    return data({ error: "Invalid provider ID format", traceId }, { status: 400 });
  }

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

  try {
    // 3. Create fresh session
    const createUrl = `${medusaBackendUrl}/store/payment-collections/${collectionId}/payment-sessions`;
    const response = await monitoredFetch(createUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-publishable-api-key": publishableKey,
      },
      body: JSON.stringify({ provider_id }),
      label: "create-payment-session",
      cloudflareEnv: env,
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error("Failed to create payment session", new Error(errorText), { 
        status: response.status,
        statusText: response.statusText 
      });
      
      // Don't expose internal error details to clients
      const userMessage = response.status === 404
        ? "Payment collection not found"
        : response.status === 400
        ? "Invalid request"
        : "Failed to create payment session";
      
      return data({ error: userMessage, traceId }, { status: response.status });
    }

    const json = await response.json();
    return data(json);

  } catch (error) {
    logger.error("Error creating payment session", error as Error);
    return data({ error: "Internal server error", traceId }, { status: 500 });
  }
}
