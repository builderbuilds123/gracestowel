import { ArrowLeft } from "lucide-react";
import { Link, useLoaderData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { useRef, useCallback, useState, useEffect } from "react";
import { Elements } from "@stripe/react-stripe-js";
import type { StripeAddressElementChangeEvent } from "@stripe/stripe-js";
import { useCart } from "../context/CartContext";
import { useLocale } from "../context/LocaleContext";
import { useCustomer } from "../context/CustomerContext";
import { initStripe, getStripe } from "../lib/stripe";
import { CheckoutForm, type ShippingOption } from "../components/CheckoutForm";
import { OrderSummary } from "../components/OrderSummary";
import { parsePrice } from "../lib/price";
import { generateTraceId, createLogger } from "../lib/logger";
import { useShippingPersistence } from "../hooks/useShippingPersistence";
import { usePaymentCollection } from "../hooks/usePaymentCollection";
import { usePaymentSession } from "../hooks/usePaymentSession";
import { usePromoCode } from "../hooks/usePromoCode";
import { useAutomaticPromotions } from "../hooks/useAutomaticPromotions";
import { useShippingRates } from "../hooks/useShippingRates";
import { useCheckoutError } from "../hooks/useCheckoutError";
import { CHECKOUT_CONSTANTS } from "../constants/checkout";
import type { CartWithPromotions } from "../types/promotion";
import { useMedusaCart } from "../context/MedusaCartContext";


// Check if in development mode (consistent with codebase pattern)
const isDevelopment = import.meta.env.MODE === 'development';

interface LoaderData {
  stripePublishableKey: string;
}

export async function loader({
  context,
}: LoaderFunctionArgs): Promise<LoaderData> {
  // Support both Cloudflare (context.env) and Node/Vite (process.env)
  const cloudflareEnv = context?.cloudflare?.env as { STRIPE_PUBLISHABLE_KEY?: string; VITE_STRIPE_PUBLISHABLE_KEY?: string } | undefined;
  const nodeEnv = (typeof process !== 'undefined'
    ? process.env
    : {}) as { STRIPE_PUBLISHABLE_KEY?: string; VITE_STRIPE_PUBLISHABLE_KEY?: string };
  const stripeKey =
    cloudflareEnv?.STRIPE_PUBLISHABLE_KEY ??
    cloudflareEnv?.VITE_STRIPE_PUBLISHABLE_KEY ??
    nodeEnv?.STRIPE_PUBLISHABLE_KEY ??
    nodeEnv?.VITE_STRIPE_PUBLISHABLE_KEY;
  return {
    stripePublishableKey: stripeKey || "",
  };
}

export default function Checkout() {
  const { stripePublishableKey } = useLoaderData<LoaderData>();

  // Initialize Stripe with key from loader (runs once)
  useEffect(() => {
    if (stripePublishableKey) {
      initStripe(stripePublishableKey);
    }
    
    // Clear stale verifiedOrder from previous checkouts
    // This prevents old order data from appearing on the success page
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.removeItem('verifiedOrder');
        sessionStorage.removeItem('lastOrder'); // Also clear lastOrder to ensure fresh data
      } catch (e) {
        // Non-critical: ignore storage errors
      }
    }
  }, [stripePublishableKey]);

  const { items, cartTotal, updateQuantity, removeFromCart, isLoaded } = useCart();
  const { currency, regionId } = useLocale(); // MULTI-REGION: Get both currency and regionId
  const { customer, isAuthenticated } = useCustomer();

  // Guest email state
  const [guestEmail, setGuestEmail] = useState<string | undefined>(undefined);

  // Session trace ID for logging
  const sessionTraceId = useRef(generateTraceId());
  
  // Initialize structured logger
  const logger = useRef(createLogger({ 
    traceId: sessionTraceId.current,
    context: 'CheckoutPage' 
  })).current;

  // Caching mechanism for shipping rates
  const shippingCache = useRef<Map<string, { options: ShippingOption[], cartId: string | undefined }>>(new Map());

  // AbortController for cancelling stale shipping requests
  const abortControllerRef = useRef<AbortController | null>(null);
  const cartUpdateRequestIdRef = useRef(0);

  // Shipping & Cart state
  // Initialize cartId from sessionStorage if available (client-side only)
  const { cartId, cart: medusaCart, setCart: setMedusaCart, setCartId } = useMedusaCart();

  // Unified Error Handling
  const { 
    errorList, 
    setError, 
    clearError, 
    hasBlockingError 
  } = useCheckoutError();

  // Shipping Rates Hook
  const {
    shippingOptions,
    selectedShipping,
    setSelectedShipping,
    isCalculatingShipping,
    isCartSynced,
    fetchShippingRates,
  } = useShippingRates({
    currency,
    regionId: regionId || "",
    cartId,
    setCartId,
    onCartCreated: (newCartId) => {
      logger.info('Cart created via hook', { cartId: newCartId });
    },
    onCartSynced: () => {
      logger.info('Cart synced via hook');
    },
    onCartSyncError: (err) => {
      if (err) {
        setError('CART_SYNC', { message: err });
      } else {
        clearError('CART_SYNC');
      }
    }
  });

  const [shippingAddress, setShippingAddress] = useState<any>(undefined);
  const cartSyncError = errorList.find(e => e.type === 'CART_SYNC')?.message || null;

  // SHP-01: Shipping persistence hook
  const { 
    isShippingPersisted, 
// ... (lines 83-263 skipped for brevity in thought, but must match in replacement or multi-replace)
// Using multi-replace or careful chunking for this.
 
    setIsShippingPersisted,
    shippingPersistError, 
    setShippingPersistError,
    persistShippingOption 
  } = useShippingPersistence(cartId, sessionTraceId.current);

  // PROMO-1: Promo code hook for managing promotional codes
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

  // Prefer Medusa totals when available (fallback to local calculations)
  const displayCartTotal = medusaCart?.subtotal ?? cartTotal;
  const displayDiscountTotal = medusaCart?.discount_total ?? totalDiscount;
  const displayShippingCost = (selectedShipping && 'amount' in selectedShipping)
    ? (medusaCart?.shipping_total ?? (selectedShipping.amount ?? 0))
    : 0;
  const displayFinalTotal =
    medusaCart?.total ?? (displayCartTotal - displayDiscountTotal + displayShippingCost);

  // Add a dedicated effect to log checkout state changes for debugging auto-promo
  useEffect(() => {
    if (isDevelopment) {
      logger.info('[Checkout] State Sync Trace', {
        itemsCount: items.length,
        cartTotal: displayCartTotal,
        totalDiscount: displayDiscountTotal,
        finalTotal: displayFinalTotal,
        isPromoLoading,
        appliedCodes: appliedPromoCodes.map(c => c.code)
      });
    }
  }, [
    items,
    displayCartTotal,
    displayDiscountTotal,
    displayFinalTotal,
    isPromoLoading,
    appliedPromoCodes,
    isDevelopment,
    logger,
  ]);

  // PROMO-1 Phase 2: Automatic promotions hook
  const {
    promotions: automaticPromotions,
    hasFreeShipping,
  } = useAutomaticPromotions({ 
    cartSubtotal: displayCartTotal,
    currencyCode: currency,
    enabled: displayCartTotal > 0,
  });

  /**
   * SHP-01: Handle shipping selection (LOCAL ONLY)
   * Decoupled from persistence to prevent PaymentElement reload
   */
  const handleShippingSelect = useCallback((option: ShippingOption) => {
    setSelectedShipping(option);
  }, []);

  // Handle cart expiration logic which was previously inside the inline function
  // We need to watch for specific error messages that indicate expiration
  useEffect(() => {
    if (shippingPersistError?.includes('expired')) {
       setCartId(undefined);
    }
  }, [shippingPersistError]);


  // cartId persistence handled by MedusaCartContext

  // Calculate original total (before discount) using price utility
  const originalTotal = items.reduce((total, item) => {
    const originalPrice = parsePrice(item.originalPrice || item.price);
    return total + originalPrice * item.quantity;
  }, 0);

  // Shipping amount from Medusa is in dollars
  const shippingCost = selectedShipping?.amount ?? 0;

  const hasFiredCheckoutStarted = useRef(false);

  // Track checkout started event in PostHog
  useEffect(() => {
    if (
      displayCartTotal > 0 &&
      typeof window !== "undefined" &&
      !hasFiredCheckoutStarted.current
    ) {
      import("../utils/posthog").then(({ default: posthog }) => {
        posthog.capture("checkout_started", {
          cart_total: displayCartTotal,
          item_count: items.length,
          currency,
          items: items.map((item) => ({
            product_id: item.id,
            product_name: item.title,
            quantity: item.quantity,
            price: item.price,
          })),
        });
      });
      hasFiredCheckoutStarted.current = true;
    }
  }, [displayCartTotal, items, currency]);

  // CHK-02-B M1 FIX: Payment hooks with race condition protection
  // Step 1: Create PaymentCollection (once per cart, with request ID pattern)
  const { 
    paymentCollectionId, 
    initialPaymentSession,
    error: collectionError 
  } = usePaymentCollection(cartId, isCartSynced);

  // Step 2: Create PaymentSession (Create ONCE when cart is synced)
  // UX-FIX: We only create the initial session when cart is synced.
  // We intentionally do NOT refresh immediately after shipping selection because
  // changing the clientSecret causes Elements to remount and lose user input.
  // The shipping persistence will happen during handleSubmit.
  // OPTIMIZATION: Pass the initial session from step 1 to avoid a second fetch.
  const shouldCreateSession = isCartSynced;
  const { 
    clientSecret, 
    error: sessionError 
  } = usePaymentSession(paymentCollectionId, shouldCreateSession, initialPaymentSession);

  // Combine payment errors for display
  const paymentError = collectionError || sessionError;



  // Effect to trigger shipping fetch when items or address change
  // Uses direct setTimeout architecture for robust debouncing
  useEffect(() => {
    if (items.length === 0) return;

    // specific debounce for address changes
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

  // PROMO-1: Promo discounts are synced from the cart update response to avoid stale reads.

  // Handler for address changes from Stripe Address Element
  const handleAddressChange = async (event: StripeAddressElementChangeEvent) => {
    // Only update and fetch rates if the address is fully complete
    // This effectively defers the API call until the form is filled, similar to 'onBlur'
    if (!event.complete) {
      return;
    }

    const addressValue = event.value;

    // Parse name into first/last name for Medusa
    let firstName = '';
    let lastName = '';
    if (addressValue.name) {
        const trimmedName = addressValue.name.trim();
        const parts = trimmedName.split(' ');
        firstName = parts[0] || '';
        lastName = parts.length > 1 ? parts.slice(1).join(' ') : '';
    }

    setShippingAddress({
        ...addressValue,
        firstName,
        lastName
    });
  };

  // Stripe Elements options - use clientSecret when available for full functionality
  // including developer autofill tools
  const options = clientSecret ? {
    clientSecret,
    appearance: {
      theme: "stripe" as const,
      variables: {
        colorPrimary: "#8A6E59",
        colorBackground: "#ffffff",
        colorText: "#3C3632",
        colorDanger: "#df1b41",
        fontFamily: "Alegreya, system-ui, sans-serif",
        spacingUnit: "4px",
        borderRadius: "8px",
        colorTextSecondary: "#6B7280",
        gridRowSpacing: "16px",
      },
      rules: {
        ".Tab": {
          border: "1px solid #D4D8C4",
          boxShadow: "none",
          backgroundColor: "#FCFAF8",
        },
        ".Tab:hover": {
          borderColor: "#8A6E59",
        },
        ".Tab--selected": {
          borderColor: "#8A6E59",
          backgroundColor: "#ffffff",
          color: "#8A6E59",
          boxShadow: "0 0 0 1px #8A6E59",
        },
        ".Input": {
          border: "1px solid #D4D8C4",
          boxShadow: "none",
        },
        ".Input:focus": {
          border: "1px solid #8A6E59",
          boxShadow: "0 0 0 1px #8A6E59",
        },
        ".Label": {
          color: "#3C3632",
          fontWeight: "500",
          marginBottom: "8px",
        },
      },
    },
    fonts: [
      {
        cssSrc:
          "https://fonts.googleapis.com/css2?family=Alegreya:ital,wght@0,400;0,500;0,700;1,400&display=swap",
      },
    ],
  } : null;

  // Show loading spinner while cart is being loaded from localStorage
  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-card-earthy/10 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent-earthy"></div>
      </div>
    );
  }

  if (displayCartTotal <= 0) {
    return (
      <div className="min-h-screen bg-card-earthy/10 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-serif text-text-earthy mb-4">
            Your towel rack is empty
          </h2>
          <Link to="/" className="text-accent-earthy hover:underline">
            Return to Store
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-background-earthy min-h-screen pt-20 pb-12">
      <div className="container mx-auto px-4">
        <div className="mb-8">
          <Link
            to="/towels"
            className="inline-flex items-center text-text-earthy hover:text-accent-earthy transition-colors"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Return to Towels
          </Link>
        </div>

        {/* Payment Error Display */}
        {cartSyncError && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-6">
            <p className="font-bold">Items Unavailable</p>
            <p>{cartSyncError}</p>
            <p className="text-sm mt-1">Please return to your cart and remove the out-of-stock items.</p>
          </div>
        )}

        {/* Payment Error Display */}
        {paymentError && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-6">
            <p>{paymentError}</p>
          </div>
        )}

        {/* SHP-01: Shipping Persistence Warning */}
        {shippingPersistError && (
          <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded mb-6">
            <p className="font-medium">⚠️ Warning</p>
            <p className="text-sm mt-1">{shippingPersistError}</p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
          {/* Checkout Form */}
          <div className="lg:col-span-7 space-y-8">
            {clientSecret && options ? (
              <Elements options={options} stripe={getStripe()} key={paymentCollectionId}>
                <div className="bg-white p-6 lg:p-8 rounded-lg shadow-sm border border-card-earthy/20">
                  <CheckoutForm
                    items={items}
                    cartTotal={displayCartTotal}
                    onAddressChange={handleAddressChange}
                    onEmailChange={setGuestEmail}
                    shippingOptions={shippingOptions}
                    selectedShipping={selectedShipping}
                    setSelectedShipping={handleShippingSelect}
                    isCalculatingShipping={isCalculatingShipping}
                    persistShippingOption={persistShippingOption}
                    isShippingPersisted={isShippingPersisted}
                    paymentCollectionId={paymentCollectionId}
                    guestEmail={guestEmail}
                    cartId={cartId || ""}
                    discountTotal={displayDiscountTotal}
                    appliedPromoCodes={appliedPromoCodes}
                    customerData={
                      isAuthenticated && customer
                        ? {
                            email: customer.email,
                            firstName: customer.first_name,
                            lastName: customer.last_name,
                            phone: customer.phone,
                            address: customer.addresses?.[0]
                              ? {
                                  line1: customer.addresses[0].address_1,
                                  line2: customer.addresses[0].address_2,
                                  city: customer.addresses[0].city,
                                  state: customer.addresses[0].province,
                                  postal_code: customer.addresses[0].postal_code,
                                  country:
                                    customer.addresses[0].country_code?.toUpperCase(),
                                }
                              : undefined,
                          }
                        : undefined
                    }
                  />
                </div>
              </Elements>
            ) : (
              <div className="bg-white p-6 lg:p-8 rounded-lg shadow-sm border border-card-earthy/20">
                <div className="animate-pulse space-y-4">
                  <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                  <div className="h-10 bg-gray-200 rounded"></div>
                  <div className="h-4 bg-gray-200 rounded w-1/4 mt-6"></div>
                  <div className="h-10 bg-gray-200 rounded"></div>
                  <div className="h-10 bg-gray-200 rounded"></div>
                  <div className="h-4 bg-gray-200 rounded w-1/4 mt-6"></div>
                  <div className="h-10 bg-gray-200 rounded"></div>
                </div>
                <p className="text-sm text-gray-500 mt-4 text-center">Loading payment form...</p>
              </div>
            )}
          </div>

          {/* Order Summary */}
          <OrderSummary
            items={items}
            cartTotal={displayCartTotal}
            originalTotal={originalTotal}
            selectedShipping={selectedShipping}
            shippingCost={displayShippingCost}
            finalTotal={displayFinalTotal}
            onUpdateQuantity={updateQuantity}
            onRemoveFromCart={removeFromCart}
            // PROMO-1: Promo code props
            cartId={cartId}
            appliedPromoCodes={appliedPromoCodes}
            onApplyPromoCode={applyPromoCode}
            onRemovePromoCode={removePromoCode}
            isPromoLoading={isPromoLoading}
            promoError={promoError}
            promoSuccessMessage={promoSuccessMessage}
            discountTotal={displayDiscountTotal}
            automaticPromotions={automaticPromotions}
          />
        </div>
      </div>
    </div>
  );
}
