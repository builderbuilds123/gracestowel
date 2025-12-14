import { useEffect, useState, lazy, Suspense, useRef, useCallback } from "react";
import { Link, useSearchParams, useNavigate, useLoaderData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { CheckCircle2, Package, Truck, MapPin, XCircle } from "lucide-react";
import { useCart } from "../context/CartContext";
import { posts } from "../data/blogPosts";
import { getStripe, initStripe } from "../lib/stripe";
import { OrderTimer } from "../components/order/OrderTimer";
import { monitoredFetch } from "../utils/monitored-fetch";

// Lazy load Map component to avoid SSR issues with Leaflet
const Map = lazy(() => import("../components/Map.client"));

interface OrderApiResponse {
    order: {
        id: string;
        display_id: number;
        status: string;
        created_at: string;
        total: number;
        currency_code: string;
        items: Array<{
            id: string;
            title: string;
            quantity: number;
            unit_price: number;
            thumbnail?: string;
        }>;
        shipping_address?: {
            first_name: string;
            last_name: string;
            address_1: string;
            address_2?: string;
            city: string;
            province?: string;
            postal_code: string;
            country_code: string;
        };
    };
    modification_allowed: boolean;
    remaining_seconds: number;
}

interface LoaderData {
    stripePublishableKey: string;
    medusaBackendUrl: string;
    medusaPublishableKey: string;
}

export async function loader({ context }: LoaderFunctionArgs): Promise<LoaderData> {
    const env = context.cloudflare.env as {
        STRIPE_PUBLISHABLE_KEY: string;
        MEDUSA_BACKEND_URL: string;
        MEDUSA_PUBLISHABLE_KEY: string;
    };
    return {
        stripePublishableKey: env.STRIPE_PUBLISHABLE_KEY,
        medusaBackendUrl: env.MEDUSA_BACKEND_URL,
        medusaPublishableKey: env.MEDUSA_PUBLISHABLE_KEY,
    };
}

export default function CheckoutSuccess() {
    const { stripePublishableKey, medusaBackendUrl, medusaPublishableKey } = useLoaderData<LoaderData>();
    const [searchParams] = useSearchParams();
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
    const [modificationToken, setModificationToken] = useState<string | null>(null);
    const [orderId, setOrderId] = useState<string | null>(null);
    const [remainingSeconds, setRemainingSeconds] = useState<number>(0);
    const [modificationAllowed, setModificationAllowed] = useState<boolean>(false);


    // Ref to track processed payment intent to prevent double-firing
    const processedRef = useRef<string | null>(null);

    useEffect(() => {
        const paymentIntentId = searchParams.get('payment_intent');
        const paymentIntentClientSecret = searchParams.get('payment_intent_client_secret');
        const redirectStatus = searchParams.get('redirect_status');

        // Prevent double processing
        if (processedRef.current === paymentIntentId) {
            return;
        }

        const fetchPaymentDetails = async () => {
            console.log("Checkout Success Params:", {
                redirectStatus,
                paymentIntentId,
            });
            const paymentIntentClientSecret = new URLSearchParams(window.location.search).get(
                "payment_intent_client_secret"
            );

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
                    console.log("Retrieving payment intent...");
                    const { paymentIntent, error } = await stripe.retrievePaymentIntent(paymentIntentClientSecret);
                    console.log("Payment Intent retrieved:", paymentIntent);
                    console.log("Error retrieved:", error);

                    if (error) {
                        console.error("Stripe retrieval error:", error);
                        setMessage(`Stripe Error: ${error.message}`);
                        setPaymentStatus('error');
                        return;
                    }

                    // With manual capture mode, status will be 'requires_capture' (authorized but not captured)
                    // or 'succeeded' (already captured after 1-hour window)
                    const validStatuses = ['succeeded', 'requires_capture'];
                    if (paymentIntent && validStatuses.includes(paymentIntent.status)) {
                        // Extract shipping details
                        if (paymentIntent.shipping) {
                            console.log("Shipping details found:", paymentIntent.shipping);
                            setShippingAddress(paymentIntent.shipping);

                            // Geocode address
                            const address = paymentIntent.shipping.address;
                            const addressString = `${address?.line1}, ${address?.city}, ${address?.state} ${address?.postal_code}, ${address?.country} `;
                            console.log("Geocoding address:", addressString);

                            try {
                                const response = await monitoredFetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addressString)}`, {
                                    method: "GET",
                                    label: "geocode-shipping-address",
                                });
                                const data = await response.json() as any[];
                                console.log("Geocoding response:", data);
                                if (Array.isArray(data) && data.length > 0) {
                                    const coords: [number, number] = [parseFloat(data[0].lat), parseFloat(data[0].lon)];
                                    console.log("Setting map coordinates:", coords);
                                    setMapCoordinates(coords);
                                } else {
                                    console.warn("No geocoding results found");
                                }
                            } catch (error) {
                                console.error("Geocoding error:", error);
                            }
                        } else {
                            console.warn("No shipping details in payment intent");
                        }

                        // Handle Order Details Logic (Persistence)
                        // Always try to recover from localStorage first since we save it before redirect
                        const savedOrder = localStorage.getItem('lastOrder');
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
                        setPaymentStatus('success');

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
                                    const data = await response.json() as {
                                        order: { id: string };
                                        modification_token: string;
                                        remaining_seconds: number;
                                        modification_allowed: boolean;
                                    };
                                    setOrderId(data.order.id);
                                    setModificationToken(data.modification_token);
                                    setRemainingSeconds(data.remaining_seconds);
                                    setModificationAllowed(data.modification_allowed);

                                    // Store in localStorage for persistence
                                    localStorage.setItem('orderId', data.order.id);
                                    localStorage.setItem('modificationToken', data.modification_token);

                                    console.log("Order fetched with modification token:", {
                                        orderId: data.order.id,
                                        allowed: data.modification_allowed,
                                        remainingSeconds: data.remaining_seconds
                                    });
                                } else if (response.status === 404 && retries < maxRetries) {
                                    // Order not yet created, retry
                                    retries++;
                                    console.log(`Order not found, retrying (${retries}/${maxRetries})...`);
                                    setTimeout(fetchOrderWithToken, retryDelay);
                                } else {
                                    console.error("Failed to fetch order:", await response.text());
                                }
                            } catch (err) {
                                console.error("Error fetching order:", err);
                                if (retries < maxRetries) {
                                    retries++;
                                    setTimeout(fetchOrderWithToken, retryDelay);
                                }
                            }
                        };

                        // Start fetching order
                        fetchOrderWithToken();

                        // Clear cart after a delay to ensure UI updates
                        setTimeout(() => {
                            clearCart();
                        }, 500);
                    } else {
                        console.error("Payment status not valid:", paymentIntent?.status);
                        setMessage(`Payment status: ${paymentIntent?.status}`);
                        setPaymentStatus('error');
                    }
                } catch (error: any) {
                    console.error("Error fetching payment details:", error);
                    setMessage(`Error: ${error.message || JSON.stringify(error)}`);
                    setPaymentStatus('error');
                }
            } else {
                console.error("Missing required params or redirect status not succeeded");
                setPaymentStatus('error');
            }
        };

        fetchPaymentDetails();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams]);

    // Handle timer expiration
    const handleTimerExpire = useCallback(() => {
        setModificationAllowed(false);
        setRemainingSeconds(0);
    }, []);

    // Handlers for OrderModificationDialogs are now inline or simplified


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
                        <p>Status: {searchParams.get('redirect_status')}</p>
                        <p>Intent ID: {searchParams.get('payment_intent')}</p>
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

                {/* Modification Window Banner */}
                {modificationAllowed && remainingSeconds > 0 && orderId && modificationToken && (
                    <div className="bg-white rounded-lg shadow-lg p-4 mb-6 flex flex-col sm:flex-row items-center justify-between gap-4 border border-accent-earthy/20">
                        <div className="flex items-center gap-3">
                            <OrderTimer
                                expiresAt={new Date(Date.now() + remainingSeconds * 1000).toISOString()}
                                serverTime={new Date().toISOString()} // Approx for immediate post-checkout
                                onExpire={handleTimerExpire}
                            />
                        </div>
                        {/* Link to order status page for modifications (uses cookie-based auth) */}
                        <a
                            href={`/order/status/${orderId}?token=${modificationToken}`}
                            className="px-4 py-2 bg-accent-earthy text-white rounded-lg hover:bg-accent-earthy/90 transition-colors text-sm font-medium"
                        >
                            Manage Order
                        </a>
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
                            <div className="flex justify-between items-center">
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
