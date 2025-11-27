import { useEffect, useState, lazy, Suspense, useRef } from "react";
import { Link, useSearchParams } from "react-router";
import { CheckCircle2, Package, Truck, ArrowRight, MapPin } from "lucide-react";
import { useCart } from "../context/CartContext";
import { loadStripe } from "@stripe/stripe-js";
import { posts } from "../data/blogPosts";
import { getStripe } from "../lib/stripe";

// Lazy load Map component to avoid SSR issues with Leaflet
const Map = lazy(() => import("../components/Map.client"));

export default function CheckoutSuccess() {
    const [searchParams] = useSearchParams();
    const { clearCart, items } = useCart();
    const [paymentStatus, setPaymentStatus] = useState<'loading' | 'success' | 'error'>('loading');
    const [message, setMessage] = useState<string | null>(null);
    const [orderDetails, setOrderDetails] = useState<any>(null);
    const [shippingAddress, setShippingAddress] = useState<any>(null);
    const [mapCoordinates, setMapCoordinates] = useState<[number, number] | null>(null);

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

                    if (paymentIntent && paymentIntent.status === 'succeeded') {
                        // Extract shipping details
                        if (paymentIntent.shipping) {
                            console.log("Shipping details found:", paymentIntent.shipping);
                            setShippingAddress(paymentIntent.shipping);

                            // Geocode address
                            const address = paymentIntent.shipping.address;
                            const addressString = `${address?.line1}, ${address?.city}, ${address?.state} ${address?.postal_code}, ${address?.country} `;
                            console.log("Geocoding address:", addressString);

                            try {
                                const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addressString)}`);
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

                        // Clear cart after a delay to ensure UI updates
                        setTimeout(() => {
                            clearCart();
                        }, 500);
                    } else {
                        console.error("Payment status not succeeded:", paymentIntent?.status);
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

    return (
        <div className="min-h-screen bg-background-earthy py-12 px-4">
            <div className="max-w-3xl mx-auto">
                {/* Success Header */}
                <div className="text-center mb-12">
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
