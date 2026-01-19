import { data } from "react-router";
import { validateCSRFToken } from "../utils/csrf.server";
import { useLoaderData, useRevalidator, useNavigate, useActionData, useSubmit } from "react-router";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { useState, useCallback, useEffect } from "react";
import { CheckCircle2, MapPin, Package, Truck, AlertCircle } from "lucide-react";
import { OrderTimer } from "../components/order/OrderTimer";
import { OrderModificationDialogs } from "../components/order/OrderModificationDialogs";
import { getGuestToken, setGuestToken, clearGuestToken } from "../utils/guest-session.server";
import { medusaFetch } from "../lib/medusa-fetch";

interface LoaderData {
    order: any;
    token: string;
    modification_window: {
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

export async function loader({ params, request, context }: LoaderFunctionArgs) {
    const { id } = params;
    const env = context.cloudflare.env as any;
    const medusaBackendUrl = env.MEDUSA_BACKEND_URL;
    const medusaPublishableKey = env.MEDUSA_PUBLISHABLE_KEY;

    // Story 4-3: Cookie-first token retrieval
    const { token, source } = await getGuestToken(request, id!);

    if (!token) {
        // No token in cookie or URL
        throw new Response("Missing Access Token", { status: 401 });
    }

    // Call backend with token in header (preferred method per Story 4-2)
    const response = await medusaFetch(`/store/orders/${id}/guest-view`, {
        method: "GET",
        headers: {
            "x-modification-token": token,
        },
        label: "order-guest-view",
        context,
    });

    if (response.status === 401 || response.status === 403) {
        // Token expired, invalid, or mismatched - clear cookie
        const clearCookieHeader = await clearGuestToken(id!);
        const errorResp = await response.json() as any;
        
        if (errorResp.code === "TOKEN_EXPIRED") {
            // Return error data with Clear-Cookie header
            return data(
                { error: "TOKEN_EXPIRED", message: "This link has expired" } as ErrorData,
                { 
                    status: 403,
                    headers: { "Set-Cookie": clearCookieHeader }
                }
            );
        }
        if (errorResp.code === "TOKEN_MISMATCH") {
            throw new Response("Invalid Access Link", { 
                status: 403,
                headers: { "Set-Cookie": clearCookieHeader }
            });
        }
        // TOKEN_INVALID or other 401/403 errors
        throw new Response("Unauthorized", { 
            status: 401,
            headers: { "Set-Cookie": clearCookieHeader }
        });
    }

    if (!response.ok) {
        throw new Response("Order Not Found", { status: 404 });
    }

    const responseData = await response.json() as { order: any; modification_window: any };

    // Build response headers
    const responseHeaders: HeadersInit = {};
    
    // Story 4-3: Set cookie if token came from URL (first visit via magic link)
    if (source === 'url') {
        responseHeaders["Set-Cookie"] = await setGuestToken(token, id!);
    }

    return data({
        order: responseData.order,
        modification_window: responseData.modification_window,
        env: {
            STRIPE_PUBLISHABLE_KEY: env.STRIPE_PUBLISHABLE_KEY
        }
    } as LoaderData, { headers: responseHeaders });
}

/**
 * Remix Action: Handle order modifications server-side
 * Token is read from HttpOnly cookie (not passed from client)
 * 
 * Intents:
 * - CANCEL_ORDER: Cancel the order
 * - UPDATE_ADDRESS: Update shipping address
 * - ADD_ITEMS: Add line items (future)
 */
export async function action({ params, request, context }: ActionFunctionArgs) {
    const { id } = params;
    const env = context.cloudflare.env as any;
    const medusaBackendUrl = env.MEDUSA_BACKEND_URL;
    const medusaPublishableKey = env.MEDUSA_PUBLISHABLE_KEY;

    // CSRF Check
    const jwtSecret = env.JWT_SECRET || "dev-secret-key";
    const isValidCSRF = await validateCSRFToken(request, jwtSecret);
    if (!isValidCSRF) {
        return data({ error: "Invalid CSRF token" }, { status: 403 });
    }

    // Get token from HttpOnly cookie (secure - not accessible to client JS)
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
                // Clear cookie on auth errors
                if (response.status === 401 || response.status === 403) {
                    return data(
                        { success: false, error: errorData.message || "Authorization failed" },
                        { status: response.status, headers: { "Set-Cookie": await clearGuestToken(id!) } }
                    );
                }
                return data({ success: false, error: errorData.message || "Failed to cancel order", errorCode: errorData.code }, { status: response.status === 409 ? 409 : 400 });
            }

            return data({ success: true, action: "canceled" });
        }

