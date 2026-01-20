import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { monitoredFetch } from "../utils/monitored-fetch";
import type { CartWithPromotions } from "../types/promotion";
import { useLocale } from "./LocaleContext";

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
  const [cartId, setCartIdState] = useState<string | undefined>(() => {
    if (typeof window === "undefined") return undefined;
    return (
      sessionStorage.getItem("medusa_cart_id") ||
      localStorage.getItem("medusa_cart_id") ||
      undefined
    );
  });
  const [cart, setCart] = useState<CartWithPromotions | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const regionSyncInFlight = React.useRef<string | null>(null);
  const { regionId } = useLocale();

  const persistCartId = useCallback((nextId?: string) => {
    if (typeof window === "undefined") return;
    if (nextId) {
      sessionStorage.setItem("medusa_cart_id", nextId);
      localStorage.setItem("medusa_cart_id", nextId);
    } else {
      sessionStorage.removeItem("medusa_cart_id");
      localStorage.removeItem("medusa_cart_id");
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

      if (response.status === 404) {
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
