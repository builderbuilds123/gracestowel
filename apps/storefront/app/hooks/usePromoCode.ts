import { useRef, useCallback, useReducer } from "react";
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

interface PromoCodeState {
  appliedCodes: AppliedPromoCode[];
  totalDiscount: number;
  isLoading: boolean;
  error: string | null;
  successMessage: string | null;
}

type PromoCodeAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_DISCOUNT_STATE'; payload: { codes: AppliedPromoCode[]; total: number } }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_SUCCESS'; payload: string | null }
  | { type: 'CLEAR_MESSAGES' };

const initialPromoState: PromoCodeState = {
  appliedCodes: [],
  totalDiscount: 0,
  isLoading: false,
  error: null,
  successMessage: null,
};

function promoCodeReducer(state: PromoCodeState, action: PromoCodeAction): PromoCodeState {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_DISCOUNT_STATE':
      return { 
        ...state, 
        appliedCodes: action.payload.codes, 
        totalDiscount: action.payload.total,
        isLoading: false 
      };
    case 'SET_ERROR':
      return { ...state, error: action.payload, isLoading: false, successMessage: null };
    case 'SET_SUCCESS':
      return { ...state, successMessage: action.payload, isLoading: false, error: null };
    case 'CLEAR_MESSAGES':
      return { ...state, error: null, successMessage: null };
    default:
      return state;
  }
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

function getDiscountState(
  cart: CartWithPromotions,
  debugLogger?: { info: (msg: string, data?: Record<string, unknown>) => void }
): { codes: AppliedPromoCode[]; total: number } {
  const discountTotal = cart.discount_total || 0;
  const rebuiltCodes = extractAppliedCodesFromCart(cart, debugLogger);
  
  debugLogger?.info('[PromoCode] Discount state calculation', {
    discountTotal,
    codesCount: rebuiltCodes.length,
    codes: rebuiltCodes.map(c => ({ code: c.code, discount: c.discount, isAutomatic: c.isAutomatic })),
  });
  
  return { codes: rebuiltCodes, total: discountTotal };
}

/**
 * Hook for managing promo codes on a Medusa cart
 */
