import { useState, useRef, useCallback } from "react";
import { createLogger } from "../lib/logger";
import { monitoredFetch } from "../utils/monitored-fetch";
import type { ShippingOption } from "../components/CheckoutForm";

export function useShippingPersistence(cartId?: string, traceId?: string) {
  // SHP-01: Shipping persistence error state
  const [shippingPersistError, setShippingPersistError] = useState<string | null>(null);
  
  // SHP-01 Review Fix (Issue 3): Track if shipping is successfully persisted to block checkout
  const [isShippingPersisted, setIsShippingPersisted] = useState(false);
  
  // SHP-01 Review Fix (Issue 6): Use Set to track in-flight requests for better race condition handling
  const inFlightShippingRequests = useRef<Set<string>>(new Set());
  
  // SHP-01 Review Fix: Track last successfully persisted option to prevent duplicates and race conditions
  const lastPersistedShipping = useRef<string | null>(null);

  /**
   * SHP-01: Persist shipping selection to Medusa cart
   * 
   * This wrapper calls the API to persist the shipping method to the cart
   * so it's available when the order is created. Updates local state after success.
   * 
   * SHP-01 Review Fix (Issue 3): Blocks checkout until shipping is successfully persisted.
   * SHP-01 Review Fix (Issue 6): Uses Set to track in-flight requests for better race condition handling.
   */
  const persistShippingOption = useCallback(async (option: ShippingOption) => {
    const logger = createLogger({ traceId });
    
    // SHP-01 Review Fix (Issue 3): Reset persistence status when selection changes
    setIsShippingPersisted(false);

    // Skip API call if no cartId yet
    if (!cartId) {
      logger.info('[SHP-01] Skipping shipping persist - no cartId yet');
      return;
    }

    // SHP-01 Review Fix (Issue 6): Skip if already persisted successfully (prevent duplicates and race conditions)
    if (lastPersistedShipping.current === option.id) {
      logger.info('[SHP-01] Option already persisted, skipping', { optionId: option.id });
      setShippingPersistError(null);
      setIsShippingPersisted(true);
      return;
    }

    // SHP-01 Review Fix (Issue 6): Skip if we're already persisting this option (prevent duplicate calls)
    if (inFlightShippingRequests.current.has(option.id)) {
      logger.info('[SHP-01] Request already in flight, skipping', { optionId: option.id });
      return;
    }

    // SHP-01 Review Fix (Issue 6): Track in-flight request
    inFlightShippingRequests.current.add(option.id);
    
    try {
      logger.info('[SHP-01] Persisting shipping method to cart', { 
        optionId: option.id, 
        cartId 
      });

      const response = await monitoredFetch(`/api/carts/${cartId}/shipping-methods`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ option_id: option.id }),
        label: 'add-shipping-method',
      });

      if (!response.ok) {
        const error = await response.json() as { error: string; details?: string; code?: string };
        logger.error('[SHP-01] Failed to persist shipping method', undefined, { 
          error: error.error, 
          code: error.code,
          cartId,
          optionId: option.id
        });

        // SHP-01 Review Fix: Handle expired cart specially
        if (error.code === 'CART_EXPIRED') {
          setShippingPersistError(
            'Your cart has expired. Please refresh the page to continue.'
          );
          // Caller (checkout.tsx) needs to handle cartId invalidation if needed, 
          // or we can expose a way to signal this. 
          // For now, we just set the error message.
        } else {
          // SHP-01 Review Fix (Issue 3): Set error state - this will block checkout
          setShippingPersistError(
            'Shipping selection failed to save. Please try again or refresh the page.'
          );
        }
        // SHP-01 Review Fix (Issue 3): Ensure checkout is blocked on failure
        setIsShippingPersisted(false);
      } else {
        // Clear error on success
        setShippingPersistError(null);

        // SHP-01 Review Fix: Track successful persistence
        lastPersistedShipping.current = option.id;
        // SHP-01 Review Fix (Issue 3): Mark as persisted to allow checkout
        setIsShippingPersisted(true);

        logger.info('[SHP-01] Shipping method persisted to cart successfully', { 
          optionId: option.id,
          cartId 
        });
      }
    } catch (error) {
      logger.error('[SHP-01] Error persisting shipping method', error as Error, { 
        cartId,
        optionId: option.id 
      });

      // SHP-01 Review Fix (Issue 3): Set error state - this will block checkout
      setShippingPersistError(
        'Network error saving shipping selection. Please try again.'
      );
      setIsShippingPersisted(false);
    } finally {
      // SHP-01 Review Fix (Issue 6): Remove from in-flight set
      inFlightShippingRequests.current.delete(option.id);
    }
  }, [cartId, traceId]);

  return {
    isShippingPersisted,
    setIsShippingPersisted,
    shippingPersistError,
    // We expose setShippingPersistError in case parent needs to clear it
    setShippingPersistError, 
    persistShippingOption
  };
}
