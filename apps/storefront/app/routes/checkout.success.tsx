import { useEffect, useLayoutEffect, useState, lazy, Suspense, useRef } from "react";
import { Link, useNavigate, useLoaderData, redirect } from "react-router";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { CheckCircle2, Package, Truck, MapPin, XCircle } from "lucide-react";
import { useCart } from "../context/CartContext";
import { posts } from "../data/blogPosts";
import { getStripe, initStripe } from "../lib/stripe";
import { monitoredFetch } from "../utils/monitored-fetch";
import { createLogger } from "../lib/logger";

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

const serializeParamsCookie = (params: PaymentParams): string =>
    `${CHECKOUT_PARAMS_COOKIE}=${encodeURIComponent(JSON.stringify(params))}; Max-Age=600; Path=/; SameSite=Strict; Secure; HttpOnly`;

const clearParamsCookie = (): string =>
    `${CHECKOUT_PARAMS_COOKIE}=; Max-Age=0; Path=/; SameSite=Strict; Secure; HttpOnly`;

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
        return redirect(`${url.origin}${url.pathname}`, { headers });
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
    const [paymentStatus, setPaymentStatus] = useState<'loading' | 'success' | 'error' | 'canceled'>('loading');

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

    // MED-1 FIX: Cleanup checkout data when component unmounts (user navigates away)
    useEffect(() => {
        return () => {
            // SEC-05 AC2: Clean up checkout data on unmount (navigation away from success page)
            try {
                sessionStorage.removeItem('lastOrder');
                sessionStorage.removeItem('orderId');
                // MED-3 FIX: Also clean up cart ID to prevent lingering session data on navigate-away
                sessionStorage.removeItem('medusa_cart_id');
            } catch (error) {
                // Non-critical: storage cleanup failures don't affect navigation
                // Errors can occur in private browsing mode or when storage is disabled
                const logger = createLogger();
                logger.warn("Failed to cleanup sessionStorage on unmount", error instanceof Error ? error : new Error(String(error)));
            }
        };
    }, []);

    useEffect(() => {
        if (!urlSanitized) return;
        const paymentIntentId = initialParamsRef.current?.paymentIntentId;
        const paymentIntentClientSecret = initialParamsRef.current?.paymentIntentClientSecret;
        const redirectStatus = initialParamsRef.current?.redirectStatus;

        // Prevent double processing
        if (processedRef.current === paymentIntentId) {
            return;
        }

        const fetchPaymentDetails = async () => {
            // SECURITY: Don't log sensitive payment data (paymentIntentId, clientSecret)
            // Debug logs removed to prevent sensitive data exposure
            if (!paymentIntentClientSecret) {
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

            if (redirectStatus === 'succeeded' && paymentIntentId && paymentIntentClientSecret) {
                processedRef.current = paymentIntentId; // Mark as processed

                try {
                    // SECURITY: Don't log client secret or payment intent object
                    const { paymentIntent, error } = await stripe.retrievePaymentIntent(paymentIntentClientSecret);

                    if (error) {
                        // Use existing logger for errors (without sensitive data)
                        const logger = createLogger();
                        const errorObj = error instanceof Error ? error : new Error(error.message || String(error));
                        logger.error("Stripe retrieval error", errorObj, {
                            redirectStatus,
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
                        let savedOrder: string | null = null;
                        let savedOrderId: string | null = null;

                        try {
                            savedOrder = sessionStorage.getItem('lastOrder');
                            savedOrderId = sessionStorage.getItem('orderId');
                        } catch (error) {
                            // sessionStorage may be disabled (private browsing, storage disabled)
                            // Continue with migration from localStorage as fallback
                            const logger = createLogger();
                            logger.warn("sessionStorage access failed, attempting localStorage migration", error instanceof Error ? error : new Error(String(error)));
                        }

                        // Migration path: check localStorage for legacy data
                        if (!savedOrder) {
                            try {
                                const legacyOrder = localStorage.getItem('lastOrder');
                                if (legacyOrder) {
                                    // Migrate to sessionStorage
                                    try {
                                        sessionStorage.setItem('lastOrder', legacyOrder);
                                        localStorage.removeItem('lastOrder'); // Clean up old storage
                                        savedOrder = legacyOrder;
                                    } catch (error) {
                                        // Migration failed (sessionStorage full or disabled)
                                        // Use localStorage value directly as fallback
                                        savedOrder = legacyOrder;
                                        const logger = createLogger();
                                        logger.warn("Failed to migrate lastOrder to sessionStorage, using localStorage value", error instanceof Error ? error : new Error(String(error)));
                                    }
                                }
                            } catch (error) {
                                // localStorage access failed - continue without saved order
                                const logger = createLogger();
                                logger.warn("localStorage access failed during migration", error instanceof Error ? error : new Error(String(error)));
                            }
                        }

                        // Migration path: orderId legacy cleanup
                        if (!savedOrderId) {
                            try {
                                const legacyOrderId = localStorage.getItem('orderId');
                                if (legacyOrderId) {
                                    try {
                                        sessionStorage.setItem('orderId', legacyOrderId);
                                        localStorage.removeItem('orderId');
                                        savedOrderId = legacyOrderId;
                                    } catch (error) {
                                        // Migration failed, use localStorage value as fallback
                                        savedOrderId = legacyOrderId;
                                        const logger = createLogger();
                                        logger.warn("Failed to migrate orderId to sessionStorage, using localStorage value", error instanceof Error ? error : new Error(String(error)));
                                    }
                                }
                            } catch (error) {
                                // localStorage access failed - continue without saved orderId
                                const logger = createLogger();
                                logger.warn("localStorage access failed during orderId migration", error instanceof Error ? error : new Error(String(error)));
                            }
                        } else {
                            // Even if already in sessionStorage, ensure legacy localStorage copy is cleaned up
                            try {
                                localStorage.removeItem('orderId');
                            } catch (error) {
                                // Non-critical: localStorage cleanup failure
                                const logger = createLogger();
                                logger.warn("Failed to cleanup legacy orderId from localStorage", error instanceof Error ? error : new Error(String(error)));
                            }
                        }

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
                        setPaymentStatus('success');

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

                                    // SEC-05: Store in sessionStorage for ephemeral access (clears on tab close)
                                    try {
                                        sessionStorage.setItem('orderId', data.order.id);
                                    } catch (error) {
                                        // Non-critical: storage failures don't affect order processing
                                        // Errors can occur in private browsing mode or when storage is disabled
                                        const logger = createLogger();
                                        logger.warn("Failed to store orderId in sessionStorage", error instanceof Error ? error : new Error(String(error)));
                                    }

                                    // SECURITY: Don't log order IDs - removed debug log
                                } else if (response.status === 404 && retries < maxRetries) {
                                    // Order not yet created, retry
                                    retries++;
                                    // SECURITY: Don't log retry attempts (may expose order/payment context)
                                    setTimeout(fetchOrderWithToken, retryDelay);
                                } else {
                                    const logger = createLogger();
                                    logger.error("Failed to fetch order", new Error(`HTTP ${response.status}`));
                                }
                            } catch (err) {
                                const logger = createLogger();
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
                            const logger = createLogger();
                            logger.warn("Failed to read medusa_cart_id from sessionStorage", error instanceof Error ? error : new Error(String(error)));
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
                                    const logger = createLogger();
                                    logger.error("Medusa cart completion failed", new Error("Cart completion failed"), {
                                        status: completeResponse.status,
                                    });
                                    // Non-critical failure: log and proceed, webhook should eventually create order
                                }
                            } catch (err) {
                                const logger = createLogger();
                                logger.error("Error calling cart completion API", err instanceof Error ? err : new Error(String(err)));
                                // Non-critical failure: log and proceed
                            }
                        }

                        // Start fetching order
                        fetchOrderWithToken();

                        // Clear cart after a delay to ensure UI updates
                        setTimeout(() => {
                            clearCart();
                            // SEC-05 AC2: Explicit cleanup of checkout data
                            // Defense-in-depth: clear order data after successful checkout
                            // (sessionStorage also clears on tab close, this is extra protection)
                            try {
                                sessionStorage.removeItem('lastOrder');
                                sessionStorage.removeItem('orderId');
                                // MED-3 FIX: Also clean up cart ID to prevent lingering session data
                                sessionStorage.removeItem('medusa_cart_id');
                            } catch (error) {
                                // Non-critical: storage cleanup failures don't affect order processing
                                // Errors can occur in private browsing mode or when storage is disabled
                                const logger = createLogger();
                                logger.warn("Failed to cleanup sessionStorage", error instanceof Error ? error : new Error(String(error)));
                            }
                        }, 500);
                    } else {
                        const logger = createLogger();
                        logger.error("Payment status not valid", new Error(`Invalid status: ${paymentIntent?.status}`), {
                            status: paymentIntent?.status,
                            // Don't include paymentIntentId
                        });
                        setMessage(`Payment status: ${paymentIntent?.status}`);
                        setPaymentStatus('error');
                    }
                } catch (error: any) {
                    const logger = createLogger();
                    logger.error("Error fetching payment details", error instanceof Error ? error : new Error(String(error)), {
                        redirectStatus,
                        // Don't include paymentIntentId or clientSecret
                    });
                    setMessage(`Error: ${error.message || "Payment processing failed"}`);
                    setPaymentStatus('error');
                }
            } else {
                const logger = createLogger();
                logger.error("Missing required params or redirect status not succeeded", new Error("Invalid payment params"), {
                    redirectStatus,
                    // Don't include paymentIntentId
                });
                setPaymentStatus('error');
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
