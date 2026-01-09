import { useState, useRef, useEffect } from "react";
import { monitoredFetch } from "../utils/monitored-fetch";

// Check if in development mode
const isDevelopment = import.meta.env.MODE === 'development';

interface PaymentCollectionResult {
  paymentCollectionId: string | null;
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
 * @returns PaymentCollection state (id, loading, error)
 */
export function usePaymentCollection(
  cartId: string | undefined,
  isCartSynced: boolean
): PaymentCollectionResult {
  const [paymentCollectionId, setPaymentCollectionId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          console.log("[usePaymentCollection] Creating Payment Collection...", { cartId });
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
            console.log("[usePaymentCollection] Discarding stale response", { 
              currentRequestId, 
              latestRequestId: requestIdRef.current 
            });
          }
          return;
        }

        if (!response.ok) {
          let errorMessage = "Failed to create payment collection";

          try {
            const contentType = response.headers.get("content-type") || "";

            if (contentType.includes("application/json")) {
              const errorData = await response.json() as { error?: string };
              console.error("[usePaymentCollection] API Error:", errorData);
              if (errorData && typeof errorData.error === "string" && errorData.error.trim()) {
                errorMessage = errorData.error;
              }
            } else {
              const errorText = await response.text().catch(() => "");
              console.error("[usePaymentCollection] Non-JSON API Error Response:", {
                status: response.status,
                statusText: response.statusText,
                body: errorText,
              });
            }
          } catch (parseError) {
            console.error("[usePaymentCollection] Failed to parse error response:", parseError);
          }

          throw new Error(errorMessage);
        }

        const data = await response.json() as { payment_collection: { id: string } };
        
        // Final safety check before state update
        if (currentRequestId !== requestIdRef.current) {
          return;
        }

        const collectionId = data.payment_collection.id;
        setPaymentCollectionId(collectionId);
        lastCartIdRef.current = cartId;

        if (isDevelopment) {
          console.log("[usePaymentCollection] Created:", collectionId);
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
          console.error("[usePaymentCollection] Error:", err);
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
      setPaymentCollectionId(null);
      setError(null);
      lastCartIdRef.current = null;
    }
  }, [cartId]);

  return {
    paymentCollectionId,
    isCreating,
    error,
  };
}
