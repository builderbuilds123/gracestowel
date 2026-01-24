import { useEffect, useLayoutEffect, useState, lazy, Suspense, useRef } from "react";
import { Link, useNavigate, useLoaderData, useFetcher, redirect, data } from "react-router";
import type { LoaderFunctionArgs, ActionFunctionArgs, MetaFunction } from "react-router";
import { CheckCircle2, Package, Truck, MapPin, XCircle, AlertTriangle } from "../lib/icons";
import { CancelOrderDialog } from "../components/CancelOrderDialog";
import { resolveCSRFSecret, validateCSRFToken } from "../utils/csrf.server";
import type { CloudflareEnv } from "../utils/monitored-fetch";
import { getGuestToken, clearGuestToken } from "../utils/guest-session.server";
import { useCart } from "../context/CartContext";
import { useMedusaCart } from "../context/MedusaCartContext";
import { posts } from "../data/blogPosts";
import { getStripe, initStripe } from "../lib/stripe";
import { monitoredFetch } from "../utils/monitored-fetch";
import { medusaFetch } from "../lib/medusa-fetch";
import { createLogger } from "../lib/logger";
import { migrateStorageItem } from "../lib/storage-migration";
import { Image } from "../components/ui/Image";
import { parsePrice } from "../lib/price";
import { CHECKOUT_CONSTANTS } from "../constants/checkout";
import { sanitize } from "../utils/sanitize";
import posthog from "posthog-js";
import { 
    getCachedSessionStorage, 
    setCachedSessionStorage, 
    removeCachedSessionStorage 
} from "../lib/storage-cache";

// Lazy load Map component to avoid SSR issues with Leaflet
// React Router v7: .client.tsx files are automatically excluded from SSR
// Use dynamic import - the .client extension ensures it's only loaded on client
const Map = lazy(() => import("../components/Map.client"));

/**
 * SEC-02: Minimal order API response (no PII)
 *
 * This endpoint only returns order ID and status.
 * Shipping details are fetched from Stripe PaymentIntent instead.
 */
interface OrderApiResponse {
    order: {
        id: string;
        status: string;
    };
    modification_token?: string;
}

const CHECKOUT_PARAMS_COOKIE = "checkout_params";

type PaymentParams = {
    paymentIntentId: string | null;
    paymentIntentClientSecret: string | null;
    redirectStatus: string | null;
};

interface LoaderData {
    stripePublishableKey: string;
    medusaBackendUrl: string;
    medusaPublishableKey: string;
    initialParams: PaymentParams | null;
}

/**
 * SEC-06: SameSite=Lax required for cross-site redirect flow
 *
 * When Stripe redirects back to our site after payment, browsers treat this as a
 * cross-site navigation. SameSite=Strict would prevent the cookie from being sent
 * on the subsequent request after our internal redirect. SameSite=Lax allows cookies
 * on top-level navigations (redirects), which is exactly what we need.
 *
 * Security is maintained because:
 * 1. HttpOnly prevents XSS access
 * 2. Secure ensures HTTPS only
 * 3. Short Max-Age (600s = 10 min) limits exposure window
 * 4. Cookie is cleared immediately after consumption
 */
const serializeParamsCookie = (params: PaymentParams): string =>
    `${CHECKOUT_PARAMS_COOKIE}=${encodeURIComponent(JSON.stringify(params))}; Max-Age=${CHECKOUT_CONSTANTS.CHECKOUT_PARAMS_MAX_AGE_SECONDS}; Path=/; SameSite=Lax; Secure; HttpOnly`;

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

export async function loader({ request, context }: LoaderFunctionArgs) {
    const env = context.cloudflare.env as {
        STRIPE_PUBLISHABLE_KEY: string;
        MEDUSA_BACKEND_URL: string;
        MEDUSA_PUBLISHABLE_KEY: string;
    };

    const url = new URL(request.url);
    const paramsFromUrl: PaymentParams = {
        paymentIntentId: url.searchParams.get("payment_intent"),
        paymentIntentClientSecret: url.searchParams.get("payment_intent_client_secret"),
        redirectStatus: url.searchParams.get("redirect_status"),
    };

    // If sensitive params are present in the URL, strip them via redirect while persisting in a short-lived cookie.
    if (paramsFromUrl.paymentIntentClientSecret) {
        const headers = new Headers();
        headers.set("Set-Cookie", serializeParamsCookie(paramsFromUrl));
        // Use relative redirect to preserve the correct origin (including port in dev)
        return redirect(url.pathname, { headers });
    }

    const paramsFromCookie = parseParamsFromCookie(request.headers.get("cookie"));
    const headers = new Headers();

    // Clear cookie once consumed to avoid lingering secrets.
    if (paramsFromCookie) {
        headers.set("Set-Cookie", clearParamsCookie());
    }

    return Response.json(
        {
            stripePublishableKey: env.STRIPE_PUBLISHABLE_KEY,
            medusaBackendUrl: env.MEDUSA_BACKEND_URL,
            medusaPublishableKey: env.MEDUSA_PUBLISHABLE_KEY,
            initialParams: paramsFromCookie,
        },
        { headers }
    );
}

/**
 * Action function to handle order modifications from checkout success page
 * Similar to order_.status.$id.tsx but gets orderId from form data instead of route params
 */
