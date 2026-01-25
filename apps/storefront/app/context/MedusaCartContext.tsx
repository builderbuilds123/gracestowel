import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { monitoredFetch } from "../utils/monitored-fetch";
import type { CartWithPromotions } from "../types/promotion";
import { useLocale } from "./LocaleContext";
import { 
  getCachedStorage, 
  setCachedStorage, 
  removeCachedStorage,
  getCachedSessionStorage,
  setCachedSessionStorage,
  removeCachedSessionStorage
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

export function MedusaCartProvider({ children }: { children: React.ReactNode }) {
  // Issue #32: Use cached storage for sessionStorage and localStorage
  const [cartId, setCartIdState] = useState<string | undefined>(() => {
    if (typeof window === "undefined") return undefined;
    return (
      getCachedSessionStorage("medusa_cart_id") ||
      getCachedStorage("medusa_cart_id") ||
      undefined
    );
  });
  const [cart, setCart] = useState<CartWithPromotions | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const regionSyncInFlight = React.useRef<string | null>(null);
  const { regionId } = useLocale();

  // Issue #32: Use cached storage for sessionStorage and localStorage
  // Also set a cookie for server-side access during checkout success flow
  const persistCartId = useCallback((nextId?: string) => {
    if (typeof window === "undefined") return;
    if (nextId) {
      setCachedSessionStorage("medusa_cart_id", nextId);
      setCachedStorage("medusa_cart_id", nextId);
      // Set cookie for server-side access (SameSite=Lax for cross-site redirects from Stripe)
      document.cookie = `medusa_cart_id=${nextId}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`;
    } else {
      removeCachedSessionStorage("medusa_cart_id");
      removeCachedStorage("medusa_cart_id");
      // Clear the cookie
      document.cookie = "medusa_cart_id=; path=/; max-age=0; SameSite=Lax";
    }
  }, []);

  const setCartId = useCallback(
    (nextId?: string) => {
      setCartIdState(nextId);
      persistCartId(nextId);
    },
    [persistCartId]
  );

  const refreshCart = useCallback(async () => {
    if (!cartId) {
      setCart(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await monitoredFetch(`/api/carts/${cartId}`, {
        method: "GET",
        label: "medusa-cart-retrieve",
      });

      // 404 = cart not found, 410 = cart already completed
      if (response.status === 404 || response.status === 410) {
        setCart(null);
        setCartId(undefined);
        return;
      }

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || "Failed to retrieve cart");
      }

      const payload = (await response.json()) as CartWithPromotions;
      setCart(payload);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to retrieve cart";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [cartId, setCartId]);

  // Sync cart ID between cookie and localStorage on initial load
  // This handles two cases:
  // 1. localStorage has cart ID but cookie doesn't -> sync to cookie (for server-side access)
  // 2. Cookie was cleared (e.g., after checkout success) but localStorage still has it -> clear localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Check if cookie exists
    const cartCookie = document.cookie.split(";").find(c => c.trim().startsWith("medusa_cart_id="));
    const cookieValue = cartCookie?.split("=")[1]?.trim();
    const hasCookieWithValue = !!cookieValue && cookieValue.length > 0;

    if (cartId && !hasCookieWithValue) {
      // Check if we're on an order status page (cart was cleared by server after checkout)
      const isOrderStatusPage = window.location.pathname.startsWith("/order/status/");

      if (isOrderStatusPage) {
        // Server cleared the cart cookie after checkout - clear client-side storage too
        setCartId(undefined);
      } else {
        // Normal case: localStorage has cart ID but cookie doesn't - sync to cookie
        document.cookie = `medusa_cart_id=${cartId}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`;
      }
    }
  }, [cartId, setCartId]);

  useEffect(() => {
    void refreshCart();
  }, [refreshCart]);

  // Sync region if it changes and cart exists
  useEffect(() => {
    if (!cart || !cartId || !regionId || cart.region_id === regionId) return;
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
  }, [cart, cartId, regionId, refreshCart]);

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
