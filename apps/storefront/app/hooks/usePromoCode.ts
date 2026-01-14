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

        // Extract applied promotions from cart response
        const discountTotal = cart.discount_total || 0;
        
        // Calculate per-code discount (simplified - Medusa may provide breakdown)
        const previousTotal = appliedCodes.reduce((sum, c) => sum + c.discount, 0);
        const newDiscount = Math.max(0, discountTotal - previousTotal);
        
        // Update applied codes state
        setAppliedCodes((prev) => [
          ...prev,
          {
            code: normalizedCode,
            discount: newDiscount,
            description: `Promo code ${normalizedCode}`,
          },
        ]);

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