export async function action({ request, context }: ActionFunctionArgs) {
    const env = context.cloudflare.env as unknown as CloudflareEnv;
    const medusaBackendUrl = env.MEDUSA_BACKEND_URL;
    const medusaPublishableKey = env.MEDUSA_PUBLISHABLE_KEY;

    // CSRF Check
    const jwtSecret = resolveCSRFSecret(env.JWT_SECRET);
    if (!jwtSecret) {
        return data({ error: "Server configuration error" }, { status: 500 });
    }
    const isValidCSRF = await validateCSRFToken(request, jwtSecret);
    if (!isValidCSRF) {
        return data({ error: "Invalid CSRF token" }, { status: 403 });
    }

    // Get orderId from cookie (set when order is fetched on checkout success page)
    const cookieHeader = request.headers.get("Cookie");
    const orderIdCookie = cookieHeader?.split(";").find(c => c.trim().startsWith("checkout_order_id="));
    const orderId = orderIdCookie ? decodeURIComponent(orderIdCookie.split("=", 2)[1] || "") : null;

    if (!orderId) {
        return data({ success: false, error: "Order ID is required" }, { status: 400 });
    }

    // Get token from cookie - try checkout-specific cookie first, then fall back to guest token
    let token: string | null = null;

    // Try checkout_mod_token cookie (set by set-guest-token API for checkout success page)
    const modTokenCookie = cookieHeader?.split(";").find(c => c.trim().startsWith("checkout_mod_token="));
    if (modTokenCookie) {
        token = decodeURIComponent(modTokenCookie.split("=", 2)[1] || "");
    }

    // Fall back to guest_order cookie if checkout_mod_token not found
    if (!token) {
        const guestResult = await getGuestToken(request, orderId);
        token = guestResult.token;
    }

    if (!token) {
        return data({ success: false, error: "Session expired" }, { status: 401 });
    }

    const formData = await request.formData();
    const intent = formData.get("intent") as string;
    const headers = {
        "Content-Type": "application/json",
        "x-modification-token": token,
    };

    try {
        if (intent === "CANCEL_ORDER") {
            const reason = formData.get("reason") as string || "Customer requested cancellation";
            
            const response = await medusaFetch(`/store/orders/${orderId}/cancel`, {
                method: "POST",
                headers,
                body: JSON.stringify({ reason }),
                label: "order-cancel",
                context,
            });

            if (!response.ok) {
                const errorData = await response.json() as { message?: string; code?: string };
                if (response.status === 401 || response.status === 403) {
                    return data(
                        { success: false, error: errorData.message || "Authorization failed" },
                        { status: response.status, headers: { "Set-Cookie": await clearGuestToken(orderId) } }
                    );
                }
                return data({ success: false, error: errorData.message || "Failed to cancel order", errorCode: errorData.code }, { status: response.status === 409 ? 409 : 400 });
            }

            return data({ success: true, action: "canceled" });
        }

        return data({ success: false, error: "Unknown intent" }, { status: 400 });
    } catch (error) {
        const logger = createLogger({ context: "checkout-success-action" });
        logger.error("Action error", error instanceof Error ? error : new Error(String(error)));
        return data({ success: false, error: "An unexpected error occurred" }, { status: 500 });
    }
}

/**
 * SEC-04: Referrer Policy Meta Tag
 * 
 * Prevents payment_intent_client_secret from leaking via Referer header
 * when making requests to third-party services (e.g., Nominatim geocoding).
 */
export const meta: MetaFunction = () => [
    { name: "referrer", content: "strict-origin-when-cross-origin" },
];

