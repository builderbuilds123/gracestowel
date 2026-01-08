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
import { generateTraceId } from "../lib/logger";
import { generateCartHash } from "../utils/cart-hash";
import { useShippingPersistence } from "../hooks/useShippingPersistence";
import { monitoredFetch } from "../utils/monitored-fetch";


// Check if in development mode (consistent with codebase pattern)
const isDevelopment = import.meta.env.MODE === 'development';

interface LoaderData {
  stripePublishableKey: string;
}

export async function loader({
  context,
}: LoaderFunctionArgs): Promise<LoaderData> {
  const env = context.cloudflare.env as { STRIPE_PUBLISHABLE_KEY: string };
  return {
    stripePublishableKey: env.STRIPE_PUBLISHABLE_KEY,
  };
}

export default function Checkout() {
  const { stripePublishableKey } = useLoaderData<LoaderData>();

  // Initialize Stripe with key from loader (runs once)
  useEffect(() => {
    if (stripePublishableKey) {
      initStripe(stripePublishableKey);
    }
  }, [stripePublishableKey]);

  const { items, cartTotal, updateQuantity, removeFromCart } = useCart();
  const { currency } = useLocale(); // Verify currency is obtained here
  const { customer, isAuthenticated } = useCustomer();

  // Payment state
  const [clientSecret, setClientSecret] = useState("");
  const [paymentCollectionId, setPaymentCollectionId] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [lastTraceId, setLastTraceId] = useState<string | null>(null);
  const [guestEmail, setGuestEmail] = useState<string | undefined>(undefined);

  // Track initialization to prevent clientSecret changes after first set
  const isInitialized = useRef(false);
  const sessionTraceId = useRef(generateTraceId());

  // Caching mechanism for shipping rates
  const shippingCache = useRef<Map<string, { options: ShippingOption[], cartId: string | undefined }>>(new Map());

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

  // SHP-01: Shipping persistence hook
  const { 
    isShippingPersisted, 
    setIsShippingPersisted,
    shippingPersistError, 
    setShippingPersistError,
    persistShippingOption 
  } = useShippingPersistence(cartId, sessionTraceId.current);

  /**
   * SHP-01: Handle shipping selection validation and persistence
   */
  const handleShippingSelect = useCallback(async (option: ShippingOption) => {
    // Update local state immediately for responsive UI
    setSelectedShipping(option);
    
    // Delegate persistence to hook
    await persistShippingOption(option);
  }, [persistShippingOption]);

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
  const finalTotal = cartTotal + shippingCost;

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

  // PaymentIntent management: Create once, update on changes
  // CRITICAL: Wait for isCartSynced to ensure cart items exist in Medusa before fetching totals
  // Payment Collection & Session Management (Medusa v2)
  useEffect(() => {
    if (cartTotal <= 0) return;
    if (!cartId) return; // Wait for cart to be created
    if (!isCartSynced) return; // Wait for cart items to be synced to Medusa

    const controller = new AbortController();

    const managePayment = async () => {
      try {
        setPaymentError(null);

        // Step 1: Initialize Payment Collection if needed
        let currentCollectionId = paymentCollectionId;
        if (!currentCollectionId) {
            if (isDevelopment) console.log("[Checkout] Creating Payment Collection...");
            const colRes = await monitoredFetch("/api/payment-collections", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ cartId }),
                signal: controller.signal,
                label: "create-payment-collection",
            });

            if (!colRes.ok) {
                 const error = await colRes.json();
                 console.error("Payment Collection Error:", error);
                 throw new Error("Failed to initialize payment collection");
            }
            
            const colData = await colRes.json() as { payment_collection: { id: string } };
            currentCollectionId = colData.payment_collection.id;
            setPaymentCollectionId(currentCollectionId);
        }

        // Step 2: Create/Sync Payment Session
        // This ensures the Stripe PaymentIntent is created/updated with the correct amount from the cart
        if (isDevelopment) console.log("[Checkout] Creating/Syncing Payment Session...");
        
        const sessionRes = await monitoredFetch(`/api/payment-collections/${currentCollectionId}/sessions`, {
            method: "POST",
             headers: { "Content-Type": "application/json" },
             body: JSON.stringify({ provider_id: "pp_stripe" }),
             signal: controller.signal,
             label: "create-payment-session"
        });

        if (!sessionRes.ok) {
            const error = await sessionRes.json();
            console.error("Payment Session Error:", error);
            throw new Error("Failed to create payment session");
        }

        const sessionData = await sessionRes.json() as { 
            payment_collection?: { 
                payment_sessions?: Array<{ 
                    id: string, 
                    provider_id: string, 
                    data?: { 
                        client_secret?: string;
                        id?: string;
                        [key: string]: unknown;
                    } 
                }> 
            } 
        };
        // Extract client_secret from the stripe session
        // Structure: payment_collection.payment_sessions[{ provider_id: 'pp_stripe', data: { client_secret } }]
        // Note: data.id is the PaymentIntent ID from Stripe, not the session ID
        const sessions = sessionData.payment_collection?.payment_sessions;

        if (!sessions || sessions.length === 0) {
            throw new Error("No payment sessions found in response");
        }

        const stripeSession = sessions.find(s => s.provider_id === 'pp_stripe');
        
        if (!stripeSession) {
            throw new Error("Stripe payment session not found in response");
        }
        
        if (!stripeSession.data?.client_secret) {
            throw new Error("Client secret not found in payment session data");
        }
        
        if (!isInitialized.current) {
            setClientSecret(stripeSession.data.client_secret);
            isInitialized.current = true;
        }
        
        // data.id is the PaymentIntent ID from Stripe (not the session ID)
        if (stripeSession.data.id) {
            setPaymentIntentId(stripeSession.data.id);
        }

      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          if (isDevelopment) {
            console.error("[Checkout] Payment Error:", error);
          }
          setPaymentError("Failed to initialize payment. Please try refreshing the page.");
        }
      }
    };

    // Debounce to prevent API thrashing
    const debounceTimer = setTimeout(managePayment, 300);

    return () => {
      clearTimeout(debounceTimer);
      controller.abort();
    };
  }, [
    cartTotal,
    cartId,
    isCartSynced,
    paymentCollectionId, // Dependency to continue flow after Step 1
    selectedShipping?.id, // Re-sync on shipping change
    selectedShipping?.amount,
    currency
  ]);

  // Fetch shipping rates using new RESTful cart endpoints
  const fetchShippingRates = useCallback(async (currentItems: typeof items, address: any, currentTotal: number) => {
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
          console.log('[Checkout] Step 1: Creating cart...');
        }
        const createResponse = await monitoredFetch("/api/carts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            currency,
            country_code: address?.address?.country,
          }),
          label: 'create-cart',
        });

        if (!createResponse.ok) {
          const error = await createResponse.json() as { error: string; details?: string };
          console.error('[Checkout] Step 1 FAILED - Cart creation:', error);
          throw new Error(`Cart creation failed: ${error.error}`);
        }

        const { cart_id } = await createResponse.json() as { cart_id: string };
        currentCartId = cart_id;
        setCartId(cart_id);
        setIsCartSynced(false); // Reset sync state for new cart
        if (isDevelopment) {
          console.log('[Checkout] Step 1 SUCCESS - Cart created:', cart_id);
        }
      }

      // Step 2: Update cart with items and address
      if (currentItems.length > 0 || address) {
        if (isDevelopment) {
          console.log('[Checkout] Step 2: Updating cart items/address...');
        }
        const updateResponse = await monitoredFetch(`/api/carts/${currentCartId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: currentItems,
            shipping_address: address ? {
              first_name: address.firstName || '',
              last_name: address.lastName || '',
              address_1: address.address?.line1 || '',
              address_2: address.address?.line2,
              city: address.address?.city || '',
              country_code: address.address?.country || '',
              postal_code: address.address?.postal_code || '',
              province: address.address?.state,
              phone: address.phone,
            } : undefined,
          }),
          label: 'update-cart',
        });

        if (!updateResponse.ok) {
          const error = await updateResponse.json() as { error: string; details?: string; code?: string };
          console.error('[Checkout] Step 2 FAILED - Cart update:', error);
          
          // Handle region mismatch - need to create new cart
          if (error.code === 'REGION_MISMATCH') {
            console.log('[Checkout] Region mismatch detected, creating new cart...');
            setCartId(undefined);
            // Retry with new cart on next call
            throw new Error(`Region mismatch: ${error.details}`);
          }
          throw new Error(`Cart update failed: ${error.error}`);
        }
        if (isDevelopment) {
          console.log('[Checkout] Step 2 SUCCESS - Cart updated');
        }
        // Mark cart as synced ONLY if update succeeded
        setIsCartSynced(true);
      } else {
        // No items to sync, but cart exists - still mark as synced
        setIsCartSynced(true);
      }

      // Step 3: Get shipping options (cacheable GET request)
      if (isDevelopment) {
        console.log('[Checkout] Step 3: Fetching shipping options...');
      }
      const optionsResponse = await monitoredFetch(`/api/carts/${currentCartId}/shipping-options`, {
        method: "GET",
        label: 'get-shipping-options',
      });

      if (!optionsResponse.ok) {
        const error = await optionsResponse.json() as { error: string; details?: string };
        console.error('[Checkout] Step 3 FAILED - Fetching shipping options:', error);
        throw new Error(`Shipping options fetch failed: ${error.error}`);
      }

      const { shipping_options } = await optionsResponse.json() as { 
        shipping_options: ShippingOption[];
        cart_id: string;
      };
      
      if (isDevelopment) {
        console.log('[Checkout] Step 3 SUCCESS - Got', shipping_options.length, 'shipping options');
      }

      setShippingOptions(shipping_options);

      // If user has an existing valid selection, keep it
      // Do NOT auto-select - user must explicitly choose shipping method
      if (selectedShipping && shipping_options.length > 0) {
        const found = shipping_options.find(o => o.id === selectedShipping.id);
        if (!found) {
          // Current selection is no longer valid, clear it
          setSelectedShipping(null);
        }
      }

      // Cache results
      shippingCache.current.set(cacheKey, { options: shipping_options, cartId: currentCartId });

    } catch (error) {
      console.error("[Checkout] Shipping rates error:", error);
    } finally {
      setIsCalculatingShipping(false);
    }
  }, [currency, cartId, selectedShipping, handleShippingSelect]);

  // Effect to trigger shipping fetch when items or address change
  // Uses direct setTimeout architecture for robust debouncing
  useEffect(() => {
    if (items.length === 0) return;

    // specific debounce for address changes
    const timer = setTimeout(() => {
      fetchShippingRates(items, shippingAddress, cartTotal);
    }, 600);

    return () => clearTimeout(timer);
  }, [items, shippingAddress, cartTotal, fetchShippingRates]);

  // Handler for address changes from Stripe Address Element
  const handleAddressChange = async (event: StripeAddressElementChangeEvent) => {
    // Only update and fetch rates if the address is fully complete
    // This effectively defers the API call until the form is filled, similar to 'onBlur'
    if (!event.complete) {
      return;
    }

    const addressValue = event.value;
    setShippingAddress(addressValue);
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
        {paymentError && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-6">
            <p>{paymentError}</p>
            {lastTraceId && (
              <p className="text-xs mt-2 text-red-500">
                Reference: {lastTraceId}
              </p>
            )}
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
              <Elements options={options} stripe={getStripe()} key={clientSecret}>
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
                    isShippingPersisted={isShippingPersisted || !selectedShipping}
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
          />
        </div>
      </div>
    </div>
  );
}
