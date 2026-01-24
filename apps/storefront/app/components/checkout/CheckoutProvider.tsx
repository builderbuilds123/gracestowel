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
import type { ShippingOption } from '../../types/checkout';
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
  hasActiveDiscount: boolean; // Stable flag for discount row visibility
  
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

interface CheckoutProviderProps {
  children: React.ReactNode;
}

export function CheckoutProvider({ children }: CheckoutProviderProps) {
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
  } = usePromoCode({
    cartId,
    // Directly update medusaCart with the response from promo code API
    // This ensures CheckoutProvider gets the updated discount_total immediately
    // without making an extra API call
    onCartUpdated: setMedusaCart,
  });

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
  } = useShippingPersistence({
    cartId,
    traceId: sessionTraceId,
    // Update cart state when shipping is persisted to reflect new totals
    onCartUpdated: React.useCallback((cart: CartWithPromotions) => {
      setMedusaCart(cart);
      logger.info('Cart updated after shipping persist', {
        shipping_total: cart.shipping_total,
        total: cart.total
      });
    }, [setMedusaCart, logger])
  });

  const isCalculatingShipping = state.status === 'fetching_shipping';
  const isCartSynced = state.status !== 'idle' && state.status !== 'initializing' && state.status !== 'syncing_cart';
  const cartSyncError = errorList.find(e => e.type === 'CART_SYNC')?.message || null;

  // =============================================================================
  // PRICING DISPLAY STRATEGY (Industry Best Practice)
  // =============================================================================
  //
  // Following Shopify Hydrogen's optimistic cart pattern and skeleton loading best practices:
  // @see https://shopify.dev/docs/api/hydrogen/2024-10/hooks/useoptimisticcart
  // @see https://blog.logrocket.com/ux-design/skeleton-loading-screen-design/
  //
  // 1. SUBTOTAL: Always show local calculation immediately (user sees instant feedback)
  // 2. DISCOUNT/SHIPPING/TOTAL: Show loading skeleton when syncing, actual values when synced
  // 3. No value flicker - either show correct value or loading indicator
  // =============================================================================

  // Medusa v2 Totals are in Major Units (Dollars) - No conversion needed
  const medusaSubtotal = typeof medusaCart?.subtotal === 'number' ? medusaCart.subtotal : null;
  const medusaDiscount = typeof medusaCart?.discount_total === 'number' ? medusaCart.discount_total : null;
  const medusaShipping = typeof medusaCart?.shipping_total === 'number' ? medusaCart.shipping_total : null;
  const medusaTotal = typeof medusaCart?.total === 'number' ? medusaCart.total : null;

  // Store confirmed backend values - only update when not syncing
  const confirmedDiscountRef = useRef<number>(0);
  const confirmedTotalRef = useRef<number>(0);

  // Update confirmed values when sync completes
  if (!isSyncing) {
    if (medusaDiscount !== null) {
      confirmedDiscountRef.current = medusaDiscount;
    }
    if (medusaTotal !== null) {
      confirmedTotalRef.current = medusaTotal;
    }
  }

  // SUBTOTAL: Always use local calculation for immediate feedback
  // This is the one value that can be calculated purely from local items
  const displayCartTotal = cartTotal;

  // DISCOUNT: Use confirmed backend value when not syncing, otherwise UI will show loading
  // The actual display logic (showing loading vs value) is in OrderSummary
  const displayDiscountTotal = useMemo(() => {
    if (!isSyncing && medusaDiscount !== null) {
      return medusaDiscount;
    }
    // Return last confirmed value (or 0) - UI will show loading indicator when isSyncing
    return confirmedDiscountRef.current;
  }, [medusaDiscount, isSyncing]);

  // SHIPPING: Use selected shipping amount or backend value
  const displayShippingCost = (selectedShipping && 'amount' in selectedShipping)
    ? (medusaShipping ?? (selectedShipping.amount ?? 0))
    : 0;

  // TOTAL: Use confirmed backend value when not syncing, otherwise UI will show loading
  const displayFinalTotal = useMemo(() => {
    if (!isSyncing && medusaTotal !== null) {
      return medusaTotal;
    }
    // Return last confirmed value (or calculated) - UI will show loading indicator when isSyncing
    if (confirmedTotalRef.current > 0) {
      return confirmedTotalRef.current;
    }
    // Fallback calculation when no backend data yet
    return displayCartTotal - displayDiscountTotal + displayShippingCost;
  }, [medusaTotal, isSyncing, displayCartTotal, displayDiscountTotal, displayShippingCost]);

  // Stable flag for discount row visibility - show row if any discount exists or promo codes applied
  const hasActiveDiscount = useMemo(() => {
    return appliedPromoCodes.length > 0 ||
           confirmedDiscountRef.current > 0 ||
           (medusaDiscount !== null && medusaDiscount > 0) ||
           totalDiscount > 0;
  }, [appliedPromoCodes.length, medusaDiscount, totalDiscount]);

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
  } = usePaymentSession(
    paymentCollectionId,
    isCartSynced,
    initialPaymentSession
  );

  const paymentError = collectionError || sessionError;

  // Best Practice: rerender-dependencies - Use primitive dependencies for effects
  // Stable string hash to prevent infinite loops when array reference changes
  const promoCodesHash = useMemo(() => {
    return JSON.stringify([...appliedPromoCodes.map(c => c.code)].sort());
  }, [appliedPromoCodes]);

  // Best Practice: rerender-dependencies - Derive primitive dependencies
  // to minimize effect re-runs (only re-run when these actually change)
  const itemsLength = items.length;
  const addressKey = shippingAddress
    ? `${shippingAddress.address?.line1 ?? ''}-${shippingAddress.address?.postal_code ?? ''}-${shippingAddress.address?.country ?? ''}`
    : '';

  useEffect(() => {
    if (itemsLength === 0) return;
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
    // Use primitive dependencies for stability, but include actual objects in deps array for linter
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsLength, addressKey, cartTotal, fetchShippingRates, guestEmail, promoCodesHash]);

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
    hasActiveDiscount,
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
    automaticPromotions, hasActiveDiscount, fetchShippingRates, persistShippingOption,
    applyPromoCode, removePromoCode, updateQuantity, removeFromCart, setMedusaCart,
    setCartId, clearError, setError, logger, sessionTraceId
  ]);

  return (
    <CheckoutContext.Provider value={value}>
      {children}
    </CheckoutContext.Provider>
  );
}