export default function CheckoutSuccess() {
    const { stripePublishableKey, medusaBackendUrl, medusaPublishableKey, initialParams } = useLoaderData<LoaderData>();
    const navigate = useNavigate();
    const { clearCart, items, addToCart, toggleCart, cartTotal, setPostCheckoutMode } = useCart();
    const { cartId, setCartId, setCart: setMedusaCart } = useMedusaCart();
    const [paymentStatus, setPaymentStatus] = useState<'loading' | 'success' | 'error' | 'canceled'>('loading');

    // Create logger once at component top for log correlation across component lifecycle
    const logger = createLogger();

    // Initialize Stripe on mount (required for retrievePaymentIntent)
    useEffect(() => {
        if (stripePublishableKey) {
            initStripe(stripePublishableKey);
        }
    }, [stripePublishableKey]);
    const [message, setMessage] = useState<string | null>(null);
    const [orderDetails, setOrderDetails] = useState<any>(null);
    const [shippingAddress, setShippingAddress] = useState<any>(null);
    const [mapCoordinates, setMapCoordinates] = useState<[number, number] | null>(null);

    // Modification window state
    const [orderId, setOrderId] = useState<string | null>(null);
    const [modificationWindowActive, setModificationWindowActive] = useState<boolean>(false);
    const [isOrderUpdate, setIsOrderUpdate] = useState<boolean>(false);
    const [showCancelDialog, setShowCancelDialog] = useState(false);
    const [isCanceling, setIsCanceling] = useState(false);
    
    // Ref to track processed payment intent to prevent double-firing
    const processedRef = useRef<string | null>(null);

    const initialParamsRef = useRef<PaymentParams | null>(initialParams);
    const [urlSanitized, setUrlSanitized] = useState<boolean>(() => !initialParamsRef.current);

    useLayoutEffect(() => {
        if (typeof window === "undefined") return;
        // If params were provided via cookie, ensure URL is clean before rendering the page.
        if (initialParamsRef.current && window.history?.replaceState) {
            window.history.replaceState({}, "", window.location.pathname);
        }
        setUrlSanitized(true);
    }, []);

    // MED-1 FIX: Removed unmount cleanup to support page refreshes (SEC-05)
    // We rely on explicit user actions (Continue Shopping) or Tab Close to clear session data.
    // This ensures that if a user refreshes the success page, they don't lose their receipt view.

    useEffect(() => {
        if (!urlSanitized) return;
        
        // REFRESH FIX: Check for stored verified order FIRST (before checking params)
        // This allows the success page to survive hard refreshes when cookie is gone
        try {
            // Issue #42: Use cached sessionStorage for consistency
            const storedVerifiedOrder = getCachedSessionStorage('verifiedOrder');
            if (storedVerifiedOrder) {
                const parsed = JSON.parse(storedVerifiedOrder);
                
                if (parsed.isCanceled) {
                    setPaymentStatus('canceled');
                    return;
                }

                if (parsed.orderDetails) {
                    setOrderDetails(parsed.orderDetails);
                    setShippingAddress(parsed.shippingAddress);
                    setPaymentStatus('success');

                    // Restore orderId - first check verifiedOrder, then fallback to separate key
                    const restoredOrderId = parsed.orderId || getCachedSessionStorage('orderId');
                    if (restoredOrderId) {
                        setOrderId(restoredOrderId);
                        setModificationWindowActive(true);
                    }

                    // Ensure cart is cleared (may have been missed on initial load)
                    clearCart();

                    logger.info('Restored verified order from sessionStorage');
                    return;
                }
            }
        } catch (error) {
            // Non-critical: if parsing fails, continue with Stripe verification
            logger.warn('Failed to restore verified order', { error: error instanceof Error ? error.message : String(error) });
        }
        
        const paymentIntentId = initialParamsRef.current?.paymentIntentId;
        const paymentIntentClientSecret = initialParamsRef.current?.paymentIntentClientSecret;
        const redirectStatus = initialParamsRef.current?.redirectStatus;

        // Prevent double processing
        if (processedRef.current === paymentIntentId) {
            return;
        }

        const currentParams = initialParamsRef.current;
        if (!currentParams) {
            // No params and no cached order - show error
            setPaymentStatus("error");
            setMessage("No payment information found. Please return to checkout.");
            return;
        }

        // Prevent double processing
        if (processedRef.current === currentParams.paymentIntentId) {
            return;
        }

        const fetchPaymentDetails = async () => {
            if (!currentParams.paymentIntentClientSecret) {
                setPaymentStatus("error");
                setMessage("No payment intent found");
                return;
            }

            // Fetch payment details
            const stripe = await getStripe();
            if (!stripe) {
                setPaymentStatus("error");
                setMessage("Stripe failed to initialize");
                return;
            }

            if (currentParams.paymentIntentId && currentParams.paymentIntentClientSecret) {
                // If redirect status is failed, show error immediately
                if (currentParams.redirectStatus === 'failed') {
                    logger.error("Payment redirect marked as failed", new Error("Stripe redirect failure"), {
                        redirectStatus: currentParams.redirectStatus,
                    });
                    setMessage("The payment process was unsuccessful.");
                    setPaymentStatus('error');
                    return;
                }
                processedRef.current = currentParams.paymentIntentId; // Mark as processed

                try {
                    // SECURITY: Don't log client secret or payment intent object
                    const { paymentIntent, error } = await stripe.retrievePaymentIntent(currentParams.paymentIntentClientSecret);


                    if (error) {
                        // Use existing logger for errors (without sensitive data)
                        const errorObj = error instanceof Error ? error : new Error(error.message || String(error));
                        logger.error("Stripe retrieval error", errorObj, {
                            redirectStatus: currentParams.redirectStatus,
                            // Don't include paymentIntentId or clientSecret
                        });
                        setMessage(`Stripe Error: ${error.message}`);
                        setPaymentStatus('error');
                        return;
                    }

                    // With manual capture mode, status will be 'requires_capture' (authorized but not captured)
                    // or 'succeeded' (already captured after 1-hour window)
                    const validStatuses = ['succeeded', 'requires_capture'];
                    if (paymentIntent && validStatuses.includes(paymentIntent.status)) {
                        // Handle Order Details Logic (Persistence)
                        // SEC-05: Recover from sessionStorage (clears on tab close)
                        // MED-2 FIX: Migrate from localStorage if data exists there
                        const savedOrder = migrateStorageItem('lastOrder', logger);
                        
                        let orderData = null;

                        if (savedOrder) {
                            const parsedOrder = JSON.parse(savedOrder);
                            // DEBUG: Log what's being loaded
                            logger.info('Loaded from lastOrder', {
                                hasDiscount: Boolean(parsedOrder.discount),
                                discount: parsedOrder.discount,
                                appliedPromoCodesCount: parsedOrder.appliedPromoCodes?.length || 0
                            });
                            // Update with actual order number from Stripe
                            orderData = {
                                ...parsedOrder,
                                orderNumber: currentParams.paymentIntentId!.substring(3, 11).toUpperCase(),
                                // Ensure date is set if missing
                                date: parsedOrder.date || new Date().toLocaleDateString('en-US', {
                                    year: 'numeric',
                                    month: 'long',
                                    day: 'numeric'
                                })
                            };
                        } else if (items.length > 0) {
                            // Fallback to context items if available (rare on redirect)
                            // Use cart total from context - more accurate than Stripe amount
                            orderData = {
                                orderNumber: currentParams.paymentIntentId!.substring(3, 11).toUpperCase(),
                                date: new Date().toLocaleDateString('en-US', {
                                    year: 'numeric',
                                    month: 'long',
                                    day: 'numeric'
                                }),
                                items: [...items],
                                total: cartTotal > 0 ? cartTotal : paymentIntent.amount / 100
                            };
                        } else {
                            // Final fallback: use Stripe amount only when no cart data available
                            orderData = {
                                orderNumber: currentParams.paymentIntentId!.substring(3, 11).toUpperCase(),
                                date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
                                items: [],
                                total: cartTotal > 0 ? cartTotal : paymentIntent.amount / 100
                            };
                        }

                        setOrderDetails(orderData);
                        // Extract shipping details immediately for UI
                        if (paymentIntent.shipping) {
                            setShippingAddress(paymentIntent.shipping);
                        }

                        // RENDER SUCCESS IMMEDIATELY
                        setPaymentStatus('success');

                        // Capture purchase_completed event for PostHog survey targeting
                        // PostHog will auto-show post-purchase survey based on URL targeting
                        if (typeof window !== 'undefined') {
                            posthog.capture('purchase_completed', {
                                order_total: orderData.total,
                                item_count: orderData.items?.length || 0,
                                has_discount: (orderData.discount || 0) > 0,
                                has_promo_codes: (orderData.appliedPromoCodes?.length || 0) > 0,
                            });
                        }

                        // REFRESH FIX: Store verified order data so success page survives refresh
                        try {
                            // Issue #42: Use cached sessionStorage for consistency
                            setCachedSessionStorage('verifiedOrder', JSON.stringify({
                                orderDetails: orderData,
                                shippingAddress: paymentIntent.shipping,
                            }));
                        } catch (error) {
                            logger.warn('Failed to store verifiedOrder in sessionStorage', {
                                error: error instanceof Error ? error.message : String(error),
                            });
                        }

                        // NON-BLOCKING: Geocode address in background
                        if (paymentIntent.shipping) {
                            const address = paymentIntent.shipping.address;
                            const addressString = `${address?.line1}, ${address?.city}, ${address?.state} ${address?.postal_code}, ${address?.country} `;
                            // SECURITY: Don't log addresses (PII) - removed debug log

                            // Use native fetch for third-party API (Nominatim)
                            fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addressString)}`, {
                                method: "GET",
                                headers: {
                                    "User-Agent": "Grace's Towel E-Commerce/1.0 (https://gracestowel.com)",
                                },
                            }).then(async (response) => {
                                const data = await response.json() as any[];
                                if (Array.isArray(data) && data.length > 0) {
                                    const coords: [number, number] = [parseFloat(data[0].lat), parseFloat(data[0].lon)];
                                    setMapCoordinates(coords);
                                }
                            }).catch(() => {
                                // SECURITY: Don't log geocoding errors (may contain address PII)
                                // Silently fail - geocoding is non-critical
                            });
                        }

                        // Fetch order from API to get modification token
                        // Poll until order is created (webhook may still be processing)
                        const medusaUrl = medusaBackendUrl;
                        let retries = 0;
                        const maxRetries = CHECKOUT_CONSTANTS.ORDER_FETCH_MAX_RETRIES;
                        const retryDelay = CHECKOUT_CONSTANTS.ORDER_FETCH_RETRY_DELAY_MS;

                        const fetchOrderWithToken = async (): Promise<void> => {
                            try {
                                // DEBUG: Log the fetch attempt
                                logger.info('fetchOrderWithToken: Attempting to fetch order', {
                                    paymentIntentId: currentParams.paymentIntentId?.substring(0, 10) + '...',
                                    retry: retries,
                                });

                                // Use medusaFetch for Medusa Store API
                                const response = await medusaFetch(
                                    `/store/orders/by-payment-intent?payment_intent_id=${encodeURIComponent(currentParams.paymentIntentId!)}`,
                                    {
                                        method: "GET",
                                        headers: {
                                            "x-modification-token": "request-new",
                                        },
                                        label: "fetch-order-with-token",
                                    }
                                );

                                // DEBUG: Log response status
                                logger.info('fetchOrderWithToken: Response received', {
                                    status: response.status,
                                    ok: response.ok,
                                });

                                if (response.ok) {
                                    const data = await response.json() as OrderApiResponse;

                                    // DEBUG: Log order data
                                    logger.info('fetchOrderWithToken: Order found', {
                                        orderId: data.order?.id,
                                        hasToken: !!data.modification_token,
                                    });

                                    // Check if this is an order update (same orderId as before)
                                    const previousOrderId = getCachedSessionStorage('orderId');
                                    if (previousOrderId && previousOrderId === data.order.id) {
                                        // Same order ID - this is an update
                                        setIsOrderUpdate(true);
                                        setModificationWindowActive(true);
                                    } else {
                                        // New order
                                        setIsOrderUpdate(false);
                                        if (data.modification_token) {
                                            setModificationWindowActive(true);
                                        }
                                    }

                                    setOrderId(data.order.id);

                                    // Store modification token in sessionStorage for cancel/edit operations
                                    // sessionStorage is ephemeral (clears on tab close) which is appropriate for this use case
                                    if (data.modification_token) {
                                        try {
                                            setCachedSessionStorage('modificationToken', data.modification_token);
                                        } catch (tokenError) {
                                            // Non-critical: token storage failure doesn't prevent order display
                                            logger.warn("Failed to store modification token", {
                                                error: tokenError instanceof Error ? tokenError.message : String(tokenError),
                                            });
                                        }
                                    }

                                    // SEC-05: Store in sessionStorage for ephemeral access (clears on tab close)
                                    try {
                                        // Issue #42: Use cached sessionStorage for consistency
                                        setCachedSessionStorage('orderId', data.order.id);

                                        // Also update verifiedOrder with orderId for page refresh support
                                        const currentVerified = getCachedSessionStorage('verifiedOrder');
                                        if (currentVerified) {
                                            const parsed = JSON.parse(currentVerified);
                                            setCachedSessionStorage('verifiedOrder', JSON.stringify({
                                                ...parsed,
                                                orderId: data.order.id,
                                            }));
                                        }
                                    } catch (error) {
                                        // Non-critical: storage failures don't affect order processing
                                        // Errors can occur in private browsing mode or when storage is disabled
                                        logger.warn("Failed to store order data in sessionStorage", {
                                            error: error instanceof Error ? error.message : String(error),
                                        });
                                    }

                                    // SECURITY: Don't log order IDs - removed debug log
                                } else if (response.status === 404 && retries < maxRetries) {
                                    // Order not yet created, retry
                                    retries++;
                                    logger.info('fetchOrderWithToken: Order not found, retrying...', {
                                        retry: retries,
                                        maxRetries,
                                    });
                                    setTimeout(fetchOrderWithToken, retryDelay);
                                } else {
                                    // DEBUG: Log when giving up
                                    logger.warn('fetchOrderWithToken: Gave up fetching order', {
                                        status: response.status,
                                        retries,
                                        maxRetries,
                                    });
                                    logger.error("Failed to fetch order", new Error(`HTTP ${response.status}`));
                                }
                            } catch (err) {
                                logger.error('fetchOrderWithToken: Fetch error', err instanceof Error ? err : new Error(String(err)), {
                                    retry: retries,
                                });
                                logger.error("Error fetching order", err instanceof Error ? err : new Error(String(err)));
                                if (retries < maxRetries) {
                                    retries++;
                                    setTimeout(fetchOrderWithToken, retryDelay);
                                }
                            }
                        };

                        // CHK-01: Call Medusa cart completion API
                        if (cartId) {
                            logger.info('checkout.success: Calling cart completion API', {
                                cartIdPrefix: cartId.substring(0, 10) + '...',
                            });
                            try {
                                // SECURITY: Don't log cart IDs or completion data
                                const completeResponse = await monitoredFetch(`/api/carts/${cartId}/complete`, {
                                    method: "POST",
                                    headers: {
                                        "Content-Type": "application/json",
                                    },
                                    label: "complete-medusa-cart",
                                });
                                logger.info('checkout.success: Cart completion response', {
                                    status: completeResponse.status,
                                    ok: completeResponse.ok,
                                });

                                if (!completeResponse.ok) {
                                    logger.error("Medusa cart completion failed", new Error("Cart completion failed"), {
                                        status: completeResponse.status,
                                    });
                                    // Non-critical failure: log and proceed, webhook should eventually create order
                                }
                            } catch (err) {
                                logger.error("Error calling cart completion API", err instanceof Error ? err : new Error(String(err)));
                                // Non-critical failure: log and proceed
                            }
                        } else {
                            logger.info('checkout.success: No cartId available, skipping cart completion');
                        }

                        // Start fetching order
                        logger.info('checkout.success: Starting fetchOrderWithToken');
                        fetchOrderWithToken();

                        // Clear cart after a delay to ensure UI updates
                        // NOTE: Do NOT clear verifiedOrder here - it's needed for page refresh
                        // verifiedOrder will be cleared on unmount (navigation away)
                        setTimeout(() => {
                            clearCart();
                            // Clear checkout-related data but keep verifiedOrder for refresh
                            try {
                            setMedusaCart(null);
                            setCartId(undefined);
                            // Issue #42: Use cached sessionStorage for consistency
                            removeCachedSessionStorage('lastOrder');
                            } catch (error) {
                                logger.warn("Failed to cleanup sessionStorage", {
                                    error: error instanceof Error ? error.message : String(error),
                                });
                            }
                        }, CHECKOUT_CONSTANTS.CART_CLEAR_DELAY_MS);
                    } else if (paymentIntent?.status === 'canceled') {
                        // SEC-07: Handle already-canceled payments gracefully (e.g. on refresh)
                        setPaymentStatus('canceled');
                    } else {
                        logger.error("Payment status not valid", new Error(`Invalid status: ${paymentIntent?.status}`), {
                            status: paymentIntent?.status,
                            // Don't include paymentIntentId
                        });
                        setMessage(`Payment status: ${paymentIntent?.status}`);
                        setPaymentStatus('error');
                    }
                } catch (error: any) {
                    logger.error("Error fetching payment details", error instanceof Error ? error : new Error(String(error)), {
                        redirectStatus: currentParams.redirectStatus,
                        // Don't include paymentIntentId or clientSecret
                    });
                    setMessage(`Error: ${error.message || "Payment processing failed"}`);
                    setPaymentStatus('error');
                }
            } else {
                logger.error("Missing required params or redirect status not succeeded", new Error("Invalid payment params"), {
                    redirectStatus: currentParams.redirectStatus,
                    // Don't include paymentIntentId
                });
                setPaymentStatus('error');
            }
        };

        fetchPaymentDetails();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [urlSanitized]);

    const clearSessionData = (options: { clearVerified?: boolean; keepCart?: boolean } = {}) => {
        const { clearVerified = true, keepCart = false } = options;
        try {
            // Issue #42: Use cached sessionStorage for consistency
            removeCachedSessionStorage('lastOrder');
            removeCachedSessionStorage('orderId');
            if (!keepCart) {
                setMedusaCart(null);
                setCartId(undefined);
            }
            // Note: modification window state is managed in component state
            if (clearVerified) {
                removeCachedSessionStorage('verifiedOrder');
            }
        } catch (e) {
            logger.warn("Failed to clear session data", { error: e });
        }
    };

    const handleCancelOrder = async () => {
        // Check for orderId - it may still be loading from the by-payment-intent lookup
        const currentOrderId = orderId || getCachedSessionStorage('orderId');
        if (!currentOrderId) {
            throw new Error("Order is still being processed. Please wait a moment and try again.");
        }

        setIsCanceling(true);
        try {
            // Get modification token from sessionStorage
            const token = getCachedSessionStorage('modificationToken');
            if (!token) {
                throw new Error("Session expired. Please refresh the page and try again.");
            }

            // Call Medusa cancel endpoint directly with the modification token
            const response = await medusaFetch(`/store/orders/${currentOrderId}/cancel`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-modification-token": token,
                },
                body: JSON.stringify({ reason: "Customer cancelled from success page" }),
                label: "cancel-order-from-success",
            });

            if (response.ok) {
                setPaymentStatus('canceled');
                setShowCancelDialog(false);

                // Clear session data but keep verifiedOrder (updated) for the UI
                clearSessionData({ clearVerified: false, keepCart: false });

                // Mark as canceled in sessionStorage to persist across refreshes
                try {
                    // Issue #42: Use cached sessionStorage for consistency
                    const currentOrder = getCachedSessionStorage('verifiedOrder');
                    if (currentOrder) {
                        const parsed = JSON.parse(currentOrder);
                        setCachedSessionStorage('verifiedOrder', JSON.stringify({ ...parsed, isCanceled: true }));
                    } else {
                        setCachedSessionStorage('verifiedOrder', JSON.stringify({ isCanceled: true }));
                    }
                    // Clear the modification token after successful cancellation
                    removeCachedSessionStorage('modificationToken');
                } catch (e) {
                    logger.warn("Failed to persist canceled state", { error: e });
                }
            } else {
                const errorData = await response.json() as { message?: string; code?: string };
                logger.error("Failed to cancel order", new Error(errorData.message || "Cancellation failed"));
                throw new Error(errorData.message || "Failed to cancel order. Please contact support.");
            }
        } catch (err) {
            logger.error("Error canceling order", err instanceof Error ? err : new Error(String(err)));
            throw err; // Re-throw so CancelOrderDialog can display the error
        } finally {
            setIsCanceling(false);
        }
    };

    if (paymentStatus === 'loading') {
        return (
            <div className="min-h-screen bg-background-earthy flex items-center justify-center">
                <div className="text-center">
                    <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-accent-earthy mb-4"></div>
                    <p className="text-text-earthy">Processing your order...</p>
                </div>
            </div>
        );
    }

    const debugRedirectStatus = initialParamsRef.current?.redirectStatus ?? "";
    const debugPaymentIntentId = initialParamsRef.current?.paymentIntentId ?? "";

    if (paymentStatus === 'error') {
        return (
            <div className="min-h-screen bg-background-earthy flex items-center justify-center px-4">
                <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
                    <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </div>
                    <h1 className="text-2xl font-serif text-text-earthy mb-2">Payment Verification Failed</h1>
                    <p className="text-text-earthy/70 mb-4">
                        We couldn't verify your payment.
                    </p>
                    {/* Debug Info */}
                    <div className="bg-gray-100 p-4 rounded text-left text-xs font-mono text-gray-600 mb-6 overflow-auto max-h-40">
                        <p><strong>Debug Info:</strong></p>
                        <p>Status: {debugRedirectStatus}</p>
                        <p>Intent ID: {debugPaymentIntentId}</p>
                        {message && <p className="text-red-600 mt-2">{message}</p>}
                    </div>
                    <Link
                        to="/checkout"
                        onClick={() => clearSessionData({ clearVerified: true, keepCart: true })}
                        className="inline-block bg-accent-earthy text-white px-6 py-3 rounded-lg hover:bg-accent-earthy/90 transition-colors cursor-pointer"
                    >
                        Return to Checkout
                    </Link>
                </div>
            </div>
        );
    }

    if (paymentStatus === 'canceled') {
        return (
            <div className="min-h-screen bg-background-earthy flex items-center justify-center px-4">
                <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <XCircle className="w-10 h-10 text-gray-500" />
                    </div>
                    <h1 className="text-2xl font-serif text-text-earthy mb-2">Order Canceled</h1>
                    <p className="text-text-earthy/70 mb-6">
                        Your order has been canceled and your payment will be refunded within 5-10 business days.
                    </p>
                    <Link
                        to="/"
                        onClick={() => clearSessionData({ clearVerified: true })}
                        className="inline-block bg-accent-earthy text-white px-6 py-3 rounded-lg hover:bg-accent-earthy/90 transition-colors cursor-pointer"
                    >
                        Continue Shopping
                    </Link>
                </div>
            </div>
        );
    }


    return (
        <div className="min-h-screen bg-background-earthy py-12 px-4">
            <div className="max-w-3xl mx-auto">
                {/* Success Header */}
                <div className="text-center mb-8">
                    <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                        <CheckCircle2 className="w-12 h-12 text-green-600" />
                    </div>
                    <h1 className="text-4xl font-serif text-text-earthy mb-2">
                        {isOrderUpdate ? "Order Updated!" : "Order Confirmed!"}
                    </h1>
                    <p className="text-text-earthy/70 text-lg">
                        {isOrderUpdate 
                            ? "Your order has been successfully updated" 
                            : "Thank you for your purchase"}
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    {/* Order Details Card */}
                    <div className="bg-white rounded-lg shadow-lg p-8">
                        <div className="border-b border-gray-200 pb-6 mb-6">
                            <div className="flex justify-between items-start">
                                <div>
                                    <h2 className="text-sm text-text-earthy/60 mb-1">Order Number</h2>
                                    <p className="text-2xl font-semibold text-text-earthy">{orderDetails?.orderNumber}</p>
                                </div>
                                <div className="text-right">
                                    <h2 className="text-sm text-text-earthy/60 mb-1">Order Date</h2>
                                    <p className="text-lg text-text-earthy">{orderDetails?.date}</p>
                                </div>
                            </div>
                        </div>

                        {/* Order Items */}
                        <div className="mb-6">
                            <h3 className="font-serif text-xl text-text-earthy mb-4">Order Items</h3>
                            <div className="space-y-4">
                                {orderDetails?.items.map((item: any, index: number) => (
                                    <div key={index} className="flex gap-4">
                                        <div className="w-20 h-20 bg-card-earthy/30 rounded-md overflow-hidden flex-shrink-0">
                                            <Image src={item.image} alt={item.title} width={80} height={80} className="w-full h-full object-cover" />
                                        </div>
                                        <div className="flex-1">
                                            <h4 className="font-medium text-text-earthy">{item.title}</h4>
                                            {item.color && item.id !== 4 ? (
                                                <p className="text-sm text-text-earthy/60">Color: {item.color}</p>
                                            ) : null}
                                            {item.embroidery ? (
                                                <p className="text-sm text-accent-earthy">✨ Custom Embroidery</p>
                                            ) : null}
                                            <p className="text-sm text-text-earthy/60 mt-1">Qty: {item.quantity}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="font-medium text-accent-earthy">{item.price}</p>
                                            {item.originalPrice ? (
                                                <p className="text-xs text-text-earthy/40 line-through">{item.originalPrice}</p>
                                            ) : null}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Order Total */}
                        <div className="border-t border-gray-200 pt-4">
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-text-earthy/80">Subtotal</span>
                                <span className="text-text-earthy font-medium">${orderDetails?.subtotal?.toFixed(2) || orderDetails?.items.reduce((acc: number, item: any) => acc + parsePrice(item.price) * item.quantity, 0).toFixed(2)}</span>
                            </div>
                            
                            {/* Applied Promo Codes */}
                            {orderDetails?.appliedPromoCodes && orderDetails.appliedPromoCodes.length > 0 ? (
                                <div className="mb-3">
                                    <div className="flex flex-wrap gap-2">
                                        {orderDetails.appliedPromoCodes.map((promo: { code: string; discount: number; isAutomatic?: boolean }) => (
                                            <span 
                                                key={promo.code}
                                                className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
                                                    promo.isAutomatic 
                                                        ? 'bg-purple-100 text-purple-800' 
                                                        : 'bg-green-100 text-green-800'
                                                }`}
                                            >
                                                {promo.code}
                                                {promo.isAutomatic ? <span className="text-purple-500">Auto</span> : null}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            ) : null}
                            
                            {/* Discount Row */}
                            {orderDetails?.discount > 0 ? (
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-text-earthy/80">Discount</span>
                                    <span className="text-green-600 font-medium">-${orderDetails.discount.toFixed(2)}</span>
                                </div>
                            ) : null}
                            
                            <div className="flex justify-between items-center mb-4">
                                <span className="text-text-earthy/80">Shipping</span>
                                <span className="text-text-earthy font-medium">
                                    {orderDetails?.shipping === 0 ? 'Free' : `$${orderDetails?.shipping?.toFixed(2) || '0.00'}`}
                                </span>
                            </div>
                            <div className="flex justify-between items-center pt-2 border-t border-gray-100">
                                <span className="font-serif text-lg text-text-earthy">Total</span>
                                <span className="font-bold text-2xl text-accent-earthy">${orderDetails?.total.toFixed(2)}</span>
                            </div>
                        </div>

                        {/* Order Modification Controls - Always shown, backend handles validation */}
                        <div className="mt-8 pt-6 border-t border-gray-100 text-center space-y-4">
                            <button
                                onClick={async () => {
                                    try {
                                        // Load order items into cart for editing
                                        if (orderDetails?.items && orderDetails.items.length > 0) {
                                            clearCart();
                                            for (const item of orderDetails.items) {
                                                addToCart({
                                                    id: item.id || item.variant_id || String(Math.random()),
                                                    variantId: item.variant_id || item.id,
                                                    title: item.title,
                                                    price: item.price,
                                                    image: item.image,
                                                    quantity: item.quantity,
                                                    color: item.color,
                                                });
                                            }
                                        }

                                        // Set post-checkout mode with 24h expiry
                                        const currentOrderId = orderId || getCachedSessionStorage('orderId');
                                        if (currentOrderId) {
                                            setPostCheckoutMode(currentOrderId);
                                        }

                                        // Navigate to checkout page with orderId
                                        navigate(`/checkout${currentOrderId ? `?orderId=${currentOrderId}` : ''}`);
                                    } catch (error) {
                                        logger.error(
                                            'Failed to initiate order editing',
                                            error instanceof Error ? error : new Error(String(error))
                                        );
                                        // Still try to navigate to checkout even if loading items failed
                                        navigate('/checkout');
                                    }
                                }}
                                className="px-6 py-2 bg-accent-earthy text-white rounded-lg hover:bg-accent-earthy/90 transition-colors font-medium"
                            >
                                Edit Order
                            </button>
                            <div>
                                <button
                                    onClick={() => setShowCancelDialog(true)}
                                    className="text-sm text-red-600 hover:text-red-800 underline transition-colors font-medium cursor-pointer"
                                >
                                    Made a mistake? Cancel your order within 60 minutes
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Shipping & Map Card */}
                    <div className="space-y-6">
                        {/* Shipping Address */}
                        <div className="bg-white rounded-lg shadow-lg p-8">
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-3">
                                    <MapPin className="w-6 h-6 text-accent-earthy" />
                                    <h3 className="font-serif text-xl text-text-earthy">Delivery Address</h3>
                                </div>
                            </div>
                            {shippingAddress ? (
                                <div className="text-text-earthy/80">
                                    <p className="font-medium text-text-earthy">{sanitize(shippingAddress.name)}</p>
                                    <p>{sanitize(shippingAddress.address?.line1)}</p>
                                    {shippingAddress.address?.line2 && <p>{sanitize(shippingAddress.address?.line2)}</p>}
                                    <p>{sanitize(shippingAddress.address?.city)}, {sanitize(shippingAddress.address?.state)} {sanitize(shippingAddress.address?.postal_code)}</p>
                                    <p>{sanitize(shippingAddress.address?.country)}</p>
                                </div>
                            ) : (
                                <p className="text-text-earthy/60 italic">Loading address details...</p>
                            )}

                            {/* Map */}
                            {mapCoordinates ? (
                                <div className="mt-6 rounded-lg overflow-hidden h-48 z-0 relative border border-gray-100">
                                    <Suspense fallback={<div className="h-full w-full bg-gray-100 animate-pulse flex items-center justify-center text-gray-400">Loading map...</div>}>
                                        <Map coordinates={mapCoordinates} />
                                    </Suspense>
                                </div>
                            ) : null}
                        </div>

                        {/* What's Next Section */}
                        <div className="bg-white rounded-lg shadow-lg p-8">
                            <h3 className="font-serif text-xl text-text-earthy mb-6">What's Next?</h3>
                            <div className="space-y-4">
                                <div className="flex gap-4">
                                    <div className="w-10 h-10 bg-accent-earthy/10 rounded-full flex items-center justify-center flex-shrink-0">
                                        <Package className="w-5 h-5 text-accent-earthy" />
                                    </div>
                                    <div>
                                        <h4 className="font-medium text-text-earthy mb-1">Order Confirmation</h4>
                                        <p className="text-sm text-text-earthy/70">We'll send you an email confirmation with your order details shortly.</p>
                                    </div>
                                </div>
                                <div className="flex gap-4">
                                    <div className="w-10 h-10 bg-accent-earthy/10 rounded-full flex items-center justify-center flex-shrink-0">
                                        <Truck className="w-5 h-5 text-accent-earthy" />
                                    </div>
                                    <div>
                                        <h4 className="font-medium text-text-earthy mb-1">Shipping Updates</h4>
                                        <p className="text-sm text-text-earthy/70">We'll notify you when your order ships. Estimated delivery: 3-5 business days.</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* From the Journal Section */}
                <div className="mt-12">
                    <h3 className="text-2xl font-serif text-text-earthy mb-6">From the Journal</h3>
                    <div className="grid md:grid-cols-2 gap-6">
                        {posts.slice(0, 2).map((post) => (
                            <Link key={post.id} to={`/blog/${post.id}`} className="group block bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all">
                                <div className="aspect-[3/2] overflow-hidden">
                                    <img
                                        src={post.image}
                                        alt={post.title}
                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                    />
                                </div>
                                <div className="p-6">
                                    <div className="flex items-center gap-3 text-xs text-text-earthy/60 mb-3">
                                        <span className="text-accent-earthy font-medium">{post.category}</span>
                                        <span>•</span>
                                        <span>{post.date}</span>
                                    </div>
                                    <h4 className="text-xl font-serif text-text-earthy group-hover:text-accent-earthy transition-colors mb-2">
                                        {post.title}
                                    </h4>
                                    <p className="text-text-earthy/70 text-sm line-clamp-2">
                                        {post.excerpt}
                                    </p>
                                </div>
                            </Link>
                        ))}
                    </div>
                    <div className="text-center mt-8">
                        <Link to="/blog" className="text-accent-earthy font-medium hover:underline">
                            View all stories &rarr;
                        </Link>
                    </div>
                </div>

                <CancelOrderDialog
                    isOpen={showCancelDialog}
                    onClose={() => setShowCancelDialog(false)}
                    onConfirm={handleCancelOrder}
                    orderNumber={orderDetails?.orderNumber || ""}
                />
            </div>
        </div>
    );
}
