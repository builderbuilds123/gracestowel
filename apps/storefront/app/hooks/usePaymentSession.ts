import { useState, useRef, useEffect } from "react";
import { monitoredFetch } from "../utils/monitored-fetch";
import type { ShippingOption } from "../components/CheckoutForm";

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
 * Creates/syncs PaymentSession when payment collection is available.
 * Uses request ID pattern to handle cart total and shipping changes
 * without race conditions.
 * 
 * Important: clientSecret is set only once per session to satisfy
 * Stripe Elements requirement that it doesn't change mid-lifecycle.
 * 
 * @param paymentCollectionId - The Medusa payment collection ID
 * @param cartTotal - Current cart total (triggers re-sync when changed)
 * @param selectedShipping - Selected shipping option
 * @param currency - Cart currency
 * @returns PaymentSession state (clientSecret, paymentIntentId, loading, error)
 */
export function usePaymentSession(
  paymentCollectionId: string | null,
  cartTotal: number,
  selectedShipping: ShippingOption | null,
  currency: string
): PaymentSessionResult {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Request ID pattern: ensures only the latest request's result is applied
  const requestIdRef = useRef(0);
  // Track if we've set the initial clientSecret (should only be set once)
  const isInitialized = useRef(false);

  useEffect(() => {
    // Early exit: Need a payment collection to create a session
    if (!paymentCollectionId) {
      return;
    }

    // Early exit: Don't sync if cart is empty
    if (cartTotal <= 0) {
      return;
    }

    const controller = new AbortController();
    const currentRequestId = ++requestIdRef.current;

    const syncPaymentSession = async () => {
      // Safety check: ensure we're still the latest request
      if (currentRequestId !== requestIdRef.current) {
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        if (isDevelopment) {
          console.log("[usePaymentSession] Creating/syncing Payment Session...", {
            paymentCollectionId,
            cartTotal,
            shippingId: selectedShipping?.id,
          });
        }

        const response = await monitoredFetch(
          `/api/payment-collections/${paymentCollectionId}/sessions`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ provider_id: "pp_stripe" }),
            signal: controller.signal,
            label: "create-payment-session",
          }
        );

        // Check if this request is still relevant
        if (currentRequestId !== requestIdRef.current) {
          if (isDevelopment) {
            console.log("[usePaymentSession] Discarding stale response", {
              currentRequestId,
              latestRequestId: requestIdRef.current,
            });
          }
          return;
        }

        if (!response.ok) {
          let errorMessage = "Failed to create payment session";
          let errorBody: unknown = null;

          try {
            const contentType = response.headers.get("content-type");
            if (contentType && contentType.includes("application/json")) {
              const errorData = (await response.json()) as { error?: string };
              errorBody = errorData;
              if (errorData && typeof errorData.error === "string") {
                errorMessage = errorData.error;
              }
            } else {
              // Fallback for non-JSON error responses
              errorBody = await response.text();
            }
          } catch (parseError) {
            console.error(
              "[usePaymentSession] Failed to parse error response",
              parseError
            );
          }

          console.error("[usePaymentSession] API Error:", errorBody);
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

        // Set clientSecret only on first initialization
        // Stripe Elements requires the clientSecret to remain stable
        if (!isInitialized.current) {
          setClientSecret(stripeSession.data.client_secret);
          isInitialized.current = true;
          
          if (isDevelopment) {
            console.log("[usePaymentSession] Initial clientSecret set");
          }
        }

        // PaymentIntent ID can be updated (for reference/logging)
        if (stripeSession.data.id) {
          setPaymentIntentId(stripeSession.data.id);
        }

        if (isDevelopment) {
          console.log("[usePaymentSession] Session synced successfully");
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
          console.error("[usePaymentSession] Error:", err);
        }
      } finally {
        // Only update loading state if we're still the relevant request
        if (currentRequestId === requestIdRef.current) {
          setIsLoading(false);
        }
      }
    };

    // Debounce to batch rapid cart total / shipping changes
    const DEBOUNCE_MS = 300;
    const timer = setTimeout(syncPaymentSession, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [paymentCollectionId, cartTotal, selectedShipping?.id, selectedShipping?.amount, currency]);

  return {
    clientSecret,
    paymentIntentId,
    isLoading,
    error,
  };
}
