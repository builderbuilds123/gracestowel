import { useState, useCallback, useRef } from "react";
import { getMedusaClient } from "../lib/medusa";
import { createLogger } from "../lib/logger";
import type { AppliedPromoCode, CartWithPromotions, LineItemAdjustment, ShippingMethodAdjustment } from "../types/promotion";

const isDevelopment = process.env.NODE_ENV === 'development';

interface UsePromoCodeOptions {
  cartId: string | undefined;
  onCartUpdate?: () => void;
}

interface UsePromoCodeReturn {
  appliedCodes: AppliedPromoCode[];
  totalDiscount: number;
  isLoading: boolean;
  error: string | null;
  successMessage: string | null;
  applyPromoCode: (code: string) => Promise<boolean>;
  removePromoCode: (code: string) => Promise<boolean>;
  refreshDiscount: (requestId?: number) => Promise<void>;
  syncFromCart: (cart: CartWithPromotions) => void;
  clearMessages: () => void;
}

/**
 * Rebuild applied promo codes from cart adjustments
 * This ensures accurate discount display when stacking rules apply
 */
function extractAppliedCodesFromCart(
  cart: CartWithPromotions,
  debugLogger?: { info: (msg: string, data?: Record<string, unknown>) => void }
): AppliedPromoCode[] {
  const codeDiscounts = new Map<string, number>();
  const automaticCodes = new Set<string>();
  
  // Create a map of promotion_id to code for reverse lookup
  const promoIdToCode = new Map<string, string>();
  if (cart.promotions) {
    debugLogger?.info('[PromoCode] Cart promotions found', {
      count: cart.promotions.length,
      promotions: cart.promotions.map(p => ({ code: p.code, isAutomatic: p.is_automatic, id: p.id })),
    });
    cart.promotions.forEach(p => {
      // Map ID to Code for reverse lookup when adjustments don't include the code
      if (p.id && p.code) {
        const upCode = p.code.toUpperCase();
        promoIdToCode.set(p.id, upCode);
        if (p.is_automatic) {
          automaticCodes.add(upCode);
        } else {
          // Ensure manual codes are shown even if they don't have adjustments yet
          if (!codeDiscounts.has(upCode)) {
            codeDiscounts.set(upCode, 0);
          }
        }
      }
    });
  }

  // DEEP TRACE: Log adjustments per item
  if (cart.items) {
    cart.items.forEach((item, idx) => {
      if (item.adjustments && item.adjustments.length > 0) {
        debugLogger?.info(`[PromoCode] Item ${idx} adjustments`, {
          itemId: item.id,
          title: (item as any).title,
          adjustments: item.adjustments.map(a => ({
            code: a.code,
            promotion_id: a.promotion_id,
            amount: a.amount
          }))
        });
      }
    });
  }

  // Helper to process adjustments
  const processAdjustments = (adjustments: (LineItemAdjustment | ShippingMethodAdjustment)[]) => {
    adjustments.forEach((adj) => {
      // Try to get code directly, or via promotion_id mapping
      let code = adj.code?.toUpperCase();
      if (!code && adj.promotion_id) {
        code = promoIdToCode.get(adj.promotion_id);
      }

      if (code) {
        const current = codeDiscounts.get(code) || 0;
        // Medusa is returning amounts in major units (dollars)
        codeDiscounts.set(code, current + (adj.amount || 0));
      }
    });
  };

  if (cart.items) {
    cart.items.forEach((item, idx) => {
      if (item.adjustments && item.adjustments.length > 0) {
        debugLogger?.info(`[PromoCode] Processing adjustments for item ${idx}`, { 
          itemId: item.id, 
          adjCount: item.adjustments.length 
        });
        processAdjustments(item.adjustments);
      }
    });
  }

  if (cart.shipping_methods) {
    cart.shipping_methods.forEach((method, idx) => {
      if (method.adjustments && method.adjustments.length > 0) {
        debugLogger?.info(`[PromoCode] Processing adjustments for shipping ${idx}`, { 
          methodId: method.id, 
          adjCount: method.adjustments.length 
        });
        processAdjustments(method.adjustments);
      }
    });
  }

  debugLogger?.info('[PromoCode] Adjustments processed', {
    codesFound: Array.from(codeDiscounts.keys()),
    automaticCodes: Array.from(automaticCodes),
  });

  const finalCodes = Array.from(codeDiscounts.entries()).map(([code, discount]) => ({
    code,
    discount,
    description: `Promo code ${code}`,
    isAutomatic: automaticCodes.has(code),
  }));

  debugLogger?.info('[PromoCode] Final extracted codes', {
    codes: finalCodes.map(c => ({ code: c.code, discount: c.discount, isAuto: c.isAutomatic })),
    totalSummed: Array.from(codeDiscounts.values()).reduce((a, b) => a + b, 0)
  });

  return finalCodes;
}

