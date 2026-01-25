import { redirect } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { getStripeServerSide } from "../lib/stripe.server";
import { medusaFetch } from "../lib/medusa-fetch";
import { monitoredFetch } from "../utils/monitored-fetch";
import { createLogger } from "../lib/logger";
import { setGuestToken } from "../utils/guest-session.server";
import { CHECKOUT_CONSTANTS } from "../constants/checkout";
import type { CloudflareEnv } from "../utils/monitored-fetch";

/**
 * Checkout Success - Loader-only Redirect Handler
 *
 * This route handles the return from Stripe payment:
 * 1. Validates payment status with Stripe
 * 2. Completes the cart in Medusa
 * 3. Sets guest token cookie for order access
 * 4. Clears cart cookie
 * 5. Redirects to order status page
 *
 * On failure, redirects to /checkout with error parameter.
 */

const CHECKOUT_PARAMS_COOKIE = "checkout_params";

type PaymentParams = {
    paymentIntentId: string | null;
    paymentIntentClientSecret: string | null;
    redirectStatus: string | null;
};

/**
 * SEC-06: SameSite=Lax required for cross-site redirect flow
 * When Stripe redirects back to our site after payment, browsers treat this as a
 * cross-site navigation. SameSite=Strict would prevent the cookie from being sent.
 */
const serializeParamsCookie = (params: PaymentParams, maxAge: number): string =>
    `${CHECKOUT_PARAMS_COOKIE}=${encodeURIComponent(JSON.stringify(params))}; Max-Age=${maxAge}; Path=/; SameSite=Lax; Secure; HttpOnly`;

const clearParamsCookie = (): string =>
    `${CHECKOUT_PARAMS_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax; Secure; HttpOnly`;

const parseParamsFromCookie = (cookieHeader: string | null): PaymentParams | null => {
    if (!cookieHeader) return null;
    const cookie = cookieHeader
        .split(";")
        .map((c) => c.trim())
        .find((c) => c.startsWith(`${CHECKOUT_PARAMS_COOKIE}=`));
    if (!cookie) return null;
    try {
        const value = decodeURIComponent(cookie.split("=", 2)[1] ?? "");
        return JSON.parse(value) as PaymentParams;
    } catch {
        return null;
    }
};

/**
 * Get cart ID from cookie
 */
const getCartIdFromCookie = (cookieHeader: string | null): string | null => {
    if (!cookieHeader) return null;
    const cookie = cookieHeader
        .split(";")
        .map((c) => c.trim())
        .find((c) => c.startsWith("medusa_cart_id="));
    if (!cookie) return null;
    return cookie.split("=", 2)[1] || null;
};

/**
 * Clear cart cookie
 */
const clearCartCookie = (): string =>
    "medusa_cart_id=; Max-Age=0; Path=/; SameSite=Lax; HttpOnly";

/**
 * Fetch order from Medusa by payment intent ID with retry logic
 */
async function fetchOrderByPaymentIntent(
    paymentIntentId: string,
    context: LoaderFunctionArgs["context"],
    logger: ReturnType<typeof createLogger>
): Promise<{ orderId: string; modificationToken?: string } | null> {
    const maxRetries = CHECKOUT_CONSTANTS.ORDER_FETCH_MAX_RETRIES;
    const retryDelay = CHECKOUT_CONSTANTS.ORDER_FETCH_RETRY_DELAY_MS;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const response = await medusaFetch(
                `/store/orders/by-payment-intent?payment_intent_id=${encodeURIComponent(paymentIntentId)}`,
                {
                    method: "GET",
                    headers: {
                        "x-modification-token": "request-new",
                    },
                    label: "fetch-order-by-payment-intent",
                    context,
                }
            );

            if (response.ok) {
                const data = await response.json() as {
                    order: { id: string };
                    modification_token?: string;
                };
                logger.info("Order fetched successfully", {
                    orderId: data.order.id,
                    hasToken: !!data.modification_token,
                    attempt,
                });
                return {
                    orderId: data.order.id,
                    modificationToken: data.modification_token,
                };
            }

            if (response.status === 404 && attempt < maxRetries) {
                // Order not yet created (webhook may still be processing)
                logger.info("Order not found, retrying...", { attempt, maxRetries });
                await new Promise((resolve) => setTimeout(resolve, retryDelay));
                continue;
            }

            // Other error or max retries reached
            logger.warn("Failed to fetch order", {
                status: response.status,
                attempt,
                maxRetries,
            });
            return null;
        } catch (error) {
            logger.error("Error fetching order", error instanceof Error ? error : new Error(String(error)), {
                attempt,
            });
            if (attempt < maxRetries) {
                await new Promise((resolve) => setTimeout(resolve, retryDelay));
            }
        }
    }

    return null;
}

/**
 * Complete cart in Medusa
 */
