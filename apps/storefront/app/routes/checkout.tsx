import { ArrowLeft } from "lucide-react";
import { Link, useLoaderData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { useState, useEffect, useRef, useCallback } from "react";
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
import { generateCartHash } from "../utils/cart-hash";
import { useShippingPersistence } from "../hooks/useShippingPersistence";
import { usePaymentCollection } from "../hooks/usePaymentCollection";
import { usePaymentSession } from "../hooks/usePaymentSession";
import { usePromoCode } from "../hooks/usePromoCode";
import { useAutomaticPromotions } from "../hooks/useAutomaticPromotions";
import { monitoredFetch } from "../utils/monitored-fetch";
import type { CartWithPromotions } from "../types/promotion";


// Check if in development mode (consistent with codebase pattern)
const isDevelopment = import.meta.env.MODE === 'development';

interface LoaderData {
  stripePublishableKey: string;
}

export async function loader({
  context,
}: LoaderFunctionArgs): Promise<LoaderData> {
  // Support both Cloudflare (context.env) and Node/Vite (process.env)
  const cloudflareEnv = context?.cloudflare?.env;
  const nodeEnv = typeof process !== 'undefined' ? process.env : {};
  const env = (cloudflareEnv || nodeEnv) as { STRIPE_PUBLISHABLE_KEY?: string; VITE_STRIPE_PUBLISHABLE_KEY?: string };
  const stripeKey = env.STRIPE_PUBLISHABLE_KEY || env.VITE_STRIPE_PUBLISHABLE_KEY;
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
  const [cartId, setCartId] = useState<string | undefined>(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('medusa_cart_id') || undefined;
    }
    return undefined;
  });

  const [shippingOptions, setShippingOptions] = useState<ShippingOption[]>([]);
  const [selectedShipping, setSelectedShipping] =
    useState<ShippingOption | null>(null);
  const [isCalculatingShipping, setIsCalculatingShipping] = useState(false);
  const [shippingAddress, setShippingAddress] = useState<any>(undefined);
  const [isCartSynced, setIsCartSynced] = useState(false); // Track when cart items are synced to Medusa
  const [cartSyncError, setCartSyncError] = useState<string | null>(null);

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

  // Add a dedicated effect to log checkout state changes for debugging auto-promo
  useEffect(() => {
    if (isDevelopment) {
      logger.info('[Checkout] State Sync Trace', {
        itemsCount: items.length,
        cartTotal,
        totalDiscount,
        finalTotal: (cartTotal - totalDiscount + (selectedShipping?.amount ?? 0)),
        isPromoLoading,
        appliedCodes: appliedPromoCodes.map(c => c.code)
      });
    }
  }, [items, cartTotal, totalDiscount, isPromoLoading, appliedPromoCodes, isDevelopment, logger, selectedShipping]);

  // PROMO-1 Phase 2: Automatic promotions hook
  const {
    promotions: automaticPromotions,
    hasFreeShipping,
  } = useAutomaticPromotions({ 
    cartSubtotal: cartTotal,
    currencyCode: currency,
    enabled: cartTotal > 0,
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
       if (typeof window !== 'undefined') {
         sessionStorage.removeItem('medusa_cart_id');
       }
    }
  }, [shippingPersistError]);


  // Persist cartId to sessionStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (cartId) {
        sessionStorage.setItem('medusa_cart_id', cartId);
        if (isDevelopment) {
          logger.info('cartId changed', { cartId });
        }
      } else {
        // We generally don't remove it unless explicitly expired, but if cartId becomes undefined
        // it means we lost context.
      }
    }
  }, [cartId]);

  // Calculate original total (before discount) using price utility
  const originalTotal = items.reduce((total, item) => {
    const originalPrice = parsePrice(item.originalPrice || item.price);
    return total + originalPrice * item.quantity;
  }, 0);

  // Shipping amount from Medusa is in dollars
  const shippingCost = selectedShipping?.amount ?? 0;
  // PROMO-1: Subtract discount from final total
  const finalTotal = cartTotal - totalDiscount + shippingCost;

  const hasFiredCheckoutStarted = useRef(false);

  // Track checkout started event in PostHog
  useEffect(() => {
    if (
      cartTotal > 0 &&
      typeof window !== "undefined" &&
      !hasFiredCheckoutStarted.current
    ) {
      import("../utils/posthog").then(({ default: posthog }) => {
        posthog.capture("checkout_started", {
          cart_total: cartTotal,
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
  }, [cartTotal, items, currency]);

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

  const buildUpdatePayload = useCallback((currentItems: typeof items, address: { firstName?: string; lastName?: string; address?: { line1?: string; line2?: string; city?: string; country?: string; postal_code?: string; state?: string }; phone?: string }) => {
    const payload: Record<string, unknown> = {
      items: currentItems,
      promo_codes: appliedPromoCodes
        .filter(code => !code.isAutomatic)
        .map((code) => code.code)
    };

    if (address) {
      payload.shipping_address = {
        first_name: address.firstName || '',
        last_name: address.lastName || '',
        address_1: address.address?.line1 || '',
        address_2: address.address?.line2,
        city: address.address?.city || '',
        country_code: address.address?.country || '',
        postal_code: address.address?.postal_code || '',
        province: address.address?.state,
        phone: address.phone,
      };
    }

    if (guestEmail) {
      payload.email = guestEmail;
    }

    if (regionId) {
      payload.region_id = regionId;
    }

    return payload;
  }, [appliedPromoCodes, guestEmail, regionId]);

  const updateCartAndSync = useCallback(async (
    currentCartId: string,
    currentItems: typeof items,
    address: any,
    controller: AbortController,
    currentRequestId: number
  ): Promise<boolean> => {
    if (isDevelopment) {
      logger.info('Step 2: Updating cart items/address...');
    }

    const updatePayload = buildUpdatePayload(currentItems, address);
    const updateResponse = await monitoredFetch(`/api/carts/${currentCartId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updatePayload),
      label: 'update-cart',
      signal: controller.signal,
    });

    const updateResult = await updateResponse.json() as { 
      error?: string; 
      details?: string; 
      code?: string;
      cart?: CartWithPromotions;
    };

    if (!updateResponse.ok) {
      const error = updateResult as { error: string; details?: string; code?: string };
      logger.error('Step 2 FAILED - Cart update', undefined, error as Record<string, unknown>);
      
      // Handle region mismatch - display error instead of creating new cart
      // CRITICAL: Do NOT reset cartId here as it causes paymentCollectionId reset
      // and Elements remount, clearing all form inputs
      if (error.code === 'REGION_MISMATCH') {
        if (isDevelopment) {
          logger.info('Region mismatch detected', {
            code: error.code,
            details: error.details,
            action: 'Displaying error without resetting cart to preserve form state',
          });
        }
        setCartSyncError(`This country is not available for your cart region. Please select a different shipping address.`);
        return false;
      }

      // Handle Inventory Errors
      if (error.code === 'INVENTORY_ERROR') {
        setCartSyncError(`${error.error}: ${error.details}`);
        return false; 
      }

      // Handle completed cart error (from previous checkout)
      // If cart is already completed, we need to create a fresh cart
      if (error.code === 'CART_COMPLETED') {
        logger.warn('Cart already completed, clearing session');
        sessionStorage.removeItem('medusa_cart_id');
        setCartId(undefined);
        // Return false to trigger re-sync with new cart
        return false;
      }

      throw new Error(error.details || error.error);
    }
    
    // Clear previous errors if successful
    setCartSyncError(null);

    // NEW: Sync promo state immediately if return contains cart
    if (updateResult.cart) {
      logger.info('[Checkout] Syncing promo state from update result');
      syncPromoFromCart(updateResult.cart);
    }

    // Always refresh discount from Medusa to get accurate promo data
    // The API cart response may not include full promotion/adjustment data
    logger.info('[Checkout] Triggering discount refresh after cart update...');
    await refreshDiscount(currentRequestId);
    logger.info('[Checkout] Discount refresh completed.');

    if (isDevelopment) {
      logger.info('Step 2 SUCCESS - Cart updated');
    }

    // Mark cart as synced ONLY if update succeeded
    setIsCartSynced(true);
    return true;
  }, [buildUpdatePayload, isDevelopment, logger, refreshDiscount, syncPromoFromCart]);

  // Fetch shipping rates using new RESTful cart endpoints
  const fetchShippingRates = useCallback(async (currentItems: typeof items, address: any, currentTotal: number) => {
    // 1. Cancel previous pending request if exists
    if (abortControllerRef.current) {
        abortControllerRef.current.abort();
    }

    // 2. Create new controller for this request
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const currentRequestId = ++cartUpdateRequestIdRef.current;

    setIsCalculatingShipping(true);

    const cacheKey = generateCartHash(currentItems, address ? {
        country_code: address.address?.country,
        province: address.address?.state,
        postal_code: address.address?.postal_code
    } : undefined, currency, currentTotal);
    
    if (shippingCache.current.has(cacheKey)) {
        const cached = shippingCache.current.get(cacheKey)!;
        setShippingOptions(cached.options);
        if (cached.cartId) setCartId(cached.cartId);
        setIsCalculatingShipping(false);
        return;
    }

    try {
      // Step 1: Create or get cart
      let currentCartId = cartId;
      if (!currentCartId) {
        if (isDevelopment) {
          logger.info('Step 1: Creating cart...');
        }
        const createResponse = await monitoredFetch("/api/carts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            region_id: regionId, // MULTI-REGION: Pass explicit region from LocaleContext
            currency,
            country_code: address?.address?.country,
          }),
          label: 'create-cart',
          signal: controller.signal,
        });

        if (!createResponse.ok) {
          const error = await createResponse.json() as { error: string; details?: string };
          logger.error('Step 1 FAILED - Cart creation', undefined, error as Record<string, unknown>);
          throw new Error(`Cart creation failed: ${error.error}`);
        }

        const { cart_id } = await createResponse.json() as { cart_id: string };
        currentCartId = cart_id;
        setCartId(cart_id);
        setIsCartSynced(false); // Reset sync state for new cart
        if (isDevelopment) {
          logger.info('Step 1 SUCCESS - Cart created', { cart_id });
        }
      }

      // Step 2: Update cart with items and address
      if (currentItems.length > 0 || address || guestEmail) {
        const didSync = await updateCartAndSync(currentCartId, currentItems, address, controller, currentRequestId);
        if (!didSync) {
          return;
        }
      } else {
        // No items to sync, but cart exists - still mark as synced
        setIsCartSynced(true);
      }

      // Step 3: Get shipping options (cacheable GET request)
      if (isDevelopment) {
        logger.info('Step 3: Fetching shipping options...');
      }
      const optionsResponse = await monitoredFetch(`/api/carts/${currentCartId}/shipping-options`, {
        method: "GET",
        label: 'get-shipping-options',
        signal: controller.signal,
      });

      if (!optionsResponse.ok) {
        const error = await optionsResponse.json() as { error: string; details?: string };
        logger.error('Step 3 FAILED - Fetching shipping options', undefined, error as Record<string, unknown>);
        throw new Error(`Shipping options fetch failed: ${error.error}`);
      }

      const { shipping_options } = await optionsResponse.json() as { 
        shipping_options: ShippingOption[];
        cart_id: string;
      };
      
      if (isDevelopment) {
        logger.info('Step 3 SUCCESS', { count: shipping_options.length });
      }

      setShippingOptions(shipping_options);

      // If user has an existing valid selection, keep it
      // Do NOT auto-select - user must explicitly choose shipping method
      if (selectedShipping && shipping_options.length > 0) {
        const found = shipping_options.find(o => o.id === selectedShipping.id);
        if (!found) {
          // Current selection is no longer valid, clear it
          setSelectedShipping(null);
        } else {
            // FORCE UPDATE: Ensure we have the latest price/data even if ID is same
            setSelectedShipping({ ...found });
        }
      }

      // Cache results
      shippingCache.current.set(cacheKey, { options: shipping_options, cartId: currentCartId });

    } catch (error: any) {
      if (error.name === 'AbortError') {
          // Ignore abort errors as they are expected when typing fast
          return;
      }
      logger.error('Shipping rates error', error as Error);
    } finally {
      // Only turn off loading if THIS was the latest request
      // (Though with abort controller, effectively only one finishes)
      if (abortControllerRef.current === controller) {
         setIsCalculatingShipping(false);
      }
    }
  }, [currency, cartId, selectedShipping, handleShippingSelect, guestEmail, updateCartAndSync, regionId]);

  // Effect to trigger shipping fetch when items or address change
  // Uses direct setTimeout architecture for robust debouncing
  useEffect(() => {
    if (items.length === 0) return;

    // specific debounce for address changes
    const timer = setTimeout(() => {
      fetchShippingRates(items, shippingAddress, cartTotal);
    }, 600);

    return () => clearTimeout(timer);
  }, [items, shippingAddress, cartTotal, fetchShippingRates, guestEmail]);

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

  if (cartTotal <= 0) {
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
                    cartTotal={cartTotal}
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
                    discountTotal={totalDiscount}
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
            cartTotal={cartTotal}
            originalTotal={originalTotal}
            selectedShipping={selectedShipping}
            shippingCost={shippingCost}
            finalTotal={finalTotal}
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
            discountTotal={totalDiscount}
            automaticPromotions={automaticPromotions}
          />
        </div>
      </div>
    </div>
  );
}
