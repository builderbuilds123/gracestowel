import { data } from "react-router";
import { useLoaderData, useRevalidator } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { useState, useCallback } from "react";
import { CheckCircle2, MapPin, Package, Truck, AlertCircle } from "lucide-react";
import { OrderTimer } from "../components/order/OrderTimer";
import { OrderModificationDialogs } from "../components/order/OrderModificationDialogs";

interface LoaderData {
    order: any;
    modification_window: {
        status: "active" | "expired";
        expires_at: string;
        server_time: string;
        remaining_seconds: number;
    };
    token: string;
    medusaBackendUrl: string;
    medusaPublishableKey: string;
    env: {
        STRIPE_PUBLISHABLE_KEY: string;
    }
}

interface ErrorData {
    error: string;
    message: string;
}

export async function loader({ params, request, context }: LoaderFunctionArgs) {
    const { id } = params;
    const url = new URL(request.url);
    const token = url.searchParams.get("token");
    const env = context.cloudflare.env as any;
    const medusaBackendUrl = env.MEDUSA_BACKEND_URL;
    const medusaPublishableKey = env.MEDUSA_PUBLISHABLE_KEY;

    if (!token) {
        // No token? Maybe redirect to login or show generic lookup
        throw new Response("Missing Access Token", { status: 401 });
    }

    // specific guest-view endpoint
    const response = await fetch(`${medusaBackendUrl}/store/orders/${id}/guest-view?token=${token}`, {
        headers: {
            "x-publishable-api-key": medusaPublishableKey,
        }
    });

    if (response.status === 401 || response.status === 403) {
        // Token expired, invalid, or mismatched
        const errorResp = await response.json() as any;
        if (errorResp.code === "TOKEN_EXPIRED") {
             // Render "Request new link" UI
             return data({ error: "TOKEN_EXPIRED", message: "This link has expired" } as ErrorData, { status: 403 });
        }
        if (errorResp.code === "TOKEN_MISMATCH") {
             // Token is for a different order - redirect to error (prevent order enumeration)
             throw new Response("Invalid Access Link", { status: 403 });
        }
        // TOKEN_INVALID or other 401/403 errors
        throw new Response("Unauthorized", { status: 401 });
    }

    if (!response.ok) {
        throw new Response("Order Not Found", { status: 404 });
    }

    const responseData = await response.json() as { order: any; modification_window: any };

    return data({
        order: responseData.order,
        modification_window: responseData.modification_window,
        token,
        medusaBackendUrl,
        medusaPublishableKey,
        env: {
            STRIPE_PUBLISHABLE_KEY: env.STRIPE_PUBLISHABLE_KEY
        }
    } as LoaderData);
}

