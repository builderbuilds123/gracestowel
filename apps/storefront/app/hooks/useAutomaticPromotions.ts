import { useState, useEffect, useCallback } from "react";
import { getMedusaClient } from "../lib/medusa";
import type { Promotion } from "../types/promotion";

interface AutomaticPromotionInfo {
  id: string;
  type: "free_shipping" | "discount";
  threshold: number;
  currentAmount: number;
  amountRemaining: number;
  isApplied: boolean;
  message: string;
  progressPercent: number;
}

interface UseAutomaticPromotionsOptions {
  cartSubtotal: number;
  enabled?: boolean;
}

interface UseAutomaticPromotionsReturn {
  promotions: AutomaticPromotionInfo[];
  isLoading: boolean;
  error: string | null;
  freeShippingThreshold: number | null;
  amountToFreeShipping: number | null;
  hasFreeShipping: boolean;
  refresh: () => Promise<void>;
}

/**
 * Hook for fetching and tracking automatic promotions
 * @see https://docs.medusajs.com/resources/commerce-modules/promotion
 */
export function useAutomaticPromotions({
  cartSubtotal,
  enabled = true,
}: UseAutomaticPromotionsOptions): UseAutomaticPromotionsReturn {
  const [promotions, setPromotions] = useState<AutomaticPromotionInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPromotions = useCallback(async () => {
    if (!enabled) return;

    setIsLoading(true);
    setError(null);

    try {
      const client = getMedusaClient();
      
      // Fetch automatic promotions from Medusa
      const { promotions: rawPromotions } = await client.store.promotion.list({
        is_automatic: true,
      });

      // Process promotions to extract threshold info
      const processedPromotions: AutomaticPromotionInfo[] = (rawPromotions || [])
        .filter((p: Promotion) => p.status === "active")
        .map((promo: Promotion) => {
          const threshold = extractThreshold(promo);
          const isShipping = promo.application_method?.target_type === "shipping";
          const isApplied = cartSubtotal >= threshold;
          const amountRemaining = Math.max(0, threshold - cartSubtotal);
          const progressPercent = threshold > 0 
            ? Math.min(100, (cartSubtotal / threshold) * 100) 
            : 100;

          let message: string;
          if (isApplied) {
            message = isShipping 
              ? "🎉 Free shipping applied!" 
              : `🎉 ${promo.application_method?.value}% discount applied!`;
          } else {
            const formatted = new Intl.NumberFormat("en-US", {
              style: "currency",
              currency: "USD",
            }).format(amountRemaining);
            message = isShipping
              ? `Add ${formatted} more for free shipping!`
              : `Add ${formatted} more to unlock your discount!`;
          }

          return {
            id: promo.id,
            type: isShipping ? "free_shipping" : "discount",
            threshold,
            currentAmount: cartSubtotal,
            amountRemaining,
            isApplied,
            message,
            progressPercent,
          };
        });

      setPromotions(processedPromotions);
    } catch (err) {
      console.error("[useAutomaticPromotions] Error fetching promotions:", err);
      setError("Failed to load promotions");
    } finally {
      setIsLoading(false);
    }
  }, [cartSubtotal, enabled]);

  // Fetch on mount and when cart subtotal changes
  useEffect(() => {
    fetchPromotions();
  }, [fetchPromotions]);

  // Derived values for convenience
  const freeShippingPromo = promotions.find((p) => p.type === "free_shipping");
  const freeShippingThreshold = freeShippingPromo?.threshold ?? null;
  const amountToFreeShipping = freeShippingPromo?.amountRemaining ?? null;
  const hasFreeShipping = freeShippingPromo?.isApplied ?? false;

  return {
    promotions,
    isLoading,
    error,
    freeShippingThreshold,
    amountToFreeShipping,
    hasFreeShipping,
    refresh: fetchPromotions,
  };
}

/**
 * Extract threshold amount from promotion rules
 */
function extractThreshold(promo: Promotion): number {
  // Look for cart.total >= X rule
  const cartTotalRule = promo.rules?.find(
    (rule) => rule.attribute === "cart.total" && 
              (rule.operator === "gte" || rule.operator === "gt")
  );

  if (cartTotalRule && cartTotalRule.values.length > 0) {
    const value = parseFloat(cartTotalRule.values[0].value);
    if (!isNaN(value)) {
      // Medusa stores amounts in cents for fixed, dollars for rules
      return value;
    }
  }

  // Fallback: check for subtotal or other attributes
  const subtotalRule = promo.rules?.find(
    (rule) => rule.attribute.includes("subtotal") && 
              (rule.operator === "gte" || rule.operator === "gt")
  );

  if (subtotalRule && subtotalRule.values.length > 0) {
    const value = parseFloat(subtotalRule.values[0].value);
    if (!isNaN(value)) {
      return value;
    }
  }

  // No threshold found - promotion always applies
  return 0;
}