        if (intent === "UPDATE_ADDRESS") {
            const address = JSON.parse(formData.get("address") as string);
            
            const response = await medusaFetch(`/store/orders/${id}/address`, {
                method: "POST",
                headers,
                body: JSON.stringify({ address }),
                label: "order-address-update",
                context,
            });

            if (!response.ok) {
                const errorData = await response.json() as { message?: string };
                if (response.status === 401 || response.status === 403) {
                    return data(
                        { success: false, error: errorData.message || "Authorization failed" },
                        { status: response.status, headers: { "Set-Cookie": await clearGuestToken(id!) } }
                    );
                }
                return data({ success: false, error: errorData.message || "Failed to update address" }, { status: 400 });
            }

            return data({ success: true, action: "address_updated", address });
        }

        if (intent === "UPDATE_QUANTITY") {
            let updates: Array<{ item_id: string; quantity: number }>;
            try {
                const updateData = JSON.parse(formData.get("items") as string);
                if (!Array.isArray(updateData) || !updateData.every(item => 
                    item && typeof item.item_id === 'string' && typeof item.quantity === 'number'
                )) {
                    return data({ success: false, error: "Invalid updates format." }, { status: 400 });
                }
                updates = updateData;
            } catch {
                return data({ success: false, error: "Invalid updates format." }, { status: 400 });
            }

            if (updates.length === 0) {
                return data({ success: false, error: "No changes to save" }, { status: 400 });
            }

            // Story 15: Migration to Order Edit API
            let itemsUpdated = 0;

            for (const update of updates) {
                // /store/orders/:id/edit/items/:item_id
                const response = await medusaFetch(`/store/orders/${id}/edit/items/${update.item_id}`, {
                    method: "POST",
                    headers,
                    body: JSON.stringify({ quantity: update.quantity }),
                    label: "order-edit-update-quantity",
                    context,
                });

                if (!response.ok) {
                    const errorData = await response.json() as { message?: string };
                    return data({ success: false, error: errorData.message || "Failed to update item", itemsUpdated }, { status: 400 });
                }
                itemsUpdated++;
            }

            // After all updates, attempt to auto-confirm (or check if payment needed)
            const confirmRes = await medusaFetch(`/store/orders/${id}/edit/confirm`, {
                method: "POST",
                headers,
                label: "order-edit-confirm",
                context,
            });

            if (!confirmRes.ok) {
                const errorData = await confirmRes.json() as { message?: string };
                 return data({ success: false, error: errorData.message || "Failed to confirm changes" }, { status: 400 });
            }

            const confirmData = await confirmRes.json() as { status: string; payment_collection?: any };
            
            if (confirmData.status === "payment_required") {
                return data({ 
                    success: true, 
                    action: "payment_required", 
                    payment_collection: confirmData.payment_collection 
                });
            }

            return data({ success: true, action: "items_updated", itemsUpdated });
        }

