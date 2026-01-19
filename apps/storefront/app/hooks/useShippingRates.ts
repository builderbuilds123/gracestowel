import { useCallback, useRef, useState } from "react";
import { monitoredFetch } from "../utils/monitored-fetch";
import { retry } from "../utils/retry";
import { generateCartHash } from "../utils/cart-hash";
import { CHECKOUT_CONSTANTS } from "../constants/checkout";
import { createLogger } from "../lib/logger";
import type { ShippingOption } from "../components/CheckoutForm";
import type { CartItem } from "../types/product";

// Check if in development mode
const isDevelopment = import.meta.env.MODE === 'development';

interface ShippingRatesOptions {
  currency: string;
  regionId: string;
  cartId: string | undefined;
  setCartId: (id: string | undefined) => void;
  onCartCreated?: (cartId: string) => void;
  onCartSynced?: () => void;
  onCartSyncError?: (error: string | null) => void;
}

interface UseShippingRatesResult {
  shippingOptions: ShippingOption[];
  selectedShipping: ShippingOption | null;
  setSelectedShipping: (option: ShippingOption | null) => void;
  isCalculatingShipping: boolean;
  isCartSynced: boolean;
  fetchShippingRates: (
    items: CartItem[],
    address: any,
    currentTotal: number,
    guestEmail?: string,
    appliedPromoCodes?: Array<{ code: string; isAutomatic: boolean }>
  ) => Promise<void>;
  clearCache: () => void;
}

/**
 * Hook to manage shipping rates fetching, caching, and cart synchronization.
 * 
 * Extracted from checkout.tsx for better maintainability.
 * Handles:
 * - Cart creation/update with Medusa
 * - Shipping options fetching with retry logic
 * - Request deduplication via AbortController
 * - Result caching to minimize API calls
 * 
 * @param options - Configuration options including currency, regionId, and callbacks
 * @returns Shipping state and control functions
 */
