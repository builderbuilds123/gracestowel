import type { ActionFunctionArgs } from "react-router";
import { data } from "react-router";
import { setGuestToken } from "../utils/guest-session.server";
import { createLogger } from "../lib/logger";

/**
 * API endpoint to set guest token cookie server-side
 * Called from checkout success page to store modification token in HttpOnly cookie
 *
 * Sets guest_order_{orderId} cookie with path=/order for:
 * - /order/status/{id} - Order status page
 * - /order/{id}/edit - Order edit page
 */
export async function action({ request, context }: ActionFunctionArgs) {
    const logger = createLogger({ context: "api.set-guest-token" });

    if (request.method !== "POST") {
        return data({ error: "Method not allowed" }, { status: 405 });
    }

    try {
        const body = await request.json() as { token: string; orderId: string };
        const { token, orderId } = body;

        logger.info("[SET-GUEST-TOKEN] Received request", {
            orderId,
            hasToken: !!token,
            tokenLength: token?.length,
            tokenPrefix: token?.substring(0, 50),
            tokenSuffix: token?.substring(token?.length - 20),
        });

        if (!token || !orderId) {
            logger.warn("[SET-GUEST-TOKEN] Missing token or orderId");
            return data({ error: "Token and orderId are required" }, { status: 400 });
        }

        // Set HttpOnly cookie for order routes (status, edit)
        // Cookie uses path=/order and SameSite=strict for security
        const guestOrderCookie = await setGuestToken(token, orderId);

        logger.info("[SET-GUEST-TOKEN] Cookie generated", {
            orderId,
            cookieLength: guestOrderCookie.length,
            cookiePreview: guestOrderCookie.substring(0, 100) + "...",
        });

        return data(
            { success: true },
            { headers: { "Set-Cookie": guestOrderCookie } }
        );
    } catch (error) {
        logger.error("[SET-GUEST-TOKEN] Error", error instanceof Error ? error : new Error(String(error)));
        return data({ error: "Failed to set token" }, { status: 500 });
    }
}
