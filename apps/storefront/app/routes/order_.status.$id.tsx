import { data, Link } from "react-router";
import type { CloudflareEnv } from "../utils/monitored-fetch";
import { useLoaderData, useNavigate, useActionData, useFetcher } from "react-router";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { useState, useEffect, lazy, Suspense } from "react";
import { Package, Truck, AlertCircle, MapPin, Loader2 } from "../lib/icons";
import { CancelOrderDialog } from "../components/CancelOrderDialog";
import { CancelRejectedModal } from "../components/order/CancelRejectedModal";
import { getGuestToken, setGuestToken, clearGuestToken } from "../utils/guest-session.server";
import { medusaFetch } from "../lib/medusa-fetch";
import { createLogger } from "../lib/logger";
import { getErrorDisplay } from "../utils/error-messages";
import { posts } from "../data/blogPosts";
import { Image } from "../components/ui/Image";
import { resolveCSRFSecret, validateCSRFToken } from "../utils/csrf.server";

// Lazy load Map component to avoid SSR issues with Leaflet
const Map = lazy(() => import("../components/Map.client"));

interface LoaderData {
    order?: any;
    token?: string;
    authMethod?: "customer_session" | "guest_token" | "none";
    canEdit?: boolean;
    needsAuth?: boolean;
    orderId?: string;
    error?: string;
    errorCode?: string;
    message?: string;
    modification_window?: {
        status: "active" | "expired";
        expires_at: string;
        server_time: string;
        remaining_seconds: number;
    };
    env: {
        STRIPE_PUBLISHABLE_KEY: string;
    }
}

interface ErrorData {
    error: string;
    message: string;
}

/**
 * Story 2.4: Detect auth method in order status loader
 */
export async function loader({ params, request, context }: LoaderFunctionArgs) {
    const { id } = params;
    const env = context.cloudflare.env as unknown as CloudflareEnv;

    // Check URL for token (from email link) and error codes
    const url = new URL(request.url);
    const urlToken = url.searchParams.get("token");
    const errorCode = url.searchParams.get("error");

    // Check for existing guest token in cookie
    const { token: cookieToken, source } = await getGuestToken(request, id!);

    // Determine auth method and build headers
    let authHeaders: HeadersInit = {};
    let authMethod: "customer_session" | "guest_token" | "none" = "none";

    if (urlToken || cookieToken) {
        const token = urlToken || cookieToken;
        authHeaders["x-modification-token"] = token!;
        authMethod = "guest_token";
    }

    // Fetch order with appropriate auth
    const response = await medusaFetch(`/store/orders/${id}`, {
        method: "GET",
        headers: authHeaders,
        label: "order-view",
        context,
    });

    if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
            const errorDisplay = getErrorDisplay("UNAUTHORIZED");
            if (authMethod === "guest_token") {
                const clearCookieHeader = await clearGuestToken(id!);
                return data(
                    {
                        needsAuth: true,
                        orderId: id,
                        error: "UNAUTHORIZED",
                        errorCode: "UNAUTHORIZED",
                        message: errorDisplay.message,
                        env: { STRIPE_PUBLISHABLE_KEY: env.STRIPE_PUBLISHABLE_KEY }
                    } as LoaderData,
                    {
                        status: 401,
                        headers: { "Set-Cookie": clearCookieHeader }
                    }
                );
            }
            return data({
                needsAuth: true,
                orderId: id,
                error: "UNAUTHORIZED",
                errorCode: "UNAUTHORIZED",
                message: errorDisplay.message,
                env: { STRIPE_PUBLISHABLE_KEY: env.STRIPE_PUBLISHABLE_KEY }
            } as LoaderData, { status: 401 });
        }
        throw new Response("Order Not Found", { status: 404 });
    }

    const responseData = await response.json() as {
        order: any;
        authMethod: string;
        canEdit: boolean;
        modification?: {
            can_modify: boolean;
            remaining_seconds: number;
            expires_at: string;
        };
    };

    // Build response headers
    const responseHeaders: HeadersInit = {};

    if (authMethod === "guest_token" && source === 'url') {
        const token = urlToken || cookieToken;
        if (token) {
            responseHeaders["Set-Cookie"] = await setGuestToken(token, id!);
        }
    }

    const modification_window = responseData.modification
        ? {
            status: responseData.modification.can_modify ? "active" as const : "expired" as const,
            expires_at: responseData.modification.expires_at,
            server_time: new Date().toISOString(),
            remaining_seconds: responseData.modification.remaining_seconds,
        }
        : undefined;

    const errorDisplay = errorCode ? getErrorDisplay(errorCode) : null;

    return data({
        order: responseData.order,
        authMethod: responseData.authMethod,
        canEdit: responseData.canEdit,
        modification_window,
        errorCode: errorCode || undefined,
        env: {
            STRIPE_PUBLISHABLE_KEY: env.STRIPE_PUBLISHABLE_KEY
        }
    } as LoaderData, { headers: responseHeaders });
}

