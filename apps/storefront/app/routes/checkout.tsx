import { useEffect } from "react";
import { useLoaderData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { initStripe } from "../lib/stripe";
import { CheckoutContent } from "../components/checkout/CheckoutContent";
import { CheckoutProvider } from "../components/checkout/CheckoutProvider";
import { removeCachedSessionStorage } from "../lib/storage-cache";

interface LoaderData {
  stripePublishableKey: string;
}

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

  return (
    <CheckoutProvider>
      <CheckoutContent />
    </CheckoutProvider>
  );
}
