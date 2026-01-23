import type { ActionFunctionArgs } from "react-router";
import { data } from "react-router";
import { setGuestToken } from "../utils/guest-session.server";

/**
 * API endpoint to set guest token cookie server-side
 * Called from checkout success page to store modification token in HttpOnly cookie
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

        // Set HttpOnly cookie using setGuestToken
        const cookieHeader = await setGuestToken(token, orderId);
        
        // Also set orderId in a simple cookie for action to read
        const orderIdCookie = `checkout_order_id=${encodeURIComponent(orderId)}; path=/; max-age=3600; SameSite=Lax${import.meta.env.PROD ? '; Secure' : ''}`;

        return data(
            { success: true },
            {
                headers: {
                    "Set-Cookie": `${cookieHeader}, ${orderIdCookie}`,
                },
            }
        );
    } catch (error) {
        return data({ error: "Failed to set token" }, { status: 500 });
    }
}
