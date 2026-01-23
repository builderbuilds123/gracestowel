import { useEffect } from "react";
import { useLoaderData, redirect } from "react-router";
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
  editMode?: boolean;
  orderId?: string;
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
    shippingMethodId?: string;
  };
}

/**
 * Story 3.3: Checkout Edit Mode Loader
 * 
 * Supports:
 * - Normal checkout (no orderId)
 * - Edit mode (orderId query param) - requires auth and eligibility check
 */
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

  // Story 3.3: Check for orderId in query params (edit mode)
  const url = new URL(request.url);
  const orderId = url.searchParams.get("orderId");

  // Base loader data
  const baseData: LoaderData = {
    stripePublishableKey: stripeKey || "",
    editMode: false,
  };

  if (!orderId) {
    return baseData;
  }

  // Edit mode - fetch and verify order
  const env = context.cloudflare.env as unknown as CloudflareEnv;
  
  // Build auth headers (customer session or guest token)
  const authHeaders: HeadersInit = {};
  
  // Check for customer session (Authorization header from cookie)
  const authHeader = request.headers.get("Authorization");
  const customerToken = authHeader?.startsWith("Bearer ") 
      ? authHeader.slice(7) 
      : null;

  // Check for guest token
  const { token: guestToken } = await getGuestToken(request, orderId);

  if (customerToken) {
      authHeaders["Authorization"] = `Bearer ${customerToken}`;
  } else if (guestToken) {
      authHeaders["x-modification-token"] = guestToken;
  } else {
      // No auth - redirect to order status
      return redirect(`/order/status/${orderId}?error=UNAUTHORIZED`);
  }

  // Fetch order
  const orderResponse = await medusaFetch(`/store/orders/${orderId}`, {
      method: "GET",
      headers: authHeaders,
      label: "checkout-order-fetch",
      context,
  });

  if (!orderResponse.ok) {
      if (orderResponse.status === 401 || orderResponse.status === 403) {
          return redirect(`/order/status/${orderId}?error=UNAUTHORIZED`);
      }
      return redirect(`/order/status/${orderId}?error=ORDER_NOT_FOUND`);
  }

  const { order } = await orderResponse.json() as { order: any };

  // Check eligibility
  const eligibilityResponse = await medusaFetch(
      `/store/orders/${orderId}/eligibility`,
      {
          method: "GET",
          headers: authHeaders,
          label: "checkout-eligibility-check",
          context,
      }
  );

  if (!eligibilityResponse.ok) {
      return redirect(`/order/status/${orderId}?error=ELIGIBILITY_CHECK_FAILED`);
  }

  const { eligible, errorCode } = await eligibilityResponse.json() as { eligible: boolean; errorCode?: string };

  if (!eligible) {
      return redirect(`/order/status/${orderId}?error=${errorCode || "EDIT_NOT_ALLOWED"}`);
  }

  // Extract prefill data
  const shippingAddress = order.shipping_address;
  const shippingMethods = order.shipping_methods || [];
  const shippingMethodId = shippingMethods[0]?.shipping_option_id;

  return {
      ...baseData,
      editMode: true,
      orderId,
      orderPrefillData: {
          email: order.email, // Display only
          firstName: shippingAddress?.first_name,
          lastName: shippingAddress?.last_name,
          phone: shippingAddress?.phone,
          address: shippingAddress ? {
              line1: shippingAddress.address_1,
              line2: shippingAddress.address_2,
              city: shippingAddress.city,
              state: shippingAddress.province,
              postal_code: shippingAddress.postal_code,
              country: shippingAddress.country_code?.toUpperCase(),
          } : undefined,
          shippingMethodId,
      },
  };
}

export default function Checkout() {
  const { stripePublishableKey, orderPrefillData, editMode, orderId } = useLoaderData<LoaderData>();

  // Initialize Stripe once
  useEffect(() => {
    if (stripePublishableKey && !editMode) {
      // Only initialize Stripe for new orders (not edit mode)
      initStripe(stripePublishableKey);
    }
    
    // Issue #41: Use cached sessionStorage for consistency
    if (typeof window !== 'undefined') {
      try {
        removeCachedSessionStorage('verifiedOrder');
        removeCachedSessionStorage('lastOrder');
      } catch (e) {}
    }
  }, [stripePublishableKey, editMode]);

  return (
    <CheckoutProvider>
      <CheckoutContent 
        orderPrefillData={orderPrefillData} 
        editMode={editMode}
        orderId={orderId}
      />
    </CheckoutProvider>
  );
}
