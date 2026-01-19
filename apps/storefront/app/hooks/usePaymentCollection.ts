import { useState, useRef, useEffect } from "react";
import { monitoredFetch } from "../utils/monitored-fetch";
import { createLogger } from "../lib/logger";

// Check if in development mode
const isDevelopment = import.meta.env.MODE === 'development';

interface PaymentCollectionResult {
  paymentCollectionId: string | null;
  initialPaymentSession: any | null;
  isCreating: boolean;
  error: string | null;
}

/**
 * Hook to manage PaymentCollection creation.
 * 
 * Creates a PaymentCollection once per cart. Uses request ID pattern
 * to safely discard stale responses if cartId changes during request.
 * 
 * @param cartId - The Medusa cart ID
 * @param isCartSynced - Whether the cart items have been synced to Medusa
 * @returns PaymentCollection state (id, loading, error, initialSession)
 */
export function usePaymentCollection(
  cartId: string | undefined,
  isCartSynced: boolean
): PaymentCollectionResult {
  const [paymentCollectionId, setPaymentCollectionId] = useState<string | null>(null);
  const [initialPaymentSession, setInitialPaymentSession] = useState<any | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const logger = useRef(createLogger({ context: 'usePaymentCollection' })).current;

  // Request ID pattern: ensures only the latest request's result is applied
  const requestIdRef = useRef(0);
  // Track which cartId we already created a collection for
  const lastCartIdRef = useRef<string | null>(null);

  useEffect(() => {
    // Early exit conditions
    if (!cartId || !isCartSynced) {
      return;
    }

    // Skip if we already created a collection for this cart
    if (lastCartIdRef.current === cartId && paymentCollectionId) {
      return;
    }

    const controller = new AbortController();
    const currentRequestId = ++requestIdRef.current;

    const createPaymentCollection = async () => {
      // Safety check: ensure we're still the latest request
      if (currentRequestId !== requestIdRef.current) {
        return;
      }

      setIsCreating(true);
      setError(null);

      try {
        if (isDevelopment) {
          logger.info("Creating Payment Collection...", { cartId });
        }

        const response = await monitoredFetch("/api/payment-collections", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cartId }),
          signal: controller.signal,
          label: "create-payment-collection",
        });

        // Check if this request is still relevant
        if (currentRequestId !== requestIdRef.current) {
          if (isDevelopment) {
            logger.info("Discarding stale response", { 
              currentRequestId, 
              latestRequestId: requestIdRef.current 
            });
          }
          return;
        }

        if (!response.ok) {
          let errorMessage = "Failed to create payment collection";

          try {
            const contentType = response.headers?.get("content-type") || "";

            if (contentType.includes("application/json")) {
              const errorData = await response.json() as { error?: string };
              logger.error("API Error", undefined, errorData as Record<string, unknown>);
              if (errorData) {
                if (typeof errorData.error === "string" && errorData.error.trim()) {
                  errorMessage = errorData.error;
                } else if (typeof (errorData as any).message === "string" && (errorData as any).message.trim()) {
                  errorMessage = (errorData as any).message;
                }
              }
            } else {
              const errorText = await response.text().catch(() => "");
              logger.error("Non-JSON API Error Response", undefined, {
                status: response.status,
                statusText: response.statusText,
                body: errorText,
              });
            }
          } catch (parseError) {
            logger.error("Failed to parse error response", parseError as Error);
          }

          throw new Error(errorMessage);
        }

        const data = await response.json() as { 
          payment_collection: { 
            id: string;
            payment_sessions?: Array<{
              id: string;
              provider_id: string;
              data?: {
                client_secret?: string;
                id?: string;
                [key: string]: unknown;
              }
            }>
          } 
        };
        
        // Final safety check before state update
        if (currentRequestId !== requestIdRef.current) {
          return;
        }

        const collection = data.payment_collection;
        const collectionId = collection.id;
        setPaymentCollectionId(collectionId);
        lastCartIdRef.current = cartId;

        // Optimization: Capture initial Stripe session if present
        if (collection.payment_sessions?.length) {
          const stripeSession = collection.payment_sessions.find(s => s.provider_id === "pp_stripe");
          if (stripeSession) {
             setInitialPaymentSession(stripeSession);
          }
        }

        if (isDevelopment) {
          logger.info("Created payment collection", { collectionId });
        }
      } catch (err) {
        // Ignore abort errors
        if ((err as Error).name === "AbortError") {
          return;
        }

        // Only set error if we're still the relevant request
        if (currentRequestId === requestIdRef.current) {
          const message = err instanceof Error ? err.message : "Failed to initialize payment";
          setError(message);
          logger.error("Error creating payment collection", err as Error);
        }
      } finally {
        // Only update loading state if we're still the relevant request
        if (currentRequestId === requestIdRef.current) {
          setIsCreating(false);
        }
      }
    };

    // Debounce to batch rapid cart changes (e.g., quantity updates)
    const DEBOUNCE_MS = 100;
    const timer = setTimeout(createPaymentCollection, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [cartId, isCartSynced, paymentCollectionId]);

  // Auto-reset when cartId changes (new cart)
  useEffect(() => {
    if (cartId !== lastCartIdRef.current && lastCartIdRef.current !== null) {
      if (isDevelopment) {
        logger.info("RESET - cartId changed", {
          oldCartId: lastCartIdRef.current,
          newCartId: cartId,
        });
      }
      setPaymentCollectionId(null);
      setInitialPaymentSession(null);
      setError(null);
      lastCartIdRef.current = null;
    }
  }, [cartId]);

  return {
    paymentCollectionId,
    initialPaymentSession,
    isCreating,
    error,
  };
}
