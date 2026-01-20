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
import { useAutomaticPromotions } from '../../hooks/useAutomaticPromotions';
import { generateTraceId, createLogger } from '../../lib/logger';
import { parsePrice } from '../../lib/price';
import { CHECKOUT_CONSTANTS } from '../../constants/checkout';
import { type ShippingOption } from '../CheckoutForm';
import type { CartItem, ProductId } from '../../types/product';
import type { CartWithPromotions } from '../../types/promotion';
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
  isShippingPersisted: boolean;
  
  // Payment
  paymentCollectionId: string | null;
  initialPaymentSession: any;
  clientSecret: string | null;
  
  // Promo
  appliedPromoCodes: any[];
  isPromoLoading: boolean;
  promoError: string | null;
  promoSuccessMessage: string | null;
  automaticPromotions: any[];
  
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
  logger: any;
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
  const { items, cartTotal, updateQuantity, removeFromCart, isLoaded } = useCart();
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
    onCartCreated: (newCartId) => {
      logger.info('Cart created via hook', { cartId: newCartId });
      setMedusaCart(null);
    },
    onCartSynced: () => {
      logger.info('Cart synced via hook');
    },
    onCartUpdated: (cart) => {
      setMedusaCart(cart);
      syncPromoFromCart(cart);
    },
    onCartSyncError: (err) => {
      if (err) {
        setError('CART_SYNC', { message: err });
      } else {
        clearError('CART_SYNC');
      }
    }
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

  const displayCartTotal = medusaCart?.subtotal ?? cartTotal;
  const displayDiscountTotal = medusaCart?.discount_total ?? totalDiscount;
  const displayShippingCost = (selectedShipping && 'amount' in selectedShipping)
    ? (medusaCart?.shipping_total ?? (selectedShipping.amount ?? 0))
    : 0;
  const displayFinalTotal =
    medusaCart?.total ?? (displayCartTotal - displayDiscountTotal + displayShippingCost);

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
  }, [items, shippingAddress, cartTotal, fetchShippingRates, guestEmail, appliedPromoCodes]);

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
    cartId, medusaCart, isLoading, isCalculatingShipping, isCartSynced, 
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
