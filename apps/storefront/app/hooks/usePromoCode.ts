import { useState, useCallback } from "react";
import { getMedusaClient } from "../lib/medusa";
import type { AppliedPromoCode } from "../types/promotion";

interface UsePromoCodeOptions {
  cartId: string | undefined;
  onCartUpdate?: () => void;
}

interface UsePromoCodeReturn {
  appliedCodes: AppliedPromoCode[];
  isLoading: boolean;
  error: string | null;
  successMessage: string | null;
  applyPromoCode: (code: string) => Promise<boolean>;
  removePromoCode: (code: string) => Promise<boolean>;
  clearMessages: () => void;
}

/**
 * Rebuild applied promo codes from cart adjustments
 * This ensures accurate discount display when stacking rules apply
 */
function extractAppliedCodesFromCart(cart: any): AppliedPromoCode[] {
  const codeDiscounts = new Map<string, number>();

  // Sum line item adjustments by code
  if (cart.items) {
    cart.items.forEach((item: any) => {
      if (item.adjustments) {
        item.adjustments.forEach((adj: any) => {
          if (adj.code) {
            const current = codeDiscounts.get(adj.code) || 0;
            codeDiscounts.set(adj.code, current + (adj.amount || 0));
          }
        });
      }
    });
  }

  // Sum shipping method adjustments by code
  if (cart.shipping_methods) {
    cart.shipping_methods.forEach((method: any) => {
      if (method.adjustments) {
        method.adjustments.forEach((adj: any) => {
          if (adj.code) {
            const current = codeDiscounts.get(adj.code) || 0;
            codeDiscounts.set(adj.code, current + (adj.amount || 0));
          }
        });
      }
    });
  }

  // Convert to array
  return Array.from(codeDiscounts.entries()).map(([code, discount]) => ({
    code,
    discount,
    description: `Promo code ${code}`,
  }));
}

/**
 * Hook for managing promo codes on a Medusa cart
 * Handles multiple codes and stacking rules enforcement
 * @see https://docs.medusajs.com/resources/storefront-development/cart/manage-promotions
 */
export function usePromoCode({
  cartId,
  onCartUpdate,
}: UsePromoCodeOptions): UsePromoCodeReturn {
  const [appliedCodes, setAppliedCodes] = useState<AppliedPromoCode[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const clearMessages = useCallback(() => {
    setError(null);
    setSuccessMessage(null);
  }, []);

  const applyPromoCode = useCallback(
    async (code: string): Promise<boolean> => {
      if (!cartId) {
        setError("Cart not available");
        return false;
      }

      const normalizedCode = code.trim().toUpperCase();
      if (!normalizedCode) {
        setError("Please enter a promo code");
        return false;
      }

      // Check if already applied
      if (appliedCodes.some((c) => c.code === normalizedCode)) {
        setError("This promo code is already applied");
        return false;
      }

      setIsLoading(true);
      setError(null);
      setSuccessMessage(null);

      try {
        const client = getMedusaClient();
        
        // Send all codes including new one (Medusa handles stacking validation)
        const allCodes = [...appliedCodes.map((c) => c.code), normalizedCode];
        
        const { cart } = await client.store.cart.update(cartId, {
          promo_codes: allCodes,
        });

        // Rebuild applied codes from cart response for accuracy
        const rebuiltCodes = extractAppliedCodesFromCart(cart);
        
        // If adjustments not available, fall back to simple approach
        if (rebuiltCodes.length > 0) {
          setAppliedCodes(rebuiltCodes);
        } else {
          // Fallback: use discount_total with simple distribution
          const discountTotal = cart.discount_total || 0;
          const numCodes = allCodes.length;
          setAppliedCodes(
            allCodes.map((c) => ({
              code: c,
              discount: discountTotal / numCodes,
              description: `Promo code ${c}`,
            }))
          );
        }

        setSuccessMessage("Promo code applied!");
        onCartUpdate?.();
        return true;
      } catch (err: unknown) {
        const errorMessage = extractErrorMessage(err);
        setError(errorMessage);
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [cartId, appliedCodes, onCartUpdate]
  );

  const removePromoCode = useCallback(
    async (code: string): Promise<boolean> => {
      if (!cartId) {
        setError("Cart not available");
        return false;
      }

      setIsLoading(true);
      setError(null);
      setSuccessMessage(null);

      try {
        const client = getMedusaClient();
        
        // Send remaining codes (excluding the one being removed)
        const remainingCodes = appliedCodes
          .filter((c) => c.code !== code)
          .map((c) => c.code);
        
        await client.store.cart.update(cartId, {
          promo_codes: remainingCodes,
        });

        // Update local state
        setAppliedCodes((prev) => prev.filter((c) => c.code !== code));
        setSuccessMessage("Promo code removed");
        onCartUpdate?.();
        return true;
      } catch (err: unknown) {
        const errorMessage = extractErrorMessage(err);
        setError(errorMessage);
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [cartId, appliedCodes, onCartUpdate]
  );

  return {
    appliedCodes,
    isLoading,
    error,
    successMessage,
    applyPromoCode,
    removePromoCode,
    clearMessages,
  };
}

/**
 * Extract user-friendly error message from Medusa API errors
 * Handles stacking rules and campaign date validation errors
 */
function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    const message = err.message.toLowerCase();
    
    // Stacking rules errors
    if (message.includes("cannot be combined") || message.includes("not stackable")) {
      return "This code cannot be combined with other promotions";
    }
    
    // Campaign date validation errors
    if (message.includes("not started") || message.includes("starts_at")) {
      return "This promotion has not started yet";
    }
    if (message.includes("ended") || message.includes("ends_at") || message.includes("expired")) {
      return "This promo code has expired";
    }
    
    // Common errors
    if (message.includes("not found") || message.includes("invalid")) {
      return "Invalid or expired promo code";
    }
    if (message.includes("already applied")) {
      return "This promo code is already applied";
    }
    if (message.includes("not eligible") || message.includes("conditions not met")) {
      return "Your cart is not eligible for this promotion";
    }
    if (message.includes("usage limit") || message.includes("budget exceeded")) {
      return "This promo code has reached its usage limit";
    }
    
    return err.message;
  }
  return "Failed to apply promo code. Please try again.";
}
