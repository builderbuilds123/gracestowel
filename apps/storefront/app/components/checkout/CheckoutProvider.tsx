import React, { createContext, useContext, useRef, useMemo, useEffect } from 'react';
import { useCart } from '../../context/CartContext';
import { useLocale } from '../../context/LocaleContext';
import { useCustomer } from '../../context/CustomerContext';
import { useMedusaCart } from '../../context/MedusaCartContext';
import { useCheckoutState } from '../../hooks/useCheckoutState';
import { useShippingRates } from '../../hooks/useShippingRates';
import { useCheckoutError } from '../../hooks/useCheckoutError';
import { useShippingPersistence } from '../../hooks/useShippingPersistence';
import { usePaymentCollection } from '../../hooks/usePaymentCollection';
import { usePaymentSession } from '../../hooks/usePaymentSession';
import { usePromoCode } from '../../hooks/usePromoCode';
import { useAutomaticPromotions, type AutomaticPromotionInfo } from '../../hooks/useAutomaticPromotions';
import { generateTraceId, createLogger } from '../../lib/logger';
import { parsePrice } from '../../lib/price';
import { CHECKOUT_CONSTANTS } from '../../constants/checkout';
import { type ShippingOption } from '../CheckoutForm';
import type { CartItem, ProductId } from '../../types/product';
import type { CartWithPromotions, AppliedPromoCode } from '../../types/promotion';
import type { CheckoutState } from '../../types/checkout';
import type { CheckoutError, CheckoutErrorType } from '../../hooks/useCheckoutError';

const isDevelopment = import.meta.env.MODE === 'development';

interface CheckoutContextType {
  // State
  state: CheckoutState;
  actions: ReturnType<typeof useCheckoutState>['actions'];
  
  // Cart & Totals
  items: CartItem[];
  displayCartTotal: number;
  displayDiscountTotal: number;
  displayShippingCost: number;
  displayFinalTotal: number;
  originalTotal: number;
  isLoaded: boolean;
  
  // Errors
  errorList: CheckoutError[];
  cartSyncError: string | null;
  paymentError: string | null;
  shippingPersistError: string | null;
  hasBlockingError: boolean;
  
  // Hooks state
  cartId: string | undefined;
  medusaCart: CartWithPromotions | null;
  isLoading: boolean;
  isCalculatingShipping: boolean;
  isCartSynced: boolean;
  isSyncing: boolean;
  isShippingPersisted: boolean;
  
  // Payment
  paymentCollectionId: string | null;
  initialPaymentSession: Record<string, unknown> | null;
  clientSecret: string | null;
  
  // Promo
  appliedPromoCodes: AppliedPromoCode[];
  isPromoLoading: boolean;
  promoError: string | null;
  promoSuccessMessage: string | null;
  automaticPromotions: AutomaticPromotionInfo[];
  
  // Methods
  fetchShippingRates: ReturnType<typeof useShippingRates>['fetchShippingRates'];
  persistShippingOption: (option: ShippingOption) => Promise<void>;
  applyPromoCode: (code: string) => Promise<boolean>;
  removePromoCode: (code: string) => Promise<boolean>;
  updateQuantity: (id: ProductId, quantity: number, color?: string, variantId?: string) => void;
  removeFromCart: (id: ProductId, color?: string, variantId?: string) => void;
  setMedusaCart: (cart: CartWithPromotions | null) => void;
  setCartId: (id: string | undefined) => void;
  clearError: (type: CheckoutErrorType) => void;
  setError: (type: CheckoutErrorType, error: { message: string }) => void;
  
  // Refs/Logger
  logger: ReturnType<typeof createLogger>;
  sessionTraceId: string;
}

const CheckoutContext = createContext<CheckoutContextType | null>(null);

export function useCheckout() {
  const context = useContext(CheckoutContext);
  if (!context) {
    throw new Error('useCheckout must be used within a CheckoutProvider');
  }
  return context;
}

