import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, useRef } from "react";
import { monitoredFetch } from "../utils/monitored-fetch";
import type { CartWithPromotions } from "../types/promotion";
import { useLocale } from "./LocaleContext";
import {
  getCachedStorage,
  setCachedStorage,
  removeCachedStorage,
  getCachedSessionStorage,
  setCachedSessionStorage,
  removeCachedSessionStorage,
  clearStorageCache
} from "../lib/storage-cache";

interface MedusaCartContextValue {
  cartId?: string;
  cart: CartWithPromotions | null;
  isLoading: boolean;
  error: string | null;
  setCart: (cart: CartWithPromotions | null) => void;
  setCartId: (cartId?: string) => void;
  refreshCart: () => Promise<void>;
}

const MedusaCartContext = createContext<MedusaCartContextValue | undefined>(undefined);

/**
 * MedusaCartProvider - Single source of truth for cart state
 *
 * ARCHITECTURE:
 * - The API is the single source of truth for cart validity
 * - localStorage/sessionStorage are used for persistence across page loads
 * - Cookie is set for server-side access (checkout success flow)
 * - If API returns 404/410, cart is cleared from ALL storage
 *
 * HYDRATION:
 * - Initialize state as undefined to match SSR (no hydration mismatch)
 * - Load from storage after mount
 * - Validate with API - this is the authoritative check
 */
export function MedusaCartProvider({ children }: { children: React.ReactNode }) {
  // Initialize undefined to match SSR - avoids hydration mismatch
  const [cartId, setCartIdState] = useState<string | undefined>(undefined);
  const [cart, setCart] = useState<CartWithPromotions | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Track last fetched cart ID to prevent duplicate fetches
  const lastFetchedCartId = useRef<string | undefined>(undefined);
  const regionSyncInFlight = useRef<string | null>(null);
  const { regionId } = useLocale();

  // Clear cart from all storage locations
  const clearCart = useCallback(() => {
    if (typeof window === "undefined") return;

    clearStorageCache("medusa_cart_id");
    removeCachedSessionStorage("medusa_cart_id");
    removeCachedStorage("medusa_cart_id");
    document.cookie = "medusa_cart_id=; path=/; max-age=0; SameSite=Lax";
    setCartIdState(undefined);
    setCart(null);
    lastFetchedCartId.current = undefined;
  }, []);

  // Persist cart ID to all storage locations
  const persistCartId = useCallback((nextId: string) => {
    if (typeof window === "undefined") return;

    clearStorageCache("medusa_cart_id");
    setCachedSessionStorage("medusa_cart_id", nextId);
    setCachedStorage("medusa_cart_id", nextId);
    document.cookie = `medusa_cart_id=${nextId}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`;
  }, []);

  // Public setter - persists and updates state
  const setCartId = useCallback(
    (nextId?: string) => {
      if (nextId) {
        setCartIdState(nextId);
        persistCartId(nextId);
      } else {
        clearCart();
      }
    },
    [persistCartId, clearCart]
  );

  // Fetch and validate cart with API
  const fetchCart = useCallback(async (id: string): Promise<boolean> => {
    // Skip if we just fetched this cart
    if (lastFetchedCartId.current === id) {
      return true;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await monitoredFetch(`/api/carts/${id}`, {
        method: "GET",
        label: "medusa-cart-retrieve",
      });

      // API is the source of truth: 404/410 means cart is invalid
      if (response.status === 404 || response.status === 410) {
        clearCart();
        return false;
      }

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || "Failed to retrieve cart");
      }

      const payload = (await response.json()) as CartWithPromotions;
      setCart(payload);
      lastFetchedCartId.current = id;
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to retrieve cart";
      setError(message);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [clearCart]);

  // Refresh cart - forces re-fetch by clearing lastFetchedCartId
  const refreshCart = useCallback(async () => {
    if (!cartId) {
      setCart(null);
      return;
    }
    // Clear to force re-fetch
    lastFetchedCartId.current = undefined;
    await fetchCart(cartId);
  }, [cartId, fetchCart]);

  // Initialize: Load from storage and validate with API (runs once on mount)
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Check if server cleared the cart cookie (checkout success)
    // If cookie is missing/empty but storage has a cart ID, the server cleared it
    const cookieMatch = document.cookie.match(/medusa_cart_id=([^;]+)/);
    const cookieCartId = cookieMatch?.[1] || null;

    // Read from storage (sessionStorage has priority)
    const storedCartId = getCachedSessionStorage("medusa_cart_id") ||
      getCachedStorage("medusa_cart_id") ||
      undefined;

    // If cookie is cleared but storage exists, server cleared the cart - clear everything
    if (!cookieCartId && storedCartId) {
      clearStorageCache("medusa_cart_id");
      removeCachedSessionStorage("medusa_cart_id");
      removeCachedStorage("medusa_cart_id");
      setCartIdState(undefined);
      setCart(null);
      return;
    }

    if (storedCartId) {
      setCartIdState(storedCartId);
      // Validate with API - this will clear if cart is completed/invalid
      // NOTE: Do NOT restore cookie here - let fetchCart handle persistence after validation
      void fetchCart(storedCartId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally runs once on mount
  }, []);

  // Fetch when cartId changes externally (e.g., new cart created via setCartId)
  useEffect(() => {
    if (!cartId) return;
    // fetchCart has built-in deduplication via lastFetchedCartId
    void fetchCart(cartId);
  }, [cartId, fetchCart]);

  // Sync region if it changes and cart exists
  // Use primitive dependency (cart?.region_id) to avoid re-runs on cart object changes
  const cartRegionId = cart?.region_id;
  useEffect(() => {
    if (!cartRegionId || !cartId || !regionId || cartRegionId === regionId) return;
    if (regionSyncInFlight.current === regionId) return;

    void (async () => {
      try {
        regionSyncInFlight.current = regionId;
        const response = await monitoredFetch(`/api/carts/${cartId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ region_id: regionId }),
          label: "medusa-cart-sync-region",
        });
        if (response.ok) {
          void refreshCart();
        }
      } catch (err) {
        console.error("Failed to sync cart region:", err);
      } finally {
        regionSyncInFlight.current = null;
      }
    })();
  }, [cartRegionId, cartId, regionId, refreshCart]);

  const value = useMemo(
    () => ({
      cartId,
      cart,
      isLoading,
      error,
      setCart,
      setCartId,
      refreshCart,
    }),
    [cartId, cart, isLoading, error, setCartId, refreshCart]
  );

  return <MedusaCartContext.Provider value={value}>{children}</MedusaCartContext.Provider>;
}

export function useMedusaCart() {
  const context = useContext(MedusaCartContext);
  if (!context) {
    throw new Error("useMedusaCart must be used within a MedusaCartProvider");
  }
  return context;
}
