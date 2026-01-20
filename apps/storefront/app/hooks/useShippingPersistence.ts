import { useRef, useCallback, useReducer } from "react";
import { createLogger } from "../lib/logger";
import { monitoredFetch } from "../utils/monitored-fetch";
import type { ShippingOption } from "../components/CheckoutForm";

interface ShippingPersistenceState {
  error: string | null;
  isPersisted: boolean;
}

type ShippingPersistenceAction =
  | { type: 'START_PERSISTING' }
  | { type: 'PERSIST_SUCCESS' }
  | { type: 'PERSIST_FAILURE'; payload: string }
  | { type: 'RESET_PERSISTENCE' };

const initialPersistenceState: ShippingPersistenceState = {
  error: null,
  isPersisted: false,
};

function shippingPersistenceReducer(
  state: ShippingPersistenceState, 
  action: ShippingPersistenceAction
): ShippingPersistenceState {
  switch (action.type) {
    case 'START_PERSISTING':
      return { ...state, isPersisted: false, error: null };
    case 'PERSIST_SUCCESS':
      return { ...state, isPersisted: true, error: null };
    case 'PERSIST_FAILURE':
      return { ...state, isPersisted: false, error: action.payload };
    case 'RESET_PERSISTENCE':
      return { ...state, isPersisted: false, error: null };
    default:
      return state;
  }
}

export function useShippingPersistence(cartId?: string, traceId?: string) {
  const [state, dispatch] = useReducer(shippingPersistenceReducer, initialPersistenceState);
  
  // SHP-01 Review Fix (Issue 6): Use Set to track in-flight requests for better race condition handling
  const inFlightShippingRequests = useRef<Set<string>>(new Set());
  
  // SHP-01 Review Fix: Track last successfully persisted option to prevent duplicates and race conditions
  const lastPersistedShipping = useRef<string | null>(null);

  /**
   * SHP-01: Persist shipping selection to Medusa cart
   */
  const persistShippingOption = useCallback(async (option: ShippingOption) => {
    const logger = createLogger({ traceId });
    
    // SHP-01 Review Fix (Issue 3): Reset persistence status when selection changes
    dispatch({ type: 'START_PERSISTING' });

    // Skip API call if no cartId yet
    if (!cartId) {
      logger.info('[SHP-01] Skipping shipping persist - no cartId yet');
      return;
    }

    // SHP-01 Review Fix (Issue 6): Skip if already persisted successfully
    if (lastPersistedShipping.current === option.id) {
      logger.info('[SHP-01] Option already persisted, skipping', { optionId: option.id });
      dispatch({ type: 'PERSIST_SUCCESS' });
      return;
    }

    // SHP-01 Review Fix (Issue 6): Skip if we're already persisting this option
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
        const errorMsg = error.code === 'CART_EXPIRED'
          ? 'Your cart has expired. Please refresh the page to continue.'
          : 'Shipping selection failed to save. Please try again or refresh the page.';
        
        dispatch({ type: 'PERSIST_FAILURE', payload: errorMsg });
      } else {
        // Clear error on success and track successful persistence
        lastPersistedShipping.current = option.id;
        dispatch({ type: 'PERSIST_SUCCESS' });

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

      dispatch({ 
        type: 'PERSIST_FAILURE', 
        payload: 'Network error saving shipping selection. Please try again.' 
      });
    } finally {
      // SHP-01 Review Fix (Issue 6): Remove from in-flight set
      inFlightShippingRequests.current.delete(option.id);
    }
  }, [cartId, traceId]);

  return {
    isShippingPersisted: state.isPersisted,
    setIsShippingPersisted: (isPersisted: boolean) => 
      dispatch({ type: isPersisted ? 'PERSIST_SUCCESS' : 'RESET_PERSISTENCE' }),
    shippingPersistError: state.error,
    setShippingPersistError: (error: string | null) => 
      dispatch(error ? { type: 'PERSIST_FAILURE', payload: error } : { type: 'RESET_PERSISTENCE' }), 
    persistShippingOption
  };
}
