import { useState, useRef, useEffect } from "react";
import { monitoredFetch } from "../utils/monitored-fetch";
import { createLogger } from "../lib/logger";

// Check if in development mode
const isDevelopment = import.meta.env.MODE === 'development';

interface PaymentSessionResult {
  clientSecret: string | null;
  paymentIntentId: string | null;
  isLoading: boolean;
  error: string | null;
}

interface PaymentSessionData {
  id: string;
  provider_id: string;
  data?: {
    client_secret?: string;
    id?: string;
    [key: string]: unknown;
  };
}

interface PaymentSessionResponse {
  payment_collection?: {
    payment_sessions?: PaymentSessionData[];
  };
}

/**
 * Hook to manage PaymentSession creation and synchronization.
 * 
 * CHK-02-B FIX: Two-phase approach:
 * 1. Create session initially (for Stripe Elements to render)
 * 2. After shipping is persisted, refresh to get the updated session that Medusa created
 * 
 * @param paymentCollectionId - The Medusa payment collection ID
 * @param shouldCreateSession - Whether to create/refresh the session
 * @returns PaymentSession state (clientSecret, paymentIntentId, loading, error)
 */
export function usePaymentSession(
  paymentCollectionId: string | null,
  shouldCreateSession: boolean,
  initialSession: PaymentSessionData | null = null
): PaymentSessionResult {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);
  
  const logger = useRef(createLogger({ context: 'usePaymentSession' })).current;

  // Track if we've created the initial session (to avoid re-creating)
  const hasCreatedSession = useRef(false);
  // Request ID pattern: ensures only the latest request's result is applied
  const requestIdRef = useRef(0);

  useEffect(() => {
    // Early exit: Need a payment collection to create a session
    if (!paymentCollectionId) {
      return;
    }

    // Early exit: Don't run if not ready to create
    if (!shouldCreateSession) {
      return;
    }

    const controller = new AbortController();
    const currentRequestId = ++requestIdRef.current;
    
    // Determine if we should create a new session or refresh existing
    const isRefresh = hasCreatedSession.current;

    // Optimization: Use initial session if provided and not yet created
    if (initialSession && !hasCreatedSession.current && !clientSecret) {
       if (isDevelopment) {
         logger.info("Using initial session from collection", { 
           id: initialSession.id 
         });
       }
       
       if (initialSession.data?.client_secret) {
          setClientSecret(initialSession.data.client_secret);
          setPaymentIntentId(initialSession.id);
          hasCreatedSession.current = true;
          return;
       }
    }



    const syncPaymentSession = async () => {
      // Safety check: ensure we're still the latest request
      if (currentRequestId !== requestIdRef.current) {
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        if (isDevelopment) {
          logger.info("Syncing Payment Session...", {
            paymentCollectionId,
            isRefresh,
          });
        }

        // Always POST to create/update session - Medusa will handle idempotency
        const response = await monitoredFetch(
          `/api/payment-collections/${paymentCollectionId}/sessions`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ provider_id: "pp_stripe" }),
            signal: controller.signal,
            label: isRefresh ? "refresh-payment-session" : "create-payment-session",
          }
        );

        // Check if this request is still relevant
        if (currentRequestId !== requestIdRef.current) {
          if (isDevelopment) {
            logger.info("Discarding stale response", {
              currentRequestId,
              latestRequestId: requestIdRef.current,
            });
          }
          return;
        }

        if (!response.ok) {
          let errorMessage = "Failed to sync payment session";
          let errorBody: unknown = null;

          try {
            const contentType = response.headers?.get("content-type");
            if (contentType && contentType.includes("application/json")) {
              const errorData = (await response.json()) as { error?: string };
              errorBody = errorData;
              if (errorData) {
                if (typeof errorData.error === "string") {
                  errorMessage = errorData.error;
                } else if (typeof (errorData as any).message === "string") {
                  errorMessage = (errorData as any).message;
                }
              }
            } else {
              // Fallback for non-JSON error responses
              errorBody = await response.text();
            }
          } catch (parseError) {
            logger.error(
              "Failed to parse error response",
              parseError as Error
            );
          }

          logger.error("API Error", undefined, errorBody as Record<string, unknown>);
          throw new Error(errorMessage);
        }

        const data = (await response.json()) as PaymentSessionResponse;

        // Final safety check before state update
        if (currentRequestId !== requestIdRef.current) {
          return;
        }

        // Extract stripe session from response
        const sessions = data.payment_collection?.payment_sessions;
        if (!sessions || sessions.length === 0) {
          throw new Error("No payment sessions found in response");
        }

        const stripeSession = sessions.find((s) => s.provider_id === "pp_stripe");
        if (!stripeSession) {
          throw new Error("Stripe payment session not found in response");
        }

        if (!stripeSession.data?.client_secret) {
          throw new Error("Client secret not found in payment session data");
        }

        // Mark that we've created a session
        hasCreatedSession.current = true;

        // Update clientSecret
        setClientSecret(stripeSession.data.client_secret);
        
        if (isDevelopment) {
          logger.info("clientSecret updated", {
            isRefresh,
            secretPrefix: stripeSession.data.client_secret.substring(0, 8) + "****",
          });
        }

        // PaymentIntent ID can be updated (for reference/logging)
        if (stripeSession.data.id) {
          setPaymentIntentId(stripeSession.data.id);
        }

        if (isDevelopment) {
          logger.info("Session synced successfully");
        }
      } catch (err) {
        // Ignore abort errors
        if ((err as Error).name === "AbortError") {
          return;
        }

        // Only set error if we're still the relevant request
        if (currentRequestId === requestIdRef.current) {
          const message = err instanceof Error 
            ? err.message 
            : "Failed to initialize payment session";
          setError(message);
          logger.error("Error", err as Error);
        }
      } finally {
        // Only update loading state if we're still the relevant request
        if (currentRequestId === requestIdRef.current) {
          setIsLoading(false);
        }
      }
    };

    // Sync session when ready
    syncPaymentSession();

    return () => {
      controller.abort();
    };
  }, [paymentCollectionId, shouldCreateSession, initialSession]);

  return {
    clientSecret,
    paymentIntentId,
    isLoading,
    error,
  };
}