/**
 * Action: Handle order cancellation
 */
export async function action({ params, request, context }: ActionFunctionArgs) {
    const { id } = params;
    const env = context.cloudflare.env as any;

    // CSRF Check
    const jwtSecret = resolveCSRFSecret(env.JWT_SECRET);
    if (!jwtSecret) {
        return data({ error: "Server configuration error" }, { status: 500 });
    }
    const isValidCSRF = await validateCSRFToken(request, jwtSecret);
    if (!isValidCSRF) {
        return data({ error: "Invalid CSRF token" }, { status: 403 });
    }

    // Get token from HttpOnly cookie
    const { token } = await getGuestToken(request, id!);

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

            const response = await medusaFetch(`/store/orders/${id}/cancel`, {
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
                        { status: response.status, headers: { "Set-Cookie": await clearGuestToken(id!) } }
                    );
                }
                return data({
                    success: false,
                    error: errorData.message || "Failed to cancel order",
                    errorCode: errorData.code
                }, { status: response.status === 409 ? 409 : 400 });
            }

            return data({ success: true, action: "canceled" });
        }

        return data({ success: false, error: "Unknown intent" }, { status: 400 });
    } catch (error) {
        const logger = createLogger({ context: "order-status-action" });
        logger.error("Action error", error instanceof Error ? error : new Error(String(error)));
        return data({ success: false, error: "An unexpected error occurred" }, { status: 500 });
    }
}

/**
 * Geocode address to coordinates using Nominatim
 */
