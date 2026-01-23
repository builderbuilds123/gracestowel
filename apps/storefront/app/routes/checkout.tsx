import { useEffect } from "react";
import { useLoaderData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { initStripe } from "../lib/stripe";
import { CheckoutContent } from "../components/checkout/CheckoutContent";
import { CheckoutProvider } from "../components/checkout/CheckoutProvider";
import { removeCachedSessionStorage } from "../lib/storage-cache";
import { getGuestToken } from "../utils/guest-session.server";
import { medusaFetch } from "../lib/medusa-fetch";
import type { CloudflareEnv } from "../utils/monitored-fetch";

interface LoaderData {
  stripePublishableKey: string;
  orderPrefillData?: {
    email?: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
    address?: {
      line1?: string;
      line2?: string;
      city?: string;
      state?: string;
      postal_code?: string;
      country?: string;
    };
  };
}

export async function loader({
  request,
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

  // Check for modification token - only prefill if token exists and is valid
  const cookieHeader = request.headers.get("Cookie");
  const orderIdCookie = cookieHeader?.split(";").find(c => c.trim().startsWith("checkout_order_id="));
  const orderId = orderIdCookie ? decodeURIComponent(orderIdCookie.split("=", 2)[1] || "") : null;

  let orderPrefillData: LoaderData['orderPrefillData'] | undefined = undefined;

  if (orderId) {
    // Check if we have a valid modification token
    const { token } = await getGuestToken(request, orderId);
    
    if (token) {
      // Token exists - fetch order data to prefill
      try {
        const env = context.cloudflare.env as unknown as CloudflareEnv;
        const response = await medusaFetch(`/store/orders/${orderId}/guest-view`, {
          method: "GET",
          headers: {
            "x-modification-token": token,
          },
          label: "checkout-order-prefill",
          context,
        });

        if (response.ok) {
          const orderData = await response.json() as { order: any };
          const order = orderData.order;
          
          // Extract shipping address and email from order
          const shippingAddress = order.shipping_address;
          const email = order.email;
          
          if (shippingAddress && email) {
            orderPrefillData = {
              email: email,
              firstName: shippingAddress.first_name,
              lastName: shippingAddress.last_name,
              phone: shippingAddress.phone,
              address: {
                line1: shippingAddress.address_1,
                line2: shippingAddress.address_2,
                city: shippingAddress.city,
                state: shippingAddress.province,
                postal_code: shippingAddress.postal_code,
                country: shippingAddress.country_code?.toUpperCase(),
              },
            };
          }
        }
        // If token is invalid/expired, silently fail - don't prefill
      } catch (error) {
        // Silently fail - don't prefill if there's an error
      }
    }
  }

  return {
    stripePublishableKey: stripeKey || "",
    orderPrefillData,
  };
}

export default function Checkout() {
  const { stripePublishableKey, orderPrefillData } = useLoaderData<LoaderData>();

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
      <CheckoutContent orderPrefillData={orderPrefillData} />
    </CheckoutProvider>
  );
}
