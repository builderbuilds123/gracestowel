import { type ActionFunctionArgs, data } from "react-router";
import { createLogger, getTraceIdFromRequest } from "../lib/logger";
import { medusaFetch } from "../lib/medusa-fetch";
import type { CloudflareEnv } from "../utils/monitored-fetch";

// Helper types for Medusa responses
type MedusaPaymentCollection = {
  id: string;
  payment_sessions?: Array<{
    id: string;
    provider_id: string;
    data?: unknown;
  }>;
  [key: string]: unknown;
};

type MedusaError = {
  type: string;
  message: string;
};

/**
 * POST /api/payment-collections
 * Creates a new PaymentCollection for a cart via Medusa backend.
 * OPTIMIZATION: Also initializes the Stripe payment session if missing, avoiding a second round-trip.
 */

interface PaymentCollectionRequest {
  cartId: string;
}

import { resolveCSRFSecret, validateCSRFToken } from "../utils/csrf.server";

// ...

export async function action({ request, context }: ActionFunctionArgs) {
  const traceId = getTraceIdFromRequest(request);
  const logger = createLogger({ traceId });

  if (request.method !== "POST") {
    return data({ error: "Method not allowed" }, { status: 405 });
  }

  // CSRF Check
  const env = context.cloudflare.env as unknown as CloudflareEnv;
  const jwtSecret = resolveCSRFSecret(env.JWT_SECRET);
  if (!jwtSecret) {
    logger.error("JWT_SECRET not configured for CSRF validation");
    return data({ error: "Configuration error", traceId }, { status: 500 });
  }
  const isValidCSRF = await validateCSRFToken(request, jwtSecret);
  if (!isValidCSRF) {
    logger.error("Invalid CSRF token for payment collection creation");
    return data({ error: "Invalid CSRF token", traceId }, { status: 403 });
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


  const medusaBackendUrl = env.MEDUSA_BACKEND_URL || "http://localhost:9000";
  const publishableKey = env.MEDUSA_PUBLISHABLE_KEY;

  if (!publishableKey) {
    logger.error("MEDUSA_PUBLISHABLE_KEY not set");
    return data({ error: "Configuration error", traceId }, { status: 500 });
  }

  logger.info("Initializing Payment Collection & Session", { cartId });

  /* 
   * Helper to ensure Stripe session exists on a collection 
   */
  async function ensureStripeSession(collection: MedusaPaymentCollection): Promise<MedusaPaymentCollection> {
    // 1. Check if Stripe session already exists
    const hasStripeFn = (sessions: MedusaPaymentCollection['payment_sessions']) => 
      sessions?.some(s => s.provider_id === "pp_stripe");

    if (hasStripeFn(collection.payment_sessions)) {
      return collection;
    }

    logger.info("Initial payment collection missing Stripe session, creating one...", { 
      collectionId: collection.id 
    });

    // 2. Create Stripe session
    const sessionRes = await medusaFetch(`/store/payment-collections/${collection.id}/sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ provider_id: "pp_stripe" }),
      label: "create-missing-stripe-session",
      context,
    });

    if (!sessionRes.ok) {
       // Log warning but don't fail the whole request - client can retry session creation
       const errText = await sessionRes.text();
       logger.warn("Failed to auto-create Stripe session", { status: sessionRes.status, body: errText });
       return collection; // Return original collection without session
    }

    // 3. Return updated collection from session response
    const sessionData = await sessionRes.json() as { payment_collection: MedusaPaymentCollection };
    return sessionData.payment_collection;
  }


  try {
    let paymentCollection: MedusaPaymentCollection | undefined;

    // A. Check for existing payment collection first (Idempotency)
    const existingCheckResponse = await medusaFetch(`/store/payment-collections?cart_id=${cartId}`, {
      method: "GET",
      label: "check-existing-payment-collection",
      context,
    });

    if (existingCheckResponse.ok) {
      const existingData = await existingCheckResponse.json();
      const collections = (existingData as { payment_collections?: MedusaPaymentCollection[] })?.payment_collections;
      if (Array.isArray(collections) && collections.length > 0) {
        paymentCollection = collections[0];
        logger.info("Found existing payment collection", { id: paymentCollection.id });
      }
    }

    // B. Create logic if not found
    if (!paymentCollection) {
      const createRes = await medusaFetch(`/store/payment-collections`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ cart_id: cartId }),
        label: "create-payment-collection",
        context,
      });

      if (!createRes.ok) {
        // Handle 409 Conflict race condition (created by another request)
        if (createRes.status === 409) {
           const retryCheck = await medusaFetch(`/store/payment-collections?cart_id=${cartId}`, {
            method: "GET",
            label: "retry-fetch-payment-collection",
            context,
          });
          if (retryCheck.ok) {
            const retryData = await retryCheck.json();
            paymentCollection = (retryData as { payment_collections?: MedusaPaymentCollection[] })?.payment_collections?.[0];
          }
        }
        
        if (!paymentCollection) {
           const errorText = await createRes.text();
           const errorMessage = errorText || "Failed to create payment collection";
           logger.error("Failed to create payment collection", new Error(errorMessage), { status: createRes.status });
           return data({ error: errorMessage, traceId }, { status: createRes.status });
        }
      } else {
        const createData = await createRes.json() as { payment_collection: MedusaPaymentCollection };
        paymentCollection = createData.payment_collection;
      }
    }

    // C. OPTIMIZATION: Ensure Stripe Session Exists
    if (paymentCollection) {
      paymentCollection = await ensureStripeSession(paymentCollection);
    }

    return data({ payment_collection: paymentCollection });

  } catch (error) {
    logger.error("Error creating payment collection", error as Error);
    return data({ error: "Internal server error", traceId }, { status: 500 });
  }
}