function applyCartDiscountState(
  cart: CartWithPromotions,
  setTotalDiscount: (value: number) => void,
  setAppliedCodes: (codes: AppliedPromoCode[]) => void,
  debugLogger?: { info: (msg: string, data?: Record<string, unknown>) => void }
) {
  // Medusa is returning discount_total in major units (dollars)
  const discountTotal = cart.discount_total || 0;
  setTotalDiscount(discountTotal);

  const rebuiltCodes = extractAppliedCodesFromCart(cart, debugLogger);
  
  debugLogger?.info('[PromoCode] Applied discount state', {
    discountTotal,
    codesCount: rebuiltCodes.length,
    codes: rebuiltCodes.map(c => ({ code: c.code, discount: c.discount, isAutomatic: c.isAutomatic })),
  });
  
  setAppliedCodes(rebuiltCodes);
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
  const [totalDiscount, setTotalDiscount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const refreshRequestIdRef = useRef(0);
  
  const logger = useRef(createLogger({ context: 'usePromoCode' })).current;

  const clearMessages = useCallback(() => {
    setError(null);
    setSuccessMessage(null);
  }, []);

  /**
   * Refresh discount total from cart without applying/removing codes
   * Used when cart items are updated (quantity changes) to recalculate percentage discounts
   */
  const refreshDiscount = useCallback(async (requestId?: number) => {
    if (!cartId) return;

    const currentRequestId = requestId ?? ++refreshRequestIdRef.current;
    if (requestId !== undefined) {
      refreshRequestIdRef.current = requestId;
    }

    setIsLoading(true);
    try {
      const client = getMedusaClient();
      logger.info('[PromoCode] Refreshing discount from cart', { cartId });
      
      const { cart } = await client.store.cart.retrieve(cartId, {
        fields: '+promotions,+promotions.application_method,+items.adjustments,+shipping_methods.adjustments',
      });

      // DEEP DEBUG: Log full cart structure for promo investigation
      logger.info('[PromoCode] RAW Cart Data Received', {
        cartId: cart.id,
        discountTotal: cart.discount_total,
        promotions: (cart as any).promotions,
        itemsCount: cart.items?.length,
        hasAdjustments: cart.items?.some(i => i.adjustments && i.adjustments.length > 0)
      });
      
      if (isDevelopment) {
        // Use structured logger for the full cart object in development
        logger.info('[PromoCode] Full Cart Object', { cart });
      }

      logger.info('[PromoCode] Cart retrieved for discount refresh', {
        cartId,
        discountTotal: cart.discount_total,
        hasPromotions: !!(cart as any).promotions,
        promotionsCount: (cart as any).promotions?.length || 0,
        itemsCount: cart.items?.length || 0,
      });

      if (currentRequestId !== refreshRequestIdRef.current) {
        logger.info('[PromoCode] Stale request, skipping', { currentRequestId, latestRequestId: refreshRequestIdRef.current });
        return;
      }

      applyCartDiscountState(cart as any, setTotalDiscount, setAppliedCodes, logger);
    } catch (err) {
      logger.warn('Failed to refresh discount', { error: err });
      setError("Failed to refresh discounts. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [cartId, logger]);

  const syncFromCart = useCallback((cart: CartWithPromotions) => {
    logger.info('[PromoCode] Syncing from provided cart object', {
      cartId: cart.id,
      discountTotal: cart.discount_total,
      promotionsCount: cart.promotions?.length || 0
    });
    applyCartDiscountState(cart, setTotalDiscount, setAppliedCodes, logger);
  }, [logger]);

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
        logger.info('[PromoCode] Applying promo code', { code: normalizedCode });
        
        // Manual codes must be sent in the promo_codes array to Medusa update
        const manualCodes = appliedCodes
          .filter(c => !c.isAutomatic)
          .map(c => c.code);
        
        const allManualCodes = [...manualCodes, normalizedCode];

        const { cart } = await client.store.cart.update(cartId, {
          promo_codes: allManualCodes,
        });

        logger.info('[PromoCode] Promo code application response received', { 
            cartId: cart.id,
            discountTotal: cart.discount_total 
        });

        // Verify if it was actually applied
        const rebuiltCodes = extractAppliedCodesFromCart(cart as any, logger);
        const wasApplied = rebuiltCodes.some(c => c.code.toUpperCase() === normalizedCode);
        
        if (!wasApplied) {
          logger.warn('[PromoCode] Code accepted by API but not found in adjustments - possibly requirements not met', {
            code: normalizedCode,
            availableCodes: rebuiltCodes.map(c => c.code)
          });
          setError(`Promo code "${normalizedCode}" could not be applied. Check requirements (e.g. minimum spend).`);
          return false;
        }

        applyCartDiscountState(cart as any, setTotalDiscount, setAppliedCodes, logger);
        setSuccessMessage(`Promo code "${normalizedCode}" applied!`);
        onCartUpdate?.();
        return true;
      } catch (err: unknown) {
        logger.error("Failed to apply promo code", err as Error);
        const errorMessage = extractErrorMessage(err);
        setError(errorMessage);
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [cartId, appliedCodes, onCartUpdate, logger]
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
        logger.info('[PromoCode] Removing promo code', { code });
        
        // Filter out the code being removed and any automatic codes 
        // (automatic codes shouldn't be in the manual promo_codes array)
        const remainingManualCodes = appliedCodes
          .filter(c => c.code !== code && !c.isAutomatic)
          .map(c => c.code);
        
        const { cart } = await client.store.cart.update(cartId, {
          promo_codes: remainingManualCodes,
        });

        logger.info('[PromoCode] Promo code removal response received', { 
            cartId: cart.id,
            discountTotal: cart.discount_total 
        });

        applyCartDiscountState(cart as any, setTotalDiscount, setAppliedCodes, logger);
        setSuccessMessage("Promo code removed");
        onCartUpdate?.();
        return true;
      } catch (err: unknown) {
        logger.error("Failed to remove promo code", err as Error);
        const errorMessage = extractErrorMessage(err);
        setError(errorMessage);
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [cartId, appliedCodes, onCartUpdate, logger]
  );

  return {
    appliedCodes,
    totalDiscount,
    isLoading,
    error,
    successMessage,
    applyPromoCode,
    removePromoCode,
    refreshDiscount,
    syncFromCart,
    clearMessages,
  };
}

/**
 * Extract user-friendly error message from Medusa API errors
 * Handles stacking rules, campaign date validation, eligibility, and other errors
 * @see https://docs.medusajs.com/api/store#carts_postcartsidpromotions
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
    
    // Invalid or not found errors
    if (message.includes("not found") || message.includes("invalid") || message.includes("does not exist")) {
      return "Invalid or expired promo code";
    }
    
    // Already applied
    if (message.includes("already applied") || message.includes("already exists")) {
      return "This promo code is already applied";
    }
    
    // Eligibility errors
    if (message.includes("not eligible") || message.includes("conditions not met") || message.includes("does not meet")) {
      return "Your cart is not eligible for this promotion";
    }
    
    // Usage limit errors
    if (message.includes("usage limit") || message.includes("budget exceeded") || message.includes("max uses")) {
      return "This promo code has reached its usage limit";
    }
    
    // Minimum order requirements
    if (message.includes("minimum") || message.includes("min_subtotal") || message.includes("cart total")) {
      return "Your cart does not meet the minimum order requirement for this promotion";
    }
    
    // Customer-specific restrictions
    if (message.includes("customer") || message.includes("user") || message.includes("group")) {
      return "This promo code is not available for your account";
    }
    
    // Region/shipping restrictions
    if (message.includes("region") || message.includes("country") || message.includes("shipping")) {
      return "This promo code is not valid for your shipping region";
    }
    
    // Product-specific restrictions
    if (message.includes("product") || message.includes("item") || message.includes("collection")) {
      return "This promo code does not apply to the items in your cart";
    }
    
    // General API errors
    if (message.includes("invalid_data") || message.includes("validation")) {
      return "Invalid promo code format";
    }
    
    // Return original message if no pattern matched (may still be useful)
    return err.message;
  }
  return "Failed to apply promo code. Please try again.";
}
