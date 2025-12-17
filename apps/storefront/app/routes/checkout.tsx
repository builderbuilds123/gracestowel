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
import { monitoredFetch } from "../utils/monitored-fetch";
import { generateCartHash } from "../utils/cart-hash";
import { debounce } from "../utils/debounce";

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
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [lastTraceId, setLastTraceId] = useState<string | null>(null);

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

  // Track initialization to prevent clientSecret changes
  const isInitialized = useRef(false);
  const sessionTraceId = useRef(generateTraceId());

  // Caching mechanism for shipping rates
  const shippingCache = useRef<Map<string, { options: ShippingOption[], cartId: string | undefined }>>(new Map());

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

  // Single effect for PaymentIntent management (create once, update on changes)
  // Debounced to prevent API thrashing on rapid cart updates
  useEffect(() => {
    if (cartTotal <= 0) return;

    const controller = new AbortController();

    const managePaymentIntent = async () => {
      try {
        setPaymentError(null);

        const requestData = {
          amount: cartTotal,
          currency: currency.toLowerCase(),
          shipping: selectedShipping?.amount ?? 0,
          customerId: isAuthenticated ? customer?.id : undefined,
          customerEmail: isAuthenticated ? customer?.email : undefined,
          cartItems: items.map((item) => ({
            id: item.id,
            variantId: item.variantId,
            sku: item.sku,
            title: item.title,
            price: item.price,
            quantity: item.quantity,
            color: item.color,
          })),
          paymentIntentId: paymentIntentId, // Reuse if exists
        };

        // Log request details for debugging (only in development)
        if (isDevelopment) {
          console.log("[Checkout] Payment intent request:", {
            operation: paymentIntentId ? "update" : "create",
            amount: requestData.amount,
            currency: requestData.currency,
            shipping: requestData.shipping,
            total: requestData.amount + requestData.shipping,
            itemCount: requestData.cartItems.length,
            paymentIntentId,
            traceId: sessionTraceId.current,
          });
        }

        const response = await monitoredFetch("/api/payment-intent", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-trace-id": sessionTraceId.current,
          },
          signal: controller.signal,
          body: JSON.stringify(requestData),
          label: paymentIntentId ? 'update-payment-intent' : 'create-payment-intent',
        });

        if (!response.ok) {
          const error = (await response.json()) as {
            message?: string;
            debugInfo?: string;
            stripeErrorCode?: string;
            traceId?: string;
          };
          
          // Build error message - prefer debugInfo when available as it's more specific
          // If both exist, use debugInfo since it contains actionable details from Stripe
          const errorMessage = error.debugInfo || error.message || "Payment initialization failed";
          
          setPaymentError(errorMessage);
          setLastTraceId(error.traceId || null);
          
          // Log detailed error for debugging (only in development)
          if (isDevelopment) {
            console.error("[Checkout] Payment initialization error:", {
              message: error.message,
              debugInfo: error.debugInfo,
              stripeErrorCode: error.stripeErrorCode,
              traceId: error.traceId,
            });
          }
          return;
        }

        const data = (await response.json()) as {
          clientSecret: string;
          paymentIntentId: string;
          traceId?: string;
        };

        // Log successful response (only in development)
        if (isDevelopment) {
          console.log("[Checkout] Payment intent response:", {
            operation: paymentIntentId ? "updated" : "created",
            paymentIntentId: data.paymentIntentId,
            hasClientSecret: !!data.clientSecret,
            traceId: data.traceId,
            isFirstInitialization: !isInitialized.current,
          });
        }

        // CRITICAL: Only set clientSecret on FIRST call
        // Changing it breaks Stripe Elements
        if (!isInitialized.current) {
          setClientSecret(data.clientSecret);
          isInitialized.current = true;
          if (isDevelopment) {
            console.log("[Checkout] Client secret set for first time");
          }
        }

        // Always update the paymentIntentId
        setPaymentIntentId(data.paymentIntentId);
        if (data.traceId) setLastTraceId(data.traceId);
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          if (isDevelopment) {
            console.error("[Checkout] PaymentIntent error:", {
              error,
              errorMessage: (error as Error).message,
              errorName: (error as Error).name,
              cartTotal,
              currency,
              itemCount: items.length,
              paymentIntentId,
              traceId: sessionTraceId.current,
            });
          }
          setPaymentError("Failed to initialize payment");
        }
      }
    };

    // Debounce: wait 300ms after last change before calling API
    // This prevents API thrashing on rapid cart/shipping updates
    const debounceTimer = setTimeout(managePaymentIntent, 300);

    return () => {
      clearTimeout(debounceTimer);
      controller.abort();
    };
  }, [
    cartTotal,
    currency,
    items,
    selectedShipping,
    isAuthenticated,
    customer?.id,
    customer?.email,
    paymentIntentId,
  ]);

  // Fetch shipping rates using new RESTful cart endpoints
  const fetchShippingRates = useCallback(async (currentItems: typeof items, address: any) => {
    setIsCalculatingShipping(true);

    const cacheKey = generateCartHash(currentItems, address, currency);
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

      if (shipping_options.length > 0) {
        setSelectedShipping(prev => {
          const found = shipping_options.find(o => o.id === prev?.id);
          return found || shipping_options[0];
        });
      }

      // Cache results
      shippingCache.current.set(cacheKey, { options: shipping_options, cartId: currentCartId });

    } catch (error) {
      console.error("[Checkout] Shipping rates error:", error);
    } finally {
      setIsCalculatingShipping(false);
    }
  }, [currency, cartId]);

  // Debounced fetch function
  const debouncedFetchShipping = useCallback(
      debounce((items, address) => fetchShippingRates(items, address), 300),
      [fetchShippingRates]
  );

  // Effect to trigger shipping fetch when items or address change
  useEffect(() => {
    if (items.length > 0) {
        debouncedFetchShipping(items, shippingAddress);
    }
  }, [items, shippingAddress, debouncedFetchShipping]);

  // Handler for address changes from Stripe Address Element
  const handleAddressChange = async (event: StripeAddressElementChangeEvent) => {
    const addressValue = event.value;
    if (!addressValue || !addressValue.address || !addressValue.address.country) {
      return;
    }

    // Only update if address substantially changed (country, state, zip) to avoid rapid re-fetches
    // Or just pass the whole object and let debounce handle it
    setShippingAddress(addressValue);
  };

  const options = {
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
  };

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

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
          {/* Checkout Form */}
          <div className="lg:col-span-7 space-y-8">
            {clientSecret && (
              <Elements options={options} stripe={getStripe()}>
                <div className="bg-white p-6 lg:p-8 rounded-lg shadow-sm border border-card-earthy/20">
                  <CheckoutForm
                    items={items}
                    cartTotal={cartTotal}
                    onAddressChange={handleAddressChange}
                    shippingOptions={shippingOptions}
                    selectedShipping={selectedShipping}
                    setSelectedShipping={setSelectedShipping}
                    isCalculatingShipping={isCalculatingShipping}
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