async function geocodeAddress(address: any): Promise<[number, number] | null> {
    if (!address) return null;

    const addressString = [
        address.address_1,
        address.city,
        address.province,
        address.postal_code,
        address.country_code?.toUpperCase()
    ].filter(Boolean).join(", ");

    try {
        const response = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addressString)}`,
            {
                method: "GET",
                headers: {
                    "User-Agent": "Grace's Towel E-Commerce/1.0 (https://gracestowel.com)",
                },
            }
        );

        const data = await response.json() as any[];
        if (Array.isArray(data) && data.length > 0) {
            return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
        }
    } catch {
        // Silently fail - geocoding is non-critical
    }

    return null;
}

export default function OrderStatus() {
    const loaderData = useLoaderData<LoaderData | ErrorData>();
    const navigate = useNavigate();
    const fetcher = useFetcher<{ success: boolean; action?: string; error?: string; errorCode?: string }>();

    const [showCancelDialog, setShowCancelDialog] = useState(false);
    const [showCancelRejectedModal, setShowCancelRejectedModal] = useState(false);
    const [mapCoordinates, setMapCoordinates] = useState<[number, number] | null>(null);

    // Handle needsAuth case
    if ('needsAuth' in loaderData && loaderData.needsAuth) {
        const errorDisplay = getErrorDisplay(loaderData.errorCode || loaderData.error);

        return (
            <div className="min-h-screen bg-background-earthy flex items-center justify-center p-4">
                <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
                    <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <AlertCircle className="w-8 h-8 text-amber-600" />
                    </div>
                    <h1 className="text-2xl font-serif text-text-earthy mb-2">{errorDisplay.title}</h1>
                    <p className="text-text-earthy/70 mb-3">{errorDisplay.message}</p>
                    {errorDisplay.action && (
                        <p className="text-sm text-text-earthy/60 mb-6">{errorDisplay.action}</p>
                    )}
                    <div className="flex gap-4 justify-center">
                        <button
                            onClick={() => navigate('/account/login')}
                            className="bg-accent-earthy text-white px-6 py-2 rounded-lg hover:bg-accent-earthy/90"
                        >
                            Sign In
                        </button>
                        <button
                            onClick={() => navigate('/')}
                            className="bg-gray-200 text-text-earthy px-6 py-2 rounded-lg hover:bg-gray-300"
                        >
                            Go Home
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // Handle legacy error format
    if ('error' in loaderData && !('order' in loaderData)) {
        const errorDisplay = getErrorDisplay(loaderData.error);

        return (
            <div className="min-h-screen bg-background-earthy flex items-center justify-center p-4">
                <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
                    <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <AlertCircle className="w-8 h-8 text-red-600" />
                    </div>
                    <h1 className="text-2xl font-serif text-text-earthy mb-2">{errorDisplay.title}</h1>
                    <p className="text-text-earthy/70 mb-3">{errorDisplay.message}</p>
                    {errorDisplay.action && (
                        <p className="text-sm text-text-earthy/60 mb-6">{errorDisplay.action}</p>
                    )}
                    <button
                        onClick={() => window.location.reload()}
                        className="bg-accent-earthy text-white px-6 py-2 rounded-lg hover:bg-accent-earthy/90"
                    >
                        Request New Link
                    </button>
                </div>
            </div>
        );
    }

    const { order, modification_window, canEdit, errorCode } = loaderData as LoaderData;
    const errorDisplay = errorCode ? getErrorDisplay(errorCode) : null;

    if (!order) {
        return (
            <div className="min-h-screen bg-background-earthy flex items-center justify-center p-4">
                <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
                    <AlertCircle className="w-16 h-16 text-red-600 mx-auto mb-4" />
                    <h1 className="text-2xl font-serif text-text-earthy mb-2">Order Not Found</h1>
                </div>
            </div>
        );
    }

    const shippingAddress = order.shipping_address;
    const isModificationActive = modification_window?.status === "active" || canEdit === true;
    const isCanceling = fetcher.state !== "idle";

    // Geocode address on mount
    useEffect(() => {
        if (shippingAddress && !mapCoordinates) {
            geocodeAddress(shippingAddress).then(coords => {
                if (coords) setMapCoordinates(coords);
            });
        }
    }, [shippingAddress, mapCoordinates]);

    // Handle cancel action result
    useEffect(() => {
        if (fetcher.data) {
            if (fetcher.data.success && fetcher.data.action === "canceled") {
                setShowCancelDialog(false);
                navigate("/");
            } else if (fetcher.data.errorCode === "order_shipped") {
                setShowCancelDialog(false);
                setShowCancelRejectedModal(true);
            }
        }
    }, [fetcher.data, navigate]);

    const handleCancelOrder = async () => {
        fetcher.submit(
            { intent: "CANCEL_ORDER", reason: "Customer requested cancellation" },
            { method: "POST" }
        );
    };

    // Format price with currency
    const formatPrice = (amount: number) => {
        return new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: order.currency_code?.toUpperCase() || "USD",
        }).format(amount);
    };

    return (
        <div className="min-h-screen bg-background-earthy py-12 px-4">
            <div className="max-w-3xl mx-auto">
                {/* Header - "We're on it!" */}
                <div className="text-center mb-8">
                    <div className="w-20 h-20 bg-accent-earthy/10 rounded-full flex items-center justify-center mx-auto mb-6">
                        <Loader2 className="w-10 h-10 text-accent-earthy animate-spin" />
                    </div>
                    <h1 className="text-4xl font-serif text-text-earthy mb-2">We're on it!</h1>
                    <p className="text-text-earthy/70 text-lg">Order #{order.display_id}</p>
                </div>

                {/* Error Display */}
                {errorDisplay && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-6 mb-6">
                        <h2 className="text-lg font-medium text-red-800 mb-2">{errorDisplay.title}</h2>
                        <p className="text-red-700 mb-3">{errorDisplay.message}</p>
                        {errorDisplay.action && (
                            <p className="text-sm text-red-600">{errorDisplay.action}</p>
                        )}
                    </div>
                )}

                {/* Action Buttons */}
                {isModificationActive && (
                    <div className="bg-white rounded-lg shadow-lg p-4 mb-6 flex flex-col sm:flex-row items-center justify-between gap-4 border border-accent-earthy/20">
                        <p className="text-sm text-text-earthy">
                            You can modify this order until it ships.
                        </p>
                        <div className="flex gap-3">
                            <Link
                                to={`/order/${order.id}/edit`}
                                className="px-6 py-2 bg-accent-earthy text-white rounded-lg hover:bg-accent-earthy/90 transition-colors font-medium"
                            >
                                Edit Order
                            </Link>
                            <button
                                onClick={() => setShowCancelDialog(true)}
                                disabled={isCanceling}
                                className="px-6 py-2 text-red-600 border border-red-300 rounded-lg hover:bg-red-50 transition-colors font-medium disabled:opacity-50"
                            >
                                Cancel Order
                            </button>
                        </div>
                    </div>
                )}

                {!isModificationActive && (
                    <div className="bg-gray-100 rounded-lg p-4 mb-6 text-center text-text-earthy/60">
                        Order is being processed. Modifications are no longer available.
                    </div>
                )}

                {/* Two-Column Layout */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    {/* Order Details Card */}
                    <div className="bg-white rounded-lg shadow-lg p-8">
                        <div className="border-b border-gray-200 pb-6 mb-6">
                            <div className="flex justify-between items-start">
                                <div>
                                    <h2 className="text-sm text-text-earthy/60 mb-1">Order Number</h2>
                                    <p className="text-2xl font-semibold text-text-earthy">#{order.display_id}</p>
                                </div>
                                <div className="text-right">
                                    <h2 className="text-sm text-text-earthy/60 mb-1">Order Date</h2>
                                    <p className="text-lg text-text-earthy">
                                        {new Date(order.created_at).toLocaleDateString('en-US', {
                                            year: 'numeric',
                                            month: 'long',
                                            day: 'numeric'
                                        })}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Order Items */}
                        <div className="mb-6">
                            <h3 className="font-serif text-xl text-text-earthy mb-4">Order Items</h3>
                            <div className="space-y-4">
                                {order.items?.map((item: any) => (
                                    <div key={item.id} className="flex gap-4">
                                        <div className="w-20 h-20 bg-card-earthy/30 rounded-md overflow-hidden flex-shrink-0">
                                            {item.thumbnail && (
                                                <Image
                                                    src={item.thumbnail}
                                                    alt={item.title}
                                                    width={80}
                                                    height={80}
                                                    className="w-full h-full object-cover"
                                                />
                                            )}
                                        </div>
                                        <div className="flex-1">
                                            <h4 className="font-medium text-text-earthy">{item.title}</h4>
                                            {item.variant_title && (
                                                <p className="text-sm text-text-earthy/60">{item.variant_title}</p>
                                            )}
                                            <p className="text-sm text-text-earthy/60 mt-1">Qty: {item.quantity}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="font-medium text-accent-earthy">
                                                {formatPrice(item.unit_price * item.quantity)}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Order Total */}
                        <div className="border-t border-gray-200 pt-4">
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-text-earthy/80">Subtotal</span>
                                <span className="text-text-earthy font-medium">
                                    {formatPrice(order.subtotal || order.items?.reduce((acc: number, item: any) => acc + item.unit_price * item.quantity, 0) || 0)}
                                </span>
                            </div>

                            {order.discount_total > 0 && (
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-text-earthy/80">Discount</span>
                                    <span className="text-green-600 font-medium">
                                        -{formatPrice(order.discount_total)}
                                    </span>
                                </div>
                            )}

                            <div className="flex justify-between items-center mb-4">
                                <span className="text-text-earthy/80">Shipping</span>
                                <span className="text-text-earthy font-medium">
                                    {order.shipping_total === 0 ? 'Free' : formatPrice(order.shipping_total || 0)}
                                </span>
                            </div>

                            <div className="flex justify-between items-center pt-2 border-t border-gray-100">
                                <span className="font-serif text-lg text-text-earthy">Total</span>
                                <span className="font-bold text-2xl text-accent-earthy">
                                    {formatPrice(order.total)}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Shipping & What's Next Column */}
                    <div className="space-y-6">
                        {/* Shipping Address */}
                        <div className="bg-white rounded-lg shadow-lg p-8">
                            <div className="flex items-center gap-3 mb-4">
                                <MapPin className="w-6 h-6 text-accent-earthy" />
                                <h3 className="font-serif text-xl text-text-earthy">Delivery Address</h3>
                            </div>
                            {shippingAddress ? (
                                <div className="text-text-earthy/80">
                                    <p className="font-medium text-text-earthy">
                                        {shippingAddress.first_name} {shippingAddress.last_name}
                                    </p>
                                    <p>{shippingAddress.address_1}</p>
                                    {shippingAddress.address_2 && <p>{shippingAddress.address_2}</p>}
                                    <p>
                                        {shippingAddress.city}
                                        {shippingAddress.province && `, ${shippingAddress.province}`} {shippingAddress.postal_code}
                                    </p>
                                    <p>{shippingAddress.country_code?.toUpperCase()}</p>
                                    {shippingAddress.phone && (
                                        <p className="mt-2 text-sm">{shippingAddress.phone}</p>
                                    )}
                                </div>
                            ) : (
                                <p className="text-text-earthy/60 italic">No shipping address</p>
                            )}

                            {/* Map */}
                            {mapCoordinates && (
                                <div className="mt-6 rounded-lg overflow-hidden h-48 z-0 relative border border-gray-100">
                                    <Suspense fallback={
                                        <div className="h-full w-full bg-gray-100 animate-pulse flex items-center justify-center text-gray-400">
                                            Loading map...
                                        </div>
                                    }>
                                        <Map coordinates={mapCoordinates} />
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
                                        <p className="text-sm text-text-earthy/70">
                                            We'll send you an email confirmation with your order details shortly.
                                        </p>
                                    </div>
                                </div>
                                <div className="flex gap-4">
                                    <div className="w-10 h-10 bg-accent-earthy/10 rounded-full flex items-center justify-center flex-shrink-0">
                                        <Truck className="w-5 h-5 text-accent-earthy" />
                                    </div>
                                    <div>
                                        <h4 className="font-medium text-text-earthy mb-1">Shipping Updates</h4>
                                        <p className="text-sm text-text-earthy/70">
                                            We'll notify you when your order ships. Estimated delivery: 3-5 business days.
                                        </p>
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
                            <Link
                                key={post.id}
                                to={`/blog/${post.id}`}
                                className="group block bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all"
                            >
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

                {/* Cancel Dialog */}
                <CancelOrderDialog
                    isOpen={showCancelDialog}
                    onClose={() => setShowCancelDialog(false)}
                    onConfirm={handleCancelOrder}
                    orderNumber={String(order.display_id)}
                />

                {/* Cancel Rejected Modal */}
                <CancelRejectedModal
                    isOpen={showCancelRejectedModal}
                    onClose={() => setShowCancelRejectedModal(false)}
                />
            </div>
        </div>
    );
}
