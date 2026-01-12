import { useEffect, useLayoutEffect, useState, lazy, Suspense, useRef, useCallback } from "react";
import { Link, useNavigate, useLoaderData, redirect, data, useFetcher } from "react-router";
import type { LoaderFunctionArgs, ActionFunctionArgs, MetaFunction } from "react-router";
import { CheckCircle2, Package, Truck, MapPin, XCircle } from "lucide-react";
import { useCart } from "../context/CartContext";
import { posts } from "../data/blogPosts";
import { getStripe, initStripe } from "../lib/stripe";
import { monitoredFetch } from "../utils/monitored-fetch";
import { createLogger } from "../lib/logger";
import { migrateStorageItem } from "../lib/storage-migration";
import { OrderModificationDialogs } from "../components/order/OrderModificationDialogs";
import { OrderTimer } from "../components/order/OrderTimer";
import { getGuestToken, clearGuestToken } from "../utils/guest-session.server";

// Lazy load Map component to avoid SSR issues with Leaflet
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
        created_at: string;
    };
    modification_token?: string;
    modification_window?: {
        status: "active" | "expired";
        expires_at: string;
        server_time: string;
        remaining_seconds: number;
    };
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
    `${CHECKOUT_PARAMS_COOKIE}=${encodeURIComponent(JSON.stringify(params))}; Max-Age=600; Path=/; SameSite=Lax; Secure; HttpOnly`;

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
 * Story 3.5: Handle order cancellation from success page
 */
