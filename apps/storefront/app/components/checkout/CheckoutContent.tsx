import { useRef, useEffect, useCallback, useMemo, lazy, Suspense } from "react";
import { Link } from "react-router";
import { ArrowLeft } from "../../lib/icons";
import { useCheckout } from "./CheckoutProvider";
import { useLocale } from "../../context/LocaleContext";
import { useCustomer } from "../../context/CustomerContext";
import { Elements } from "@stripe/react-stripe-js";
import { getStripe } from "../../lib/stripe";
// OPTIMIZATION (Issue #3): Lazy load CheckoutForm (heavy Stripe integration, ~45-60KB)
// React Router v7: Use React.lazy() (not next/dynamic)
const CheckoutForm = lazy(() => import("../CheckoutForm").then(m => ({ default: m.CheckoutForm })));
import type { ShippingOption } from "../../types/checkout";
import { OrderSummary } from "../OrderSummary";
import type { StripeAddressElementChangeEvent } from "@stripe/stripe-js";
import type { CartItem as ProductCartItem } from "../../types/product";
import type { CustomerData } from "../CheckoutForm";

interface CheckoutContentProps {
  orderPrefillData?: CustomerData;
  editMode?: boolean;
  orderId?: string;
}

export function CheckoutContent({ 
  orderPrefillData, 
  editMode = false,
  orderId,
}: CheckoutContentProps = {} as CheckoutContentProps) {
  const {
    state,
    actions,
    items,
    displayCartTotal,
    displayDiscountTotal,
    displayShippingCost,
    displayFinalTotal,
    originalTotal,
    isLoaded,
    cartSyncError,
    paymentError,
    shippingPersistError,
    cartId,
    isCalculatingShipping,
    paymentCollectionId,
    clientSecret,
    appliedPromoCodes,
    isPromoLoading,
    promoError,
    promoSuccessMessage,
    automaticPromotions,
    persistShippingOption,
    applyPromoCode,
    removePromoCode,
    updateQuantity,
    removeFromCart,
    isShippingPersisted
  } = useCheckout();

  const { currency } = useLocale();
  const { customer, isAuthenticated } = useCustomer();
  const { shippingOptions, selectedShippingOption: selectedShipping, shippingAddress, email: guestEmail } = state;

  const hasFiredCheckoutStarted = useRef(false);

  useEffect(() => {
    if (displayCartTotal > 0 && typeof window !== "undefined" && !hasFiredCheckoutStarted.current) {
      import("../../utils/posthog").then(({ default: posthog }) => {
        posthog.capture("checkout_started", {
          cart_total: displayCartTotal,
          item_count: items.length,
          currency,
          items: items.map((item: ProductCartItem) => ({
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

  const handleShippingSelect = useCallback((option: ShippingOption) => {
    actions.selectShippingOption(option);
  }, [actions]);

  const handleAddressChange = useCallback(async (event: StripeAddressElementChangeEvent) => {
    if (!event.complete || !event.value.address) return;
    const addr = event.value;
    let firstName = '';
    let lastName = '';
    if (addr.name) {
      const parts = addr.name.trim().split(' ');
      firstName = parts[0] || '';
      lastName = parts.length > 1 ? parts.slice(1).join(' ') : '';
    }
    actions.setAddress({
      ...addr,
      firstName,
      lastName,
      address: {
        line1: addr.address.line1 || '',
        line2: addr.address.line2 || undefined,
        city: addr.address.city || '',
        state: addr.address.state || '',
        postal_code: addr.address.postal_code || '',
        country: addr.address.country || '',
      },
      phone: addr.phone || undefined
    });
  }, [actions]);

  const handleEmailChange = useCallback((email: string) => {
    actions.setEmail(email);
  }, [actions]);

  // Only prefill if and only if modification token exists and is valid
  // Do not prefill from authenticated customer data - only from order modification
  const customerDataMemo = useMemo(() => {
    // Only prefill when order modification token exists and is valid
    // This ensures fields are only prefilled during order editing, not normal checkout
    return orderPrefillData || undefined;
  }, [orderPrefillData]);

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
        ".Tab": { border: "1px solid #D4D8C4", boxShadow: "none", backgroundColor: "#FCFAF8" },
        ".Tab:hover": { borderColor: "#8A6E59" },
        ".Tab--selected": { borderColor: "#8A6E59", backgroundColor: "#ffffff", color: "#8A6E59", boxShadow: "0 0 0 1px #8A6E59" },
        ".Input": { border: "1px solid #D4D8C4", boxShadow: "none" },
        ".Input:focus": { border: "1px solid #8A6E59", boxShadow: "0 0 0 1px #8A6E59" },
        ".Label": { color: "#3C3632", fontWeight: "500", marginBottom: "8px" },
      },
    },
    fonts: [{ cssSrc: "https://fonts.googleapis.com/css2?family=Alegreya:ital,wght@0,400;0,500;0,700;1,400&display=swap" }],
  } : null;

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
          <h2 className="text-2xl font-serif text-text-earthy mb-4">Your towel rack is empty</h2>
          <Link to="/" className="text-accent-earthy hover:underline">Return to Store</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-background-earthy min-h-screen pt-20 pb-12">
      <div className="container mx-auto px-4">
        <div className="mb-8">
          <Link to="/towels" className="inline-flex items-center text-text-earthy hover:text-accent-earthy transition-colors">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Return to Towels
          </Link>
        </div>

        {cartSyncError ? (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-6">
            <p className="font-bold">Items Unavailable</p>
            <p>{cartSyncError}</p>
          </div>
        ) : null}

        {paymentError ? (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-6">
            <p>{paymentError}</p>
          </div>
        ) : null}

        {shippingPersistError ? (
          <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded mb-6">
            <p className="font-medium">⚠️ Warning</p>
            <p className="text-sm mt-1">{shippingPersistError}</p>
          </div>
        ) : null}

        {/* Story 3.3: Edit Mode Banner */}
        {editMode && (
          <div className="bg-blue-50 border border-blue-200 p-4 mb-6 rounded-lg">
            <h2 className="font-medium text-blue-800">Editing Order</h2>
            <p className="text-sm text-blue-700 mt-1">
              Update your shipping details below. Contact and payment cannot be changed.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
          <div className="lg:col-span-7 space-y-8">
            {clientSecret && options ? (
              <Elements options={options} stripe={getStripe()} key={paymentCollectionId}>
                <div className="bg-white p-6 lg:p-8 rounded-lg shadow-sm border border-card-earthy/20">
                  {/* Lazy loaded CheckoutForm with Suspense fallback */}
                  <Suspense fallback={
                    <div className="animate-pulse space-y-4">
                      <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                      <div className="h-10 bg-gray-200 rounded"></div>
                      <div className="h-4 bg-gray-200 rounded w-1/4 mt-6"></div>
                      <div className="h-10 bg-gray-200 rounded"></div>
                      <div className="h-10 bg-gray-200 rounded"></div>
                      <div className="h-4 bg-gray-200 rounded w-1/4 mt-6"></div>
                      <div className="h-10 bg-gray-200 rounded"></div>
                    </div>
                  }>
                    <CheckoutForm
                      onAddressChange={handleAddressChange}
                      onEmailChange={handleEmailChange}
                      customerData={customerDataMemo}
                      editMode={editMode}
                      orderId={orderId}
                    />
                  </Suspense>
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

          <OrderSummary />
        </div>
      </div>
    </div>
  );
}