export function useShippingRates({
  currency,
  regionId,
  cartId,
  setCartId,
  onCartCreated,
  onCartSynced,
  onCartSyncError,
}: ShippingRatesOptions): UseShippingRatesResult {
  const [shippingOptions, setShippingOptions] = useState<ShippingOption[]>([]);
  const [selectedShipping, setSelectedShipping] = useState<ShippingOption | null>(null);
  const [isCalculatingShipping, setIsCalculatingShipping] = useState(false);
  const [isCartSynced, setIsCartSynced] = useState(false);
  
  // Caching mechanism for shipping rates
  const shippingCache = useRef<Map<string, { options: ShippingOption[], cartId: string | undefined }>>(new Map());

  // AbortController for cancelling stale shipping requests
  const abortControllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  // Logger with stable reference
  const loggerRef = useRef(createLogger({ context: 'useShippingRates' }));
  const logger = loggerRef.current;

  /**
   * Fetch shipping rates from Medusa, creating/updating cart as needed.
   * Includes retry logic for transient failures and request deduplication.
   */
  const fetchShippingRates = useCallback(async (
    items: CartItem[],
    address: any,
    currentTotal: number,
    guestEmail?: string,
    appliedPromoCodes?: Array<{ code: string; isAutomatic: boolean }>
  ) => {
    // 1. Cancel previous pending request if exists
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // 2. Create new controller for this request
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const currentRequestId = ++requestIdRef.current;

    setIsCalculatingShipping(true);

    const cacheKey = generateCartHash(items, address ? {
      country_code: address.address?.country,
      province: address.address?.state,
      postal_code: address.address?.postal_code
    } : undefined, currency, currentTotal);
    
    if (shippingCache.current.has(cacheKey)) {
      const cached = shippingCache.current.get(cacheKey)!;
      setShippingOptions(cached.options);
      if (cached.cartId) {
        setCartId(cached.cartId);
        onCartCreated?.(cached.cartId);
      }
      setIsCalculatingShipping(false);
      return;
    }

    try {
      // Step 1: Create or get cart
      let currentCartId = cartId;
      if (!currentCartId) {
        if (isDevelopment) {
          logger.info('Step 1: Creating cart...');
        }
        
        // Use retry for resilience against transient network failures
        const createResponse = await retry(
          async () => {
            const response = await monitoredFetch("/api/carts", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                region_id: regionId,
                currency,
                country_code: address?.address?.country,
              }),
              label: 'create-cart',
              signal: controller.signal,
            });
            
            // Only retry on network errors, not business logic errors
            if (!response.ok && response.status >= 500) {
              throw new Error(`Server error: ${response.status}`);
            }
            return response;
          },
          CHECKOUT_CONSTANTS.FETCH_MAX_RETRIES,
          CHECKOUT_CONSTANTS.FETCH_RETRY_DELAY_MS
        );

        if (!createResponse.ok) {
          const error = await createResponse.json() as { error: string; details?: string };
          logger.error('Step 1 FAILED - Cart creation', undefined, error as Record<string, unknown>);
          throw new Error(`Cart creation failed: ${error.error}`);
        }

        const { cart_id } = await createResponse.json() as { cart_id: string };
        currentCartId = cart_id;
        setCartId(cart_id);
        setIsCartSynced(false);
        onCartCreated?.(cart_id);
        
        if (isDevelopment) {
          logger.info('Step 1 SUCCESS - Cart created', { cart_id });
        }
      }

      // Step 2: Update cart with items and address
      if (items.length > 0 || address || guestEmail) {
        if (isDevelopment) {
          logger.info('Step 2: Updating cart items/address...');
        }

        const updatePayload: Record<string, unknown> = {
          items,
          promo_codes: appliedPromoCodes
            ?.filter(code => !code.isAutomatic)
            .map(code => code.code) || []
        };

        if (address) {
          updatePayload.shipping_address = {
            first_name: address.firstName || '',
            last_name: address.lastName || '',
            address_1: address.address?.line1 || '',
            address_2: address.address?.line2,
            city: address.address?.city || '',
            country_code: address.address?.country || '',
            postal_code: address.address?.postal_code || '',
            province: address.address?.state,
            phone: address.phone,
          };
        }

        if (guestEmail) {
          updatePayload.email = guestEmail;
        }

        if (regionId) {
          updatePayload.region_id = regionId;
        }

        const updateResponse = await monitoredFetch(`/api/carts/${currentCartId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updatePayload),
          label: 'update-cart',
          signal: controller.signal,
        });

        const updateResult = await updateResponse.json() as { 
          error?: string; 
          details?: string; 
          code?: string;
        };

        if (!updateResponse.ok) {
          const error = updateResult as { error: string; details?: string; code?: string };
          logger.error('Step 2 FAILED - Cart update', undefined, error as Record<string, unknown>);
          
          // Handle region mismatch
          if (error.code === 'REGION_MISMATCH') {
            onCartSyncError?.(`This country is not available for your cart region. Please select a different shipping address.`);
            return;
          }

          // Handle Inventory Errors
          if (error.code === 'INVENTORY_ERROR') {
            onCartSyncError?.(`${error.error}: ${error.details}`);
            return;
          }

          // Handle completed cart error
          if (error.code === 'CART_COMPLETED') {
            logger.warn('Cart already completed, clearing session');
            sessionStorage.removeItem('medusa_cart_id');
            setCartId(undefined);
            return;
          }

          throw new Error(error.details || error.error);
        }
        
        onCartSyncError?.(null as any); // Clear previous errors
        setIsCartSynced(true);
        onCartSynced?.();
        
        if (isDevelopment) {
          logger.info('Step 2 SUCCESS - Cart updated');
        }
      } else {
        setIsCartSynced(true);
        onCartSynced?.();
      }

      // Step 3: Get shipping options (cacheable GET request)
      if (isDevelopment) {
        logger.info('Step 3: Fetching shipping options...');
      }
      
      const optionsResponse = await retry(
        async () => {
          const response = await monitoredFetch(`/api/carts/${currentCartId}/shipping-options`, {
            method: "GET",
            label: 'get-shipping-options',
            signal: controller.signal,
          });
          
          if (!response.ok && response.status >= 500) {
            throw new Error(`Server error: ${response.status}`);
          }
          return response;
        },
        CHECKOUT_CONSTANTS.FETCH_MAX_RETRIES,
        CHECKOUT_CONSTANTS.FETCH_RETRY_DELAY_MS
      );

      if (!optionsResponse.ok) {
        const error = await optionsResponse.json() as { error: string; details?: string };
        logger.error('Step 3 FAILED - Fetching shipping options', undefined, error as Record<string, unknown>);
        throw new Error(`Shipping options fetch failed: ${error.error}`);
      }

      const { shipping_options } = await optionsResponse.json() as { 
        shipping_options: ShippingOption[];
        cart_id: string;
      };
      
      if (isDevelopment) {
        logger.info('Step 3 SUCCESS', { count: shipping_options.length });
      }

      setShippingOptions(shipping_options);

      // If user has an existing valid selection, keep it
      if (selectedShipping && shipping_options.length > 0) {
        const found = shipping_options.find(o => o.id === selectedShipping.id);
        if (!found) {
          setSelectedShipping(null);
        } else {
          setSelectedShipping({ ...found });
        }
      }

      // Cache results
      shippingCache.current.set(cacheKey, { options: shipping_options, cartId: currentCartId });

    } catch (error: any) {
      if (error.name === 'AbortError') {
        return;
      }
      logger.error('Shipping rates error', error as Error);
    } finally {
      if (abortControllerRef.current === controller) {
        setIsCalculatingShipping(false);
      }
    }
  }, [currency, cartId, regionId, selectedShipping, onCartCreated, onCartSynced, onCartSyncError, logger]);

  const clearCache = useCallback(() => {
    shippingCache.current.clear();
  }, []);

  return {
    shippingOptions,
    selectedShipping,
    setSelectedShipping,
    isCalculatingShipping,
    isCartSynced,
    fetchShippingRates,
    clearCache,
  };
}