export default function OrderStatus() {
    const loaderData = useLoaderData<LoaderData | ErrorData>();
    const revalidator = useRevalidator();
    
    // Handle Token Expired View
    if ('error' in loaderData) {
         return (
            <div className="min-h-screen bg-background-earthy flex items-center justify-center p-4">
                <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
                    <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <AlertCircle className="w-8 h-8 text-red-600" />
                    </div>
                    <h1 className="text-2xl font-serif text-text-earthy mb-2">Link Expired</h1>
                    <p className="text-text-earthy/70 mb-6">
                        This modification link has expired for security reasons.
                    </p>
                    <button 
                        onClick={() => window.location.reload()} // Placeholder for "Resend Link" flow
                        className="bg-accent-earthy text-white px-6 py-2 rounded-lg hover:bg-accent-earthy/90"
                    >
                        Request New Link
                    </button>
                </div>
            </div>
         );
    }
    
    const { order, modification_window, token, medusaBackendUrl, medusaPublishableKey } = loaderData as LoaderData;
    const [orderDetails, setOrderDetails] = useState(order);
    const [shippingAddress, setShippingAddress] = useState(order.shipping_address);
    const isModificationActive = modification_window.status === "active";

    // Callbacks to update local state
    const handleOrderUpdate = (newTotal?: number) => {
        if(newTotal) {
             // In a real app we might revalidate to get fresh items
             revalidator.revalidate();
        }
    };
    
    const handleExpire = useCallback(() => {
        // When timer expires, force revalidation to update server state/UI
        revalidator.revalidate();
    }, [revalidator]);

    return (
        <div className="min-h-screen bg-background-earthy py-12 px-4">
            <div className="max-w-3xl mx-auto">
                <div className="text-center mb-8">
                     <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                        <CheckCircle2 className="w-12 h-12 text-green-600" />
                    </div>
                    <h1 className="text-3xl font-serif text-text-earthy mb-2">Order Status</h1>
                    <p className="text-text-earthy/70">Order #{orderDetails.display_id}</p>
                </div>

                {isModificationActive && (
                    <div className="bg-white rounded-lg shadow-lg p-4 mb-6 flex flex-col sm:flex-row items-center justify-between gap-4 border border-accent-earthy/20">
                         <div className="flex items-center gap-3">
                             <OrderTimer 
                                expiresAt={modification_window.expires_at}
                                serverTime={modification_window.server_time}
                                onExpire={handleExpire}
                             />
                         </div>
                         <OrderModificationDialogs 
                            orderId={orderDetails.id}
                            token={token}
                            orderNumber={orderDetails.display_id}
                            currencyCode={orderDetails.currency_code}
                            currentAddress={shippingAddress}
                            medusaBackendUrl={medusaBackendUrl}
                            medusaPublishableKey={medusaPublishableKey}
                            onOrderUpdated={handleOrderUpdate}
                            onAddressUpdated={setShippingAddress}
                            onOrderCanceled={() => window.location.reload()}
                         />
                    </div>
                )}

                {!isModificationActive && (
                     <div className="bg-gray-100 rounded-lg p-4 mb-6 text-center text-text-earthy/60 flex items-center justify-center gap-2">
                         <CheckCircle2 className="w-5 h-5" />
                         <span>Order is being processed. Modifications are no longer available.</span>
                     </div>
                )}

                {/* Display Read-Only Order Details (Masked) */}
                <div className="bg-white rounded-lg shadow-lg p-8 mb-6">
                    <h3 className="font-serif text-xl text-text-earthy mb-4">Order Summary</h3>
                    <div className="space-y-4">
                         {orderDetails.items?.map((item: any) => (
                             <div key={item.id} className="flex gap-4 border-b border-gray-100 pb-4 last:border-0">
                                 <div className="w-16 h-16 bg-gray-100 rounded overflow-hidden">
                                     {item.thumbnail && <img src={item.thumbnail} alt={item.title} className="w-full h-full object-cover"/>}
                                 </div>
                                 <div className="flex-1">
                                     <p className="font-medium text-text-earthy">{item.title}</p>
                                     <p className="text-sm text-text-earthy/60">Qty: {item.quantity}</p>
                                 </div>
                                 <div className="text-right">
                                     <p className="font-medium">{(item.unit_price / 100).toFixed(2)} {orderDetails.currency_code.toUpperCase()}</p>
                                 </div>
                             </div>
                         ))}
                    </div>
                    <div className="mt-4 pt-4 border-t border-gray-200 flex justify-between items-center">
                        <span className="font-serif text-lg">Total</span>
                        <span className="font-bold text-xl">{(orderDetails.total / 100).toFixed(2)} {orderDetails.currency_code.toUpperCase()}</span>
                    </div>
                </div>

                <div className="bg-white rounded-lg shadow-lg p-8">
                     <h3 className="font-serif text-xl text-text-earthy mb-4 flex items-center gap-2">
                        <MapPin className="w-5 h-5 text-accent-earthy" />
                        Shipping To
                     </h3>
                     {shippingAddress ? (
                         <div className="text-text-earthy/80">
                             <p className="font-medium">{shippingAddress.last_name}</p>
                             <p>{shippingAddress.country_code?.toUpperCase()}</p>
                             <p className="text-xs text-text-earthy/50 mt-2 italic">* Personal details masked for security</p>
                         </div>
                     ) : (
                         <p className="italic text-text-earthy/60">No shipping address</p>
                     )}
                </div>
            </div>
        </div>
    );
}
