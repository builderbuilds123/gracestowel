import type { ActionFunctionArgs } from "react-router";
import { data } from "react-router";
import { setGuestToken } from "../utils/guest-session.server";

/**
 * API endpoint to set guest token cookie server-side
 * Called from checkout success page to store modification token in HttpOnly cookie
 *
 * Sets cookies for both:
 * - /order/status/{orderId} - for order status page
 * - /checkout/success - for checkout success page cancel action
 */
export async function action({ request, context }: ActionFunctionArgs) {
    if (request.method !== "POST") {
        return data({ error: "Method not allowed" }, { status: 405 });
    }

    try {
        const body = await request.json() as { token: string; orderId: string };
        const { token, orderId } = body;

        if (!token || !orderId) {
            return data({ error: "Token and orderId are required" }, { status: 400 });
        }

        // Set HttpOnly cookie for order status page
        const orderStatusCookie = await setGuestToken(token, orderId);

        // Set HttpOnly cookie for checkout edit mode with root path
        // BUG FIX: Changed from path=/checkout to path=/ and SameSite=Strict to SameSite=Lax
        // React Router v7 client-side navigation requires cookies to be accessible from root
        // SameSite=Lax allows cookies on top-level navigations which is needed for edit flow
        const isProd = import.meta.env.PROD;
        const checkoutSuccessCookie = `checkout_mod_token=${encodeURIComponent(token)}; path=/; max-age=3600; HttpOnly; SameSite=Lax${isProd ? '; Secure' : ''}`;

        // Also set orderId in a simple cookie for action to read
        const orderIdCookie = `checkout_order_id=${encodeURIComponent(orderId)}; path=/; max-age=3600; SameSite=Lax${isProd ? '; Secure' : ''}`;

        // Set multiple cookies by using array in headers
        const headers = new Headers();
        headers.append("Set-Cookie", orderStatusCookie);
        headers.append("Set-Cookie", checkoutSuccessCookie);
        headers.append("Set-Cookie", orderIdCookie);

        return data(
            { success: true },
            { headers }
        );
    } catch (error) {
        return data({ error: "Failed to set token" }, { status: 500 });
    }
}
