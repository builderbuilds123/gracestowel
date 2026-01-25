import { useEffect, useState } from "react";
import { useLoaderData, useSearchParams } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { initStripe } from "../lib/stripe";
import { CheckoutContent } from "../components/checkout/CheckoutContent";
import { CheckoutProvider } from "../components/checkout/CheckoutProvider";
import { removeCachedSessionStorage } from "../lib/storage-cache";
import { XCircle } from "../lib/icons";

interface LoaderData {
  stripePublishableKey: string;
}

/**
 * Error messages for checkout redirect errors
 */
const ERROR_MESSAGES: Record<string, { title: string; message: string }> = {
  PAYMENT_FAILED: {
    title: "Payment Failed",
    message: "Your payment could not be processed. Please check your payment details and try again.",
  },
  ORDER_PROCESSING: {
    title: "Order Processing",
    message: "Your order is still being processed. Please wait a few moments and check your email for confirmation.",
  },
};

/**
 * Checkout Page Loader
 *
 * Provides Stripe publishable key for payment processing.
 *
 * Note: Order editing is now handled by the dedicated /order/{id}/edit route.
 * This route is for new checkouts only.
 */
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
  const [searchParams, setSearchParams] = useSearchParams();
  const [errorBanner, setErrorBanner] = useState<{ title: string; message: string } | null>(null);

  // Handle error query parameter
  useEffect(() => {
    const errorCode = searchParams.get("error");
    if (errorCode && ERROR_MESSAGES[errorCode]) {
      setErrorBanner(ERROR_MESSAGES[errorCode]);
      // Remove error param from URL without triggering navigation
      const newParams = new URLSearchParams(searchParams);
      newParams.delete("error");
      setSearchParams(newParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Initialize Stripe once
  useEffect(() => {
    if (stripePublishableKey) {
      initStripe(stripePublishableKey);
    }

    // Issue #41: Use cached sessionStorage for consistency
    if (typeof window !== 'undefined') {
      try {
        removeCachedSessionStorage('verifiedOrder');
        removeCachedSessionStorage('lastOrder');
      } catch (e) {}
    }
  }, [stripePublishableKey]);

  const dismissError = () => {
    setErrorBanner(null);
  };

  return (
    <CheckoutProvider>
      {/* Payment Error Banner */}
      {errorBanner && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-red-600 text-white shadow-lg">
          <div className="container mx-auto px-4 py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <XCircle className="w-6 h-6 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">{errorBanner.title}</p>
                  <p className="text-sm text-red-100 mt-1">{errorBanner.message}</p>
                </div>
              </div>
              <button
                onClick={dismissError}
                className="text-white/80 hover:text-white transition-colors"
                aria-label="Dismiss error"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
      <CheckoutContent />
    </CheckoutProvider>
  );
}