export function CheckoutProvider({ children }: { children: React.ReactNode }) {
  const { items, cartTotal, updateQuantity, removeFromCart, isLoaded, isSyncing } = useCart();
  const { currency, regionId } = useLocale();
  const { customer, isAuthenticated } = useCustomer();
  const { cartId, cart: medusaCart, setCart: setMedusaCart, setCartId, isLoading } = useMedusaCart();

  const sessionTraceId = useRef(generateTraceId()).current;
  const logger = useRef(createLogger({ 
    traceId: sessionTraceId,
    context: 'CheckoutProvider' 
  })).current;

  const { errorList, setError, clearError, hasBlockingError } = useCheckoutError();
  const { state, actions } = useCheckoutState();
  const { 
    shippingOptions, 
    selectedShippingOption: selectedShipping,
    shippingAddress,
    email: guestEmail
  } = state;

  const {
    appliedCodes: appliedPromoCodes,
    totalDiscount,
    isLoading: isPromoLoading,
    error: promoError,
    successMessage: promoSuccessMessage,
    applyPromoCode,
    removePromoCode,
    refreshDiscount,
    syncFromCart: syncPromoFromCart,
  } = usePromoCode({ cartId });

  const {
    fetchShippingRates,
    clearCache
  } = useShippingRates({
    currency,
    regionId: regionId || "",
    cartId,
    selectedShipping,
    setCartId,
    setShippingOptions: actions.setShippingOptions,
    setSelectedShipping: actions.selectShippingOption,
    setIsCalculating: (isCalc) => actions.setStatus(isCalc ? 'fetching_shipping' : 'ready'),
    setIsCartSynced: (synced) => {
      if (!synced) {
        actions.setStatus('syncing_cart');
      }
    },
    onCartCreated: React.useCallback((newCartId: string) => {
      logger.info('Cart created via hook', { cartId: newCartId });
      setMedusaCart(null);
    }, [logger, setMedusaCart]),
    onCartSynced: React.useCallback(() => {
      logger.info('Cart synced via hook');
    }, [logger]),
    onCartUpdated: React.useCallback((cart: CartWithPromotions) => {
      setMedusaCart(cart);
      syncPromoFromCart(cart);
    }, [setMedusaCart, syncPromoFromCart]),
    onCartSyncError: React.useCallback((err: string | null) => {
      if (err) {
        setError('CART_SYNC', { message: err });
      } else {
        clearError('CART_SYNC');
      }
    }, [setError, clearError])
  });

  const { 
    isShippingPersisted, 
    setIsShippingPersisted,
    shippingPersistError, 
    setShippingPersistError,
    persistShippingOption 
  } = useShippingPersistence(cartId, sessionTraceId);

  const isCalculatingShipping = state.status === 'fetching_shipping';
  const isCartSynced = state.status !== 'idle' && state.status !== 'initializing' && state.status !== 'syncing_cart';
  const cartSyncError = errorList.find(e => e.type === 'CART_SYNC')?.message || null;

  // Medusa v2 Totals are in Major Units (Dollars) - No conversion needed
  const medusaSubtotal = typeof medusaCart?.subtotal === 'number' ? medusaCart.subtotal : null;
  const medusaDiscount = typeof medusaCart?.discount_total === 'number' ? medusaCart.discount_total : null;
  const medusaShipping = typeof medusaCart?.shipping_total === 'number' ? medusaCart.shipping_total : null;
  const medusaTotal = typeof medusaCart?.total === 'number' ? medusaCart.total : null;

  // Optimistic calculation to prevent jumpy UI during sync
  const displayCartTotal = useMemo(() => {
    const localSubtotal = cartTotal;
    
    // If not syncing, prefer the backend's precise total if available
    if (!isSyncing && medusaSubtotal !== null) {
      return medusaSubtotal;
    }

    if (medusaCart && items.length > 0) {
      // Logic for multi-item correct discount preservation:
      // 1. Identify if we have fixed or percentage discounts
      // 2. If percentage: preserve the RATIO (medusaDiscount / lastMedusaSubtotal)
      // 3. If fixed: preserve the ABSOLUTE value (clamped to not exceed subtotal)
      
      const lastMedusaDiscountTotal = medusaCart.discount_total || 0;
      const lastMedusaSubtotalRaw = medusaCart.item_total || medusaCart.subtotal || 1;
      
      // Determine if a fixed amount discount is likely (Medusa v2 specific check would be better but ratio approach is safer)
      // We look at the first promotion to guess intent if multiple exist
      const isFixedAmount = medusaCart.promotions?.some(p => p.application_method?.type === 'fixed');

      if (isFixedAmount) {
        // Fixed discount: subtract absolute amount from new local subtotal
        return Math.max(0, localSubtotal - lastMedusaDiscountTotal);
      } else {
        // Percentage discount (or mixed): apply the previous RATIO to the new subtotal
        const discountRatio = lastMedusaDiscountTotal / lastMedusaSubtotalRaw;
        return localSubtotal * (1 - discountRatio);
      }
    }
    
    return localSubtotal;
  }, [cartTotal, medusaCart, items.length, isSyncing, medusaSubtotal]);

  const displayDiscountTotal = useMemo(() => {
    if (!isSyncing && medusaDiscount !== null) return medusaDiscount;

    if (medusaCart && items.length > 0) {
      const lastMedusaDiscountTotal = medusaCart.discount_total || 0;
      const lastMedusaSubtotalRaw = medusaCart.item_total || medusaCart.subtotal || 1;
      const isFixedAmount = medusaCart.promotions?.some(p => p.application_method?.type === 'fixed');

      if (isFixedAmount) return lastMedusaDiscountTotal;
      
      const ratio = lastMedusaDiscountTotal / lastMedusaSubtotalRaw;
      return cartTotal * ratio;
    }
    return totalDiscount;
  }, [medusaDiscount, isSyncing, medusaCart, items.length, cartTotal, totalDiscount]);

  const displayShippingCost = (selectedShipping && 'amount' in selectedShipping)
    ? (medusaShipping ?? (selectedShipping.amount ?? 0))
    : 0;

  const displayFinalTotal = medusaTotal ?? (displayCartTotal - (medusaDiscount ?? totalDiscount) + displayShippingCost);

  const {
    promotions: automaticPromotions,
    hasFreeShipping,
  } = useAutomaticPromotions({ 
    cartSubtotal: displayCartTotal,
    currencyCode: currency,
    enabled: displayCartTotal > 0,
  });

  const originalTotal = useMemo(() => items.reduce((total, item) => {
    const originalPrice = parsePrice(item.originalPrice || item.price);
    return total + originalPrice * item.quantity;
  }, 0), [items]);

  const { 
    paymentCollectionId, 
    initialPaymentSession,
    error: collectionError 
  } = usePaymentCollection(cartId, isCartSynced);

  const { 
    clientSecret, 
    error: sessionError 
  } = usePaymentSession(paymentCollectionId, isCartSynced, initialPaymentSession);

  const paymentError = collectionError || sessionError;

  // Stable dependency for promo codes to prevent infinite loops
  const promoCodesHash = useMemo(() => {
    return JSON.stringify(appliedPromoCodes.map(c => c.code).sort());
  }, [appliedPromoCodes]);

  useEffect(() => {
    if (items.length === 0) return;
    const timer = setTimeout(() => {
      fetchShippingRates(
        items, 
        shippingAddress, 
        cartTotal, 
        guestEmail, 
        appliedPromoCodes.map(c => ({ code: c.code, isAutomatic: c.isAutomatic ?? false }))
      );
    }, CHECKOUT_CONSTANTS.ADDRESS_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [items, shippingAddress, cartTotal, fetchShippingRates, guestEmail, promoCodesHash]);

  const value = useMemo(() => ({
    state,
    actions,
    items,
    displayCartTotal,
    displayDiscountTotal,
    displayShippingCost,
    displayFinalTotal,
    originalTotal,
    isLoaded,
    errorList,
    cartSyncError,
    paymentError,
    shippingPersistError,
    hasBlockingError,
    cartId,
    medusaCart,
    isLoading,
    isCalculatingShipping,
    isCartSynced,
    isSyncing,
    isShippingPersisted,
    paymentCollectionId,
    initialPaymentSession,
    clientSecret,
    appliedPromoCodes,
    isPromoLoading,
    promoError,
    promoSuccessMessage,
    automaticPromotions,
    fetchShippingRates,
    persistShippingOption,
    applyPromoCode,
    removePromoCode,
    updateQuantity,
    removeFromCart,
    setMedusaCart,
    setCartId,
    clearError,
    setError,
    logger,
    sessionTraceId
  }), [
    state, actions, items, displayCartTotal, displayDiscountTotal, 
    displayShippingCost, displayFinalTotal, originalTotal, isLoaded,
    errorList, cartSyncError, paymentError, shippingPersistError, hasBlockingError,
    cartId, medusaCart, isLoading, isCalculatingShipping, isCartSynced, isSyncing,
    isShippingPersisted, paymentCollectionId, initialPaymentSession, clientSecret,
    appliedPromoCodes, isPromoLoading, promoError, promoSuccessMessage, 
    automaticPromotions, fetchShippingRates, persistShippingOption, applyPromoCode,
    removePromoCode, updateQuantity, removeFromCart, setMedusaCart, setCartId,
    clearError, setError, logger, sessionTraceId
  ]);

  return (
    <CheckoutContext.Provider value={value}>
      {children}
    </CheckoutContext.Provider>
  );
}