export function usePromoCode({
  cartId,
  onCartUpdate,
}: UsePromoCodeOptions): UsePromoCodeReturn {
  const [state, dispatch] = useReducer(promoCodeReducer, initialPromoState);

  const refreshRequestIdRef = useRef(0);
  const logger = useRef(createLogger({ context: 'usePromoCode' })).current;

  const clearMessages = useCallback(() => {
    dispatch({ type: 'CLEAR_MESSAGES' });
  }, []);

  /**
   * Refresh discount total from cart without applying/removing codes
   */
  const refreshDiscount = useCallback(async (requestId?: number) => {
    if (!cartId) return;

    const currentRequestId = requestId ?? ++refreshRequestIdRef.current;
    if (requestId !== undefined) {
      refreshRequestIdRef.current = requestId;
    }

    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      const client = getMedusaClient();
      logger.info('[PromoCode] Refreshing discount from cart', { cartId });
      
      const { cart } = await client.store.cart.retrieve(cartId, {
        fields: '+promotions,+promotions.application_method,+items.adjustments,+shipping_methods.adjustments',
      });

      if (currentRequestId !== refreshRequestIdRef.current) {
        logger.info('[PromoCode] Stale request, skipping', { currentRequestId, latestRequestId: refreshRequestIdRef.current });
        return;
      }

      dispatch({ 
        type: 'SET_DISCOUNT_STATE', 
        payload: getDiscountState(cart as unknown as CartWithPromotions, logger) 
      });
    } catch (err) {
      logger.warn('Failed to refresh discount', { error: err });
      dispatch({ 
        type: 'SET_ERROR', 
        payload: "Failed to refresh discounts. Please try again." 
      });
    }
  }, [cartId, logger]);

  const syncFromCart = useCallback((cart: CartWithPromotions) => {
    logger.info('[PromoCode] Syncing from provided cart object', {
      cartId: cart.id,
      discountTotal: cart.discount_total,
      promotionsCount: cart.promotions?.length || 0
    });
    dispatch({ 
      type: 'SET_DISCOUNT_STATE', 
      payload: getDiscountState(cart, logger) 
    });
  }, [logger]);

  const applyPromoCode = useCallback(
    async (code: string): Promise<boolean> => {
      if (!cartId) {
        dispatch({ type: 'SET_ERROR', payload: "Cart not available" });
        return false;
      }

      const normalizedCode = code.trim().toUpperCase();
      if (!normalizedCode) {
        dispatch({ type: 'SET_ERROR', payload: "Please enter a promo code" });
        return false;
      }

      // Check if already applied
      if (state.appliedCodes.some((c) => c.code === normalizedCode)) {
        dispatch({ type: 'SET_ERROR', payload: "This promo code is already applied" });
        return false;
      }

      dispatch({ type: 'SET_LOADING', payload: true });

      try {
        const client = getMedusaClient();
        logger.info('[PromoCode] Applying promo code', { code: normalizedCode });
        
        const manualCodes = state.appliedCodes
          .filter(c => !c.isAutomatic)
          .map(c => c.code);
        
        const allManualCodes = [...manualCodes, normalizedCode];

        const { cart } = await client.store.cart.update(cartId, {
          promo_codes: allManualCodes,
        });

        const rebuiltCodes = extractAppliedCodesFromCart(cart as unknown as CartWithPromotions, logger);
        const wasApplied = rebuiltCodes.some(c => c.code.toUpperCase() === normalizedCode);
        
        if (!wasApplied) {
          logger.warn('[PromoCode] Code accepted by API but not found in adjustments', {
            code: normalizedCode,
            availableCodes: rebuiltCodes.map(c => c.code)
          });
          dispatch({ 
            type: 'SET_ERROR', 
            payload: `Promo code "${normalizedCode}" could not be applied. Check requirements.` 
          });
          return false;
        }

        dispatch({ 
          type: 'SET_DISCOUNT_STATE', 
          payload: getDiscountState(cart as unknown as CartWithPromotions, logger) 
        });
        dispatch({ type: 'SET_SUCCESS', payload: `Promo code "${normalizedCode}" applied!` });
        onCartUpdate?.();
        return true;
      } catch (err: unknown) {
        logger.error("Failed to apply promo code", err as Error);
        dispatch({ type: 'SET_ERROR', payload: extractErrorMessage(err) });
        return false;
      }
    },
    [cartId, state.appliedCodes, onCartUpdate, logger]
  );

  const removePromoCode = useCallback(
    async (code: string): Promise<boolean> => {
      if (!cartId) {
        dispatch({ type: 'SET_ERROR', payload: "Cart not available" });
        return false;
      }

      dispatch({ type: 'SET_LOADING', payload: true });

      try {
        const client = getMedusaClient();
        logger.info('[PromoCode] Removing promo code', { code });
        
        const remainingManualCodes = state.appliedCodes
          .filter(c => c.code !== code && !c.isAutomatic)
          .map(c => c.code);
        
        const { cart } = await client.store.cart.update(cartId, {
          promo_codes: remainingManualCodes,
        });

        dispatch({ 
          type: 'SET_DISCOUNT_STATE', 
          payload: getDiscountState(cart as unknown as CartWithPromotions, logger) 
        });
        dispatch({ type: 'SET_SUCCESS', payload: "Promo code removed" });
        onCartUpdate?.();
        return true;
      } catch (err: unknown) {
        logger.error("Failed to remove promo code", err as Error);
        dispatch({ type: 'SET_ERROR', payload: extractErrorMessage(err) });
        return false;
      }
    },
    [cartId, state.appliedCodes, onCartUpdate, logger]
  );

  return {
    appliedCodes: state.appliedCodes,
    totalDiscount: state.totalDiscount,
    isLoading: state.isLoading,
    error: state.error,
    successMessage: state.successMessage,
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