async function completeCart(
    cartId: string,
    context: LoaderFunctionArgs["context"],
    logger: ReturnType<typeof createLogger>
): Promise<boolean> {
    try {
        const env = context.cloudflare.env as CloudflareEnv;
        const medusaBackendUrl = env.MEDUSA_BACKEND_URL || "http://localhost:9000";
        const medusaPublishableKey = env.MEDUSA_PUBLISHABLE_KEY;

        const response = await monitoredFetch(`${medusaBackendUrl}/store/carts/${cartId}/complete`, {
            method: "POST",
            headers: {
                "x-publishable-api-key": medusaPublishableKey || "",
                "Content-Type": "application/json",
            },
            label: "medusa-cart-complete",
            cloudflareEnv: env,
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({})) as { message?: string };
            logger.warn("Cart completion failed", {
                status: response.status,
                message: errorData.message,
            });
            // Non-critical: webhook should eventually create order
            return false;
        }

        logger.info("Cart completed successfully", { cartId });
        return true;
    } catch (error) {
        logger.error("Error completing cart", error instanceof Error ? error : new Error(String(error)));
        return false;
    }
}

export async function loader({ request, context }: LoaderFunctionArgs) {
    const logger = createLogger({ context: "checkout.success" });
    const env = context.cloudflare.env as CloudflareEnv;

    const url = new URL(request.url);
    const cookieHeader = request.headers.get("cookie");

    // Step 1: Handle Stripe redirect - strip sensitive params from URL
    const paramsFromUrl: PaymentParams = {
        paymentIntentId: url.searchParams.get("payment_intent"),
        paymentIntentClientSecret: url.searchParams.get("payment_intent_client_secret"),
        redirectStatus: url.searchParams.get("redirect_status"),
    };

    // If sensitive params are in URL, store in cookie and redirect to clean URL
    if (paramsFromUrl.paymentIntentClientSecret) {
        const headers = new Headers();
        headers.set("Set-Cookie", serializeParamsCookie(paramsFromUrl, CHECKOUT_CONSTANTS.CHECKOUT_PARAMS_MAX_AGE_SECONDS));
        return redirect(url.pathname, { headers });
    }

    // Step 2: Get payment params from cookie
    const params = parseParamsFromCookie(cookieHeader);
    if (!params?.paymentIntentClientSecret || !params?.paymentIntentId) {
        logger.warn("No payment params found");
        return redirect("/checkout?error=PAYMENT_FAILED");
    }

    // Step 3: Validate payment with Stripe
    try {
        const stripe = getStripeServerSide(env.STRIPE_SECRET_KEY);
        const paymentIntent = await stripe.paymentIntents.retrieve(params.paymentIntentId);

        // Check redirect status first
        if (params.redirectStatus === "failed") {
            logger.error("Payment redirect marked as failed", new Error("Stripe redirect failure"), {
                status: paymentIntent.status,
            });
            return redirect("/checkout?error=PAYMENT_FAILED", {
                headers: { "Set-Cookie": clearParamsCookie() },
            });
        }

        // Valid statuses for manual capture mode
        const validStatuses = ["succeeded", "requires_capture"];
        if (!validStatuses.includes(paymentIntent.status)) {
            logger.error("Payment status invalid", new Error(`Status: ${paymentIntent.status}`), {
                status: paymentIntent.status,
            });
            return redirect("/checkout?error=PAYMENT_FAILED", {
                headers: { "Set-Cookie": clearParamsCookie() },
            });
        }

        logger.info("Payment validated", { status: paymentIntent.status });

        // Step 4: Complete cart (if cart ID available)
        const cartId = getCartIdFromCookie(cookieHeader);
        if (cartId) {
            await completeCart(cartId, context, logger);
        } else {
            logger.info("No cart ID found, skipping cart completion");
        }

        // Step 5: Fetch order from Medusa
        const orderResult = await fetchOrderByPaymentIntent(params.paymentIntentId, context, logger);
        if (!orderResult) {
            // Order not found after retries - show processing message
            // This is rare but can happen if webhook is very delayed
            logger.error("Order not found after retries", new Error("Order lookup failed"));
            // Still redirect to a page that can handle this gracefully
            return redirect("/checkout?error=ORDER_PROCESSING", {
                headers: { "Set-Cookie": clearParamsCookie() },
            });
        }

        // Step 6: Build response headers
        const cookies: string[] = [clearParamsCookie()];

        // Clear cart cookie
        if (cartId) {
            cookies.push(clearCartCookie());
        }

        // Set guest token cookie for order access
        if (orderResult.modificationToken) {
            const guestTokenCookie = await setGuestToken(
                orderResult.modificationToken,
                orderResult.orderId
            );
            cookies.push(guestTokenCookie);
        }

        // Step 7: Redirect to order status page
        logger.info("Redirecting to order status", { orderId: orderResult.orderId });
        return redirect(`/order/status/${orderResult.orderId}`, {
            headers: { "Set-Cookie": cookies.join(", ") },
        });
    } catch (error) {
        logger.error("Checkout success error", error instanceof Error ? error : new Error(String(error)));
        return redirect("/checkout?error=PAYMENT_FAILED", {
            headers: { "Set-Cookie": clearParamsCookie() },
        });
    }
}

// No default export - this route only has a loader that always redirects