export async function action({ params, request, context }: ActionFunctionArgs) {
    const env = context.cloudflare.env as any;
    const medusaBackendUrl = env.MEDUSA_BACKEND_URL;
    const medusaPublishableKey = env.MEDUSA_PUBLISHABLE_KEY;

    const formData = await request.formData();
    const intent = formData.get("intent") as string;
    const orderId = formData.get("orderId") as string;

    if (intent === "SET_MODIFICATION_TOKEN") {
        const token = formData.get("token") as string;
        if (!token) {
            return data({ success: false, error: "Token is required" }, { status: 400 });
        }
        
        try {
            const { setGuestToken } = await import("../utils/guest-session.server");
            const cookie = await setGuestToken(token, orderId);
            return data({ success: true }, {
                headers: { "Set-Cookie": cookie }
            });
        } catch (error) {
            console.error("Failed to set guest token cookie:", error);
            return data({ success: false, error: "Failed to set session" }, { status: 500 });
        }
    }

    // Get token from HttpOnly cookie (scopeless if using specific orderId logic from status page)
    const { token } = await getGuestToken(request, orderId);

    if (!token) {
        return data({ success: false, error: "Session expired or unauthorized" }, { status: 401 });
    }

    const headers = {
        "Content-Type": "application/json",
        "x-publishable-api-key": medusaPublishableKey,
        "x-modification-token": token,
    };

    try {
        if (intent === "CANCEL_ORDER") {
            const reason = formData.get("reason") as string || "Customer requested cancellation from success page";
            
            const response = await monitoredFetch(`${medusaBackendUrl}/store/orders/${orderId}/cancel`, {
                method: "POST",
                headers,
                body: JSON.stringify({ reason }),
                label: "order-cancel-success",
                cloudflareEnv: env,
            });

            if (!response.ok) {
                const errorData = await response.json() as { message?: string };
                if (response.status === 401 || response.status === 403) {
                    return data(
                        { success: false, error: errorData.message || "Authorization failed" },
                        { status: response.status, headers: { "Set-Cookie": await clearGuestToken(orderId) } }
                    );
                }
                return data({ success: false, error: errorData.message || "Failed to cancel order" }, { status: 400 });
            }

            return data({ success: true, action: "canceled" });
        }

        return data({ success: false, error: "Unknown intent" }, { status: 400 });
    } catch (error) {
        console.error("Success page action error:", error instanceof Error ? error.message : "Unknown error");
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
    const { clearCart, items } = useCart();
    const fetcher = useFetcher();
    const [paymentStatus, setPaymentStatus] = useState<'loading' | 'success' | 'error' | 'canceled'>('loading');

    // Create logger once at component top for log correlation across component lifecycle
    const logger = createLogger();

    // Add effect to log paymentStatus changes for debugging
    useEffect(() => {
        logger.info("Payment status changed", { paymentStatus });
    }, [paymentStatus, logger]);

    /**
     * Wrapper to prevent changing paymentStatus from 'success' to 'error'.
     * 
     * Rationale:
     * - paymentStatus represents PAYMENT VERIFICATION status, not order processing status
     * - Once Stripe PaymentIntent is verified as successful (status: 'succeeded' or 'requires_capture'),
     *   the payment IS successful and should not be changed to 'error'
     * - All error paths occur BEFORE payment verification succeeds (lines 341, 350, 371, 588, 598, 607)
     * - After success is set (line 438), all operations are non-blocking and non-critical:
     *   - Geocoding (silently fails if error)
     *   - Order fetching (logs errors but doesn't change payment status)
     *   - Cart completion (logs errors but doesn't change payment status)
     * - Order cancellation uses 'canceled' status (allowed, not blocked)
     * 
     * If we need to show errors for order processing after payment verification succeeds,
     * we should use a separate state variable (e.g., orderProcessingError), not paymentStatus.
     */
    const setPaymentStatusSafe = useCallback((newStatus: 'loading' | 'success' | 'error' | 'canceled') => {
        setPaymentStatus((prevStatus) => {
            // Once payment verification succeeds, never change it to 'error'
            // (payment was verified successfully - subsequent non-critical errors shouldn't change this)
            if (prevStatus === 'success' && newStatus === 'error') {
                logger.warn("Attempted to change payment verification status from 'success' to 'error', ignoring", {
                    previousStatus: prevStatus,
                    attemptedStatus: newStatus,
                    note: "Payment verification succeeded - this status should not change. Use separate state for order processing errors.",
                });
                return prevStatus;
            }
            return newStatus;
        });
    }, [logger]);

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
    const [modificationWindow, setModificationWindow] = useState<OrderApiResponse["modification_window"] | null>(null);
    const [modificationToken, setModificationToken] = useState<string | null>(null);

    // Modification window state
    const [orderId, setOrderId] = useState<string | null>(null);
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

    // Note: We DON'T clear sessionStorage on unmount because:
    // 1. sessionStorage automatically clears when the tab closes (desired behavior)
    // 2. Clearing on unmount breaks page refresh (user loses order data on refresh)
    // 3. It's safe to keep order data in sessionStorage until tab close

    useEffect(() => {
        if (!urlSanitized) return;
        const paymentIntentId = initialParamsRef.current?.paymentIntentId;
        const paymentIntentClientSecret = initialParamsRef.current?.paymentIntentClientSecret;
        const redirectStatus = initialParamsRef.current?.redirectStatus;

        // Prevent double processing
        if (processedRef.current === paymentIntentId) {
            logger.info("Payment intent already processed, skipping", {
                hasPaymentIntentId: !!paymentIntentId,
            });
            return;
        }

        const fetchPaymentDetails = async () => {
            // Handle refresh case: If no payment params but we have order data in sessionStorage,
            // restore the success state instead of trying to verify payment again
            if (!paymentIntentClientSecret && !redirectStatus && !paymentIntentId) {
                logger.info("No payment params found (likely page refresh), checking sessionStorage for order data");
                try {
                    const savedOrder = migrateStorageItem('lastOrder', logger);
                    const savedOrderId = migrateStorageItem('orderId', logger);
                    
                    if (savedOrder || savedOrderId) {
                        logger.info("Found order data in sessionStorage, restoring success state");
                        try {
                            if (savedOrder) {
                                const parsedOrder = JSON.parse(savedOrder);
                                setOrderDetails(parsedOrder);
                            }
                            if (savedOrderId) {
                                setOrderId(savedOrderId);
                            }
                            setPaymentStatusSafe('success');
                            return; // Exit early - don't try to verify payment
                        } catch (parseError) {
                            logger.warn("Failed to parse saved order data", {
                                error: parseError instanceof Error ? parseError.message : String(parseError),
                            });
                            // If parsing fails, continue to error path below
                        }
                    } else {
                        logger.warn("No order data found in sessionStorage on refresh");
                        // Continue to error path below
                    }
                } catch (storageError) {
                    logger.warn("Failed to read sessionStorage on refresh", {
                        error: storageError instanceof Error ? storageError.message : String(storageError),
                    });
                    // Continue to error path below
                }
            }
            logger.info("Starting payment verification", {
                hasRedirectStatus: !!redirectStatus,
                redirectStatus: redirectStatus || 'missing',
                hasPaymentIntentId: !!paymentIntentId,
                hasClientSecret: !!paymentIntentClientSecret,
            });

            if (!paymentIntentClientSecret) {
                logger.error("Payment verification failed: No payment intent client secret", new Error("Missing payment intent client secret"));
                setPaymentStatusSafe("error");
                setMessage("No payment intent found");
                return;
            }

            // Fetch payment details
            const stripe = await getStripe();
            if (!stripe) {
                logger.error("Payment verification failed: Stripe initialization failed", new Error("Stripe failed to initialize"));
                setPaymentStatusSafe("error");
                setMessage("Stripe failed to initialize");
                return;
            }

            if (redirectStatus === 'succeeded' && paymentIntentId && paymentIntentClientSecret) {
                logger.info("Redirect status is 'succeeded', proceeding with payment verification");
                processedRef.current = paymentIntentId; // Mark as processed

                try {
                    // SECURITY: Don't log client secret or payment intent object
                    const { paymentIntent, error } = await stripe.retrievePaymentIntent(paymentIntentClientSecret);

                    if (error) {
                        // Use existing logger for errors (without sensitive data)
                        const errorObj = error instanceof Error ? error : new Error(error.message || String(error));
                        logger.error("Stripe retrieval error", errorObj, {
                            redirectStatus,
                            // Don't include paymentIntentId or clientSecret
                        });
                        setMessage(`Stripe Error: ${error.message}`);
                        setPaymentStatusSafe('error');
                        return;
                    }

                    // With manual capture mode, status will be 'requires_capture' (authorized but not captured)
                    // or 'succeeded' (already captured after 1-hour window)
                    const validStatuses = ['succeeded', 'requires_capture'];
                    logger.info("Retrieved payment intent from Stripe", {
                        status: paymentIntent?.status,
                        isValidStatus: paymentIntent ? validStatuses.includes(paymentIntent.status) : false,
                    });

                    if (paymentIntent && validStatuses.includes(paymentIntent.status)) {
                        // Handle Order Details Logic (Persistence)
                        // SEC-05: Recover from sessionStorage (clears on tab close)
                        // MED-2 FIX: Migrate from localStorage if data exists there
                        const savedOrder = migrateStorageItem('lastOrder', logger);
                        const savedOrderId = migrateStorageItem('orderId', logger);

                        let orderData = null;

                        if (savedOrder) {
                            const parsedOrder = JSON.parse(savedOrder);
                            // Update with actual order number from Stripe
                            orderData = {
                                ...parsedOrder,
                                orderNumber: paymentIntentId.substring(3, 11).toUpperCase(),
                                // Ensure date is set if missing
                                date: parsedOrder.date || new Date().toLocaleDateString('en-US', {
                                    year: 'numeric',
                                    month: 'long',
                                    day: 'numeric'
                                })
                            };
                        } else if (items.length > 0) {
                            // Fallback to context items if available (rare on redirect)
                            orderData = {
                                orderNumber: paymentIntentId.substring(3, 11).toUpperCase(),
                                date: new Date().toLocaleDateString('en-US', {
                                    year: 'numeric',
                                    month: 'long',
                                    day: 'numeric'
                                }),
                                items: [...items],
                                total: items.reduce((sum, item) => {
                                    const price = parseFloat(item.price.replace('$', ''));
                                    return sum + (price * item.quantity);
                                }, 0)
                            };
                        } else {
                            // Final fallback: just show total from Stripe
                            orderData = {
                                orderNumber: paymentIntentId.substring(3, 11).toUpperCase(),
                                date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
                                items: [],
                                total: paymentIntent.amount / 100
                            };
                        }

                        setOrderDetails(orderData);
                        // Extract shipping details immediately for UI
                        if (paymentIntent.shipping) {
                            setShippingAddress(paymentIntent.shipping);
                        }
                        
                        // RENDER SUCCESS IMMEDIATELY
                        logger.info("Payment verification successful, setting status to 'success'");
                        setPaymentStatusSafe('success');

                        // NON-BLOCKING: Geocode address in background
                        if (paymentIntent.shipping) {
                            const address = paymentIntent.shipping.address;
                            const addressString = `${address?.line1}, ${address?.city}, ${address?.state} ${address?.postal_code}, ${address?.country} `;
                            // SECURITY: Don't log addresses (PII) - removed debug log

                            // Do not await this
                            monitoredFetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addressString)}`, {
                                method: "GET",
                                label: "geocode-shipping-address",
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
                        const maxRetries = 10;
                        const retryDelay = 1000; // 1 second

                        const fetchOrderWithToken = async (): Promise<void> => {
                            try {
                                const response = await monitoredFetch(
                                    `${medusaUrl}/store/orders/by-payment-intent?payment_intent_id=${encodeURIComponent(paymentIntentId)}`,
                                    {
                                        method: "GET",
                                        headers: {
                                            "x-publishable-api-key": medusaPublishableKey,
                                        },
                                        label: "order-by-payment-intent",
                                    }
                                );

                                if (response.ok) {
                                    const data = await response.json() as OrderApiResponse;
                                    setOrderId(data.order.id);
                                    
                                    if (data.modification_token) {
                                        setModificationToken(data.modification_token);
                                        
                                        // Story 3.5: Set cookie via action to authorize modifications
                                        const formData = new FormData();
                                        formData.append("intent", "SET_MODIFICATION_TOKEN");
                                        formData.append("orderId", data.order.id);
                                        formData.append("token", data.modification_token);

                                        fetcher.submit(formData, { method: "POST" });
                                    }
                                    if (data.modification_window) {
                                        setModificationWindow(data.modification_window);
                                    }

                                    // SEC-05: Store in sessionStorage for ephemeral access (clears on tab close)
                                    try {
                                        sessionStorage.setItem('orderId', data.order.id);
                                    } catch (error) {
                                        // Non-critical: storage failures don't affect order processing
                                        // Errors can occur in private browsing mode or when storage is disabled
                                        logger.warn("Failed to store orderId in sessionStorage", {
                                            error: error instanceof Error ? error.message : String(error),
                                        });
                                    }
                                    // SECURITY: Don't log order IDs - removed debug log
                                } else if (response.status === 404 && retries < maxRetries) {
                                    // Order not yet created, retry
                                    retries++;
                                    // SECURITY: Don't log retry attempts (may expose order/payment context)
                                    setTimeout(fetchOrderWithToken, retryDelay);
                                } else {
                                    logger.error("Failed to fetch order", new Error(`HTTP ${response.status}`));
                                }
                            } catch (err) {
                                logger.error("Error fetching order", err instanceof Error ? err : new Error(String(err)));
                                if (retries < maxRetries) {
                                    retries++;
                                    setTimeout(fetchOrderWithToken, retryDelay);
                                }
                            }
                        };

                        // CHK-01: Call Medusa cart completion API
                        let cartIdFromSession: string | null = null;
                        try {
                            cartIdFromSession = sessionStorage.getItem('medusa_cart_id');
                        } catch (error) {
                            // Non-critical: storage access failures don't block cart completion
                            logger.warn("Failed to read medusa_cart_id from sessionStorage", {
                                error: error instanceof Error ? error.message : String(error),
                            });
                        }
                        if (cartIdFromSession) {
                            try {
                                // SECURITY: Don't log cart IDs or completion data
                                const completeResponse = await monitoredFetch(`/api/carts/${cartIdFromSession}/complete`, {
                                    method: "POST",
                                    headers: {
                                        "Content-Type": "application/json",
                                    },
                                    label: "complete-medusa-cart",
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
                        }

                        // Start fetching order
                        fetchOrderWithToken();

                        // Clear cart after a delay to ensure UI updates
                        setTimeout(() => {
                            clearCart();
                            // MED-3 FIX: Clean up cart ID but keep order data for refresh support
                            // Don't clear lastOrder and orderId - they're needed for page refresh
                            // They will be cleared on tab close (sessionStorage behavior) or on unmount
                            try {
                                sessionStorage.removeItem('medusa_cart_id');
                            } catch (error) {
                                // Non-critical: storage cleanup failures don't affect order processing
                                // Errors can occur in private browsing mode or when storage is disabled
                                logger.warn("Failed to cleanup cart ID from sessionStorage", {
                                    error: error instanceof Error ? error.message : String(error),
                                });
                            }
                        }, 500);
                    } else {
                        logger.error("Payment verification failed: Invalid payment intent status", new Error(`Invalid status: ${paymentIntent?.status}`), {
                            status: paymentIntent?.status,
                            validStatuses,
                            // Don't include paymentIntentId
                        });
                        setMessage(`Payment status: ${paymentIntent?.status}`);
                        setPaymentStatusSafe('error');
                    }
                } catch (error: any) {
                    logger.error("Payment verification failed: Exception during payment details fetch", error instanceof Error ? error : new Error(String(error)), {
                        redirectStatus,
                        errorMessage: error?.message,
                        errorName: error?.name,
                        // Don't include paymentIntentId or clientSecret
                    });
                    setMessage(`Error: ${error.message || "Payment processing failed"}`);
                    setPaymentStatusSafe('error');
                }
            } else {
                logger.error("Payment verification failed: Missing required params or redirect status not 'succeeded'", new Error("Invalid payment params"), {
                    redirectStatus,
                    hasPaymentIntentId: !!paymentIntentId,
                    hasClientSecret: !!paymentIntentClientSecret,
                    // Don't include paymentIntentId
                });
                setPaymentStatusSafe('error');
            }
        };

        fetchPaymentDetails();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [urlSanitized]);

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
                        to="/shop"
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
                    <h1 className="text-4xl font-serif text-text-earthy mb-2">Order Confirmed!</h1>
                    <p className="text-text-earthy/70 text-lg">Thank you for your purchase</p>
                </div>

                {/* Story 3.5: Modification Box on Success Page */}
                {orderId && modificationWindow?.status === "active" && (
                    <div className="bg-white rounded-lg shadow-lg p-4 mb-8 flex flex-col sm:flex-row items-center justify-between gap-4 border border-accent-earthy/20">
                        <div className="flex items-center gap-3">
                            <OrderTimer 
                                expiresAt={modificationWindow.expires_at}
                                serverTime={modificationWindow.server_time}
                                onExpire={() => setModificationWindow(prev => prev ? { ...prev, status: "expired" } : null)}
                            />
                        </div>
                        <OrderModificationDialogs 
                            orderId={orderId}
                            orderNumber={orderDetails?.orderNumber || ""}
                            currencyCode={orderDetails?.currency_code || "USD"}
                            items={orderDetails?.items || []}
                            currentAddress={shippingAddress ? {
                                first_name: shippingAddress.name?.split(' ')[0] || "",
                                last_name: shippingAddress.name?.split(' ').slice(1).join(' ') || "",
                                address_1: shippingAddress.address?.line1 || "",
                                address_2: shippingAddress.address?.line2 || "",
                                city: shippingAddress.address?.city || "",
                                province: shippingAddress.address?.state || "",
                                postal_code: shippingAddress.address?.postal_code || "",
                                country_code: shippingAddress.address?.country || "",
                            } : undefined}
                            onOrderUpdated={() => {}}
                            onAddressUpdated={() => {}}
                            onOrderCanceled={() => setPaymentStatusSafe('canceled')}
                        />
                    </div>
                )}

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
                                            <img src={item.image} alt={item.title} className="w-full h-full object-cover" />
                                        </div>
                                        <div className="flex-1">
                                            <h4 className="font-medium text-text-earthy">{item.title}</h4>
                                            {item.color && item.id !== 4 && (
                                                <p className="text-sm text-text-earthy/60">Color: {item.color}</p>
                                            )}
                                            {item.embroidery && (
                                                <p className="text-sm text-accent-earthy">✨ Custom Embroidery</p>
                                            )}
                                            <p className="text-sm text-text-earthy/60 mt-1">Qty: {item.quantity}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="font-medium text-accent-earthy">{item.price}</p>
                                            {item.originalPrice && (
                                                <p className="text-xs text-text-earthy/40 line-through">{item.originalPrice}</p>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Order Total */}
                        <div className="border-t border-gray-200 pt-4">
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-text-earthy/80">Subtotal</span>
                                <span className="text-text-earthy font-medium">${orderDetails?.subtotal?.toFixed(2) || orderDetails?.items.reduce((acc: number, item: any) => acc + parseFloat(item.price.replace('$', '')) * item.quantity, 0).toFixed(2)}</span>
                            </div>
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
                    </div>

                    {/* Shipping & Map Card */}
                    <div className="space-y-6">
                        {/* Shipping Address */}
                        <div className="bg-white rounded-lg shadow-lg p-8">
                            <div className="flex items-center gap-3 mb-4">
                                <MapPin className="w-6 h-6 text-accent-earthy" />
                                <h3 className="font-serif text-xl text-text-earthy">Delivery Address</h3>
                            </div>
                            {shippingAddress ? (
                                <div className="text-text-earthy/80">
                                    <p className="font-medium text-text-earthy">{shippingAddress.name}</p>
                                    <p>{shippingAddress.address?.line1}</p>
                                    {shippingAddress.address?.line2 && <p>{shippingAddress.address?.line2}</p>}
                                    <p>{shippingAddress.address?.city}, {shippingAddress.address?.state} {shippingAddress.address?.postal_code}</p>
                                    <p>{shippingAddress.address?.country}</p>
                                </div>
                            ) : (
                                <p className="text-text-earthy/60 italic">Loading address details...</p>
                            )}

                            {/* Map */}
                            {mapCoordinates && (
                                <div className="mt-6 rounded-lg overflow-hidden h-48 z-0 relative border border-gray-100">
                                    <Suspense fallback={<div className="h-full w-full bg-gray-100 animate-pulse flex items-center justify-center text-gray-400">Loading map...</div>}>
                                        {typeof window !== 'undefined' && <Map coordinates={mapCoordinates} />}
                                    </Suspense>
                                </div>
                            )}
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
            </div>


        </div>
    );
}