        if (intent === "ADD_ITEMS") {
            let items: Array<{ variant_id: string; quantity: number }>;
            try {
                const itemsData = JSON.parse(formData.get("items") as string);
                if (!Array.isArray(itemsData) || !itemsData.every(item => 
                    item && typeof item.variant_id === 'string' && typeof item.quantity === 'number'
                )) {
                    return data({ success: false, error: "Invalid items format." }, { status: 400 });
                }
                items = itemsData;
            } catch {
                return data({ success: false, error: "Invalid items format." }, { status: 400 });
            }
            
            if (items.length === 0) {
                return data({ success: false, error: "No items to add" }, { status: 400 });
            }

            let itemsAdded = 0;
            
            for (const item of items) {
                const response = await medusaFetch(`/store/orders/${id}/edit/items`, {
                    method: "POST",
                    headers,
                    body: JSON.stringify({ variant_id: item.variant_id, quantity: item.quantity }),
                    label: "order-edit-add-item",
                    context,
                });

                if (!response.ok) {
                    const errorData = await response.json() as { message?: string };
                    return data({ success: false, error: errorData.message || "Failed to add item", itemsAdded }, { status: 400 });
                }
                itemsAdded++;
            }

            // Confirm
            const confirmRes = await medusaFetch(`/store/orders/${id}/edit/confirm`, {
                method: "POST",
                headers,
                label: "order-edit-confirm",
                context,
            });

            if (!confirmRes.ok) {
                const errorData = await confirmRes.json() as { message?: string };
                 return data({ success: false, error: errorData.message || "Failed to confirm changes" }, { status: 400 });
            }

            const confirmData = await confirmRes.json() as { status: string; payment_collection?: any };
            
            if (confirmData.status === "payment_required") {
                return data({ 
                    success: true, 
                    action: "payment_required", 
                    payment_collection: confirmData.payment_collection 
                });
            }

            return data({ success: true, action: "items_added", itemsAdded });
        }

        if (intent === "CONFIRM_EDIT") {
            const confirmRes = await medusaFetch(`/store/orders/${id}/edit/confirm`, {
                method: "POST",
                headers,
                label: "order-edit-auto-confirm",
                context,
            });

            if (!confirmRes.ok) {
                const errorData = await confirmRes.json() as { message?: string };
                 return data({ success: false, error: errorData.message || "Failed to confirm changes" }, { status: 400 });
            }

            return data({ success: true, action: "items_updated" });
        }

        return data({ success: false, error: "Unknown intent" }, { status: 400 });
    } catch (error) {
        // Structured logging - only log error message, not full object
        console.error("Action error:", error instanceof Error ? error.message : "Unknown error");
        return data({ success: false, error: "An unexpected error occurred" }, { status: 500 });
    }
}

export default function OrderStatus() {
    const loaderData = useLoaderData<LoaderData | ErrorData>();
    const revalidator = useRevalidator();
    const navigate = useNavigate();
    
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
    
    const { order, modification_window } = loaderData as LoaderData;
    const [orderDetails, setOrderDetails] = useState(order);
    const [shippingAddress, setShippingAddress] = useState(order.shipping_address);
    const isModificationActive = modification_window.status === "active";
    const submit = useSubmit();
    const actionData = useActionData<any>();

    // Handle automatic confirmation after successful payment redirect
    useEffect(() => {
        const url = new URL(window.location.href);
        if (url.searchParams.get("payment_success") === "true") {
            // Remove the query param to prevent multiple submissions
            url.searchParams.delete("payment_success");
            window.history.replaceState({}, "", url.pathname + url.search);
            
            // Confirm the order edit
            submit({ intent: "CONFIRM_EDIT" }, { method: "POST" });
        }
    }, [submit]);

    // Handle generic action success (like auto-confirm)
    useEffect(() => {
        if (actionData?.success) {
            revalidator.revalidate();
        }
    }, [actionData, revalidator]);

    // Callbacks to update local state
    const handleOrderUpdate = (newTotal?: number) => {
        // Story 6.4 Fix: Always revalidate after item add to refresh totals
        // Even if newTotal is undefined, we need fresh data from server
        revalidator.revalidate();
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
                            orderNumber={orderDetails.display_id}
                            currencyCode={orderDetails.currency_code}
                            items={orderDetails.items}
                            currentAddress={shippingAddress}
                            token={loaderData.token}
                            stripePublishableKey={loaderData.env?.STRIPE_PUBLISHABLE_KEY || ""}
                            onOrderUpdated={handleOrderUpdate}
                            onAddressUpdated={setShippingAddress}
                            onOrderCanceled={() => navigate("/")}
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
