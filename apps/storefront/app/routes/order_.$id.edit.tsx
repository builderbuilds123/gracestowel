/**
 * Order Edit Route
 *
 * Dedicated route for editing order details (address, shipping method)
 * within the modification window. Replaces the complex ?orderId flow
 * that reused the checkout page.
 *
 * Key differences from checkout:
 * - No cart context dependency
 * - No Stripe Elements (plain HTML forms)
 * - Standalone state management
 * - Simplified authentication (modification token only)
 *
 * @see docs/product/epics/order-modification-v2.md
 */
import { data, redirect } from "react-router";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { useLoaderData, useActionData, useNavigation, Link } from "react-router";
import { useState, useEffect } from "react";
import { ArrowLeft, AlertCircle, Package, Truck } from "../lib/icons";
import { getGuestToken, setGuestToken, clearGuestToken } from "../utils/guest-session.server";
import { medusaFetch } from "../lib/medusa-fetch";
import { getErrorDisplay } from "../utils/error-messages";
import { resolveCSRFSecret, validateCSRFToken, createCSRFToken } from "../utils/csrf.server";
import type { CloudflareEnv } from "../utils/monitored-fetch";

// Types
interface Address {
    first_name: string;
    last_name: string;
    address_1: string;
    address_2?: string;
    city: string;
    province?: string;
    postal_code: string;
    country_code: string;
    phone?: string;
}

interface ShippingOption {
    id: string;
    name: string;
    amount: number;
    price_type: string;
    provider_id: string;
}

interface ShippingMethod {
    id: string;
    shipping_option_id?: string;
    shipping_option?: {
        id: string;
        name: string;
    };
    amount: number;
    name?: string;
}

interface OrderItem {
    id: string;
    title: string;
    thumbnail?: string;
    quantity: number;
    unit_price: number;
    subtotal: number;
}

interface Order {
    id: string;
    display_id: number;
    email: string;
    currency_code: string;
    subtotal: number;
    shipping_total: number;
    tax_total: number;
    total: number;
    items: OrderItem[];
    shipping_address: Address;
    shipping_methods: ShippingMethod[];
    region_id: string;
}

interface LoaderData {
    order: Order;
    shippingOptions: ShippingOption[];
    currentShippingOptionId: string | null;
    csrfToken: string;
}

interface ActionData {
    success: boolean;
    error?: string;
    errorCode?: string;
    action?: string;
}

/**
 * Loader: Fetch order data and available shipping options
 */
export async function loader({ params, request, context }: LoaderFunctionArgs) {
    const { id } = params;
    const env = context.cloudflare.env as unknown as CloudflareEnv;

    // Check URL for token (from email link)
    const url = new URL(request.url);
    const urlToken = url.searchParams.get("token");

    // Get token from cookie or URL
    // guest_order_{orderId} cookie (path=/order, SameSite=Lax) is set by /api/set-guest-token
    const { token: cookieToken, source } = await getGuestToken(request, id!);
    const token = urlToken || cookieToken;

    if (!token) {
        // No auth - redirect to order status with error
        return redirect(`/order/status/${id}?error=TOKEN_REQUIRED`);
    }

    const headers: HeadersInit = {
        "x-modification-token": token,
    };

    // 1. Fetch order details
    const orderResponse = await medusaFetch(`/store/orders/${id}`, {
        method: "GET",
        headers,
        label: "order-edit-view",
        context,
    });

    if (!orderResponse.ok) {
        const status = orderResponse.status;
        if (status === 401 || status === 403) {
            // Auth failed - clear cookie and redirect
            const clearCookieHeader = await clearGuestToken(id!);
            return redirect(`/order/status/${id}?error=UNAUTHORIZED`, {
                headers: { "Set-Cookie": clearCookieHeader },
            });
        }
        if (status === 404) {
            return redirect(`/order/status/${id}?error=ORDER_NOT_FOUND`);
        }
        return redirect(`/order/status/${id}?error=EDIT_NOT_ALLOWED`);
    }

    const orderData = (await orderResponse.json()) as {
        order: Order;
        canEdit: boolean;
        modification?: {
            can_modify: boolean;
            remaining_seconds: number;
        };
    };

    // 2. Check if order can be edited
    if (!orderData.canEdit) {
        return redirect(`/order/status/${id}?error=EDIT_NOT_ALLOWED`);
    }

    // 3. Fetch shipping options for the region
    const shippingResponse = await medusaFetch(`/store/orders/${id}/shipping-options`, {
        method: "GET",
        headers,
        label: "order-edit-shipping-options",
        context,
    });

    let shippingOptions: ShippingOption[] = [];
    let currentShippingOptionId: string | null = null;

    if (shippingResponse.ok) {
        const shippingData = (await shippingResponse.json()) as {
            shipping_options: ShippingOption[];
            current_shipping_option_id: string | null;
        };
        shippingOptions = shippingData.shipping_options;
        currentShippingOptionId = shippingData.current_shipping_option_id;
    }

    // Generate CSRF token
    const { token: csrfToken, headers: csrfHeaders } = await createCSRFToken(request, undefined, env);

    // Build response headers - start with CSRF cookie headers
    const responseHeaders: HeadersInit = {};
    // Merge CSRF headers if present
    const csrfCookie = csrfHeaders.get("Set-Cookie");
    if (csrfCookie) {
        responseHeaders["Set-Cookie"] = csrfCookie;
    }

    // Set guest token cookie if token came from URL (first visit via magic link)
    if (source === "url" && urlToken) {
        const guestCookie = await setGuestToken(token, id!);
        // Combine cookies if both CSRF and guest token need to be set
        if (responseHeaders["Set-Cookie"]) {
            // Headers with same key need to be combined
            const existingCookie = responseHeaders["Set-Cookie"];
            responseHeaders["Set-Cookie"] = [existingCookie, guestCookie].join(", ");
        } else {
            responseHeaders["Set-Cookie"] = guestCookie;
        }
    }

    return data(
        {
            order: orderData.order,
            shippingOptions,
            currentShippingOptionId,
            csrfToken,
        } as LoaderData,
        { headers: responseHeaders }
    );
}

/**
 * Action: Handle form submission for address and shipping updates
 */
export async function action({ params, request, context }: ActionFunctionArgs) {
    const { id } = params;
    const env = context.cloudflare.env as unknown as CloudflareEnv;

    // CSRF Check
    const jwtSecret = resolveCSRFSecret(env.JWT_SECRET);
    if (!jwtSecret) {
        return data({ success: false, error: "Server configuration error" } as ActionData, { status: 500 });
    }
    const isValidCSRF = await validateCSRFToken(request, jwtSecret);
    if (!isValidCSRF) {
        return data({ success: false, error: "Invalid CSRF token" } as ActionData, { status: 403 });
    }

    // Get token from HttpOnly cookie
    const { token } = await getGuestToken(request, id!);

    if (!token) {
        return data({ success: false, error: "Session expired", errorCode: "TOKEN_EXPIRED" } as ActionData, { status: 401 });
    }

    const formData = await request.formData();
    const intent = formData.get("intent") as string;

    const headers: HeadersInit = {
        "Content-Type": "application/json",
        "x-modification-token": token,
    };

    try {
        if (intent === "UPDATE_ALL") {
            // Parse form data
            const address: Address = {
                first_name: formData.get("firstName") as string,
                last_name: formData.get("lastName") as string,
                address_1: formData.get("address1") as string,
                address_2: (formData.get("address2") as string) || undefined,
                city: formData.get("city") as string,
                province: (formData.get("province") as string) || undefined,
                postal_code: formData.get("postalCode") as string,
                country_code: formData.get("country") as string,
                phone: (formData.get("phone") as string) || undefined,
            };

            const newShippingOptionId = formData.get("shippingOptionId") as string;
            const currentShippingOptionId = formData.get("currentShippingOptionId") as string;

            // 1. Update address
            const addressResponse = await medusaFetch(`/store/orders/${id}/address`, {
                method: "POST",
                headers,
                body: JSON.stringify({ address }),
                label: "order-edit-address-update",
                context,
            });

            if (!addressResponse.ok) {
                const errorData = (await addressResponse.json()) as { message?: string; code?: string };
                if (addressResponse.status === 401 || addressResponse.status === 403) {
                    return data(
                        { success: false, error: errorData.message || "Authorization failed", errorCode: errorData.code },
                        { status: addressResponse.status, headers: { "Set-Cookie": await clearGuestToken(id!) } }
                    );
                }
                return data(
                    { success: false, error: errorData.message || "Failed to update address", errorCode: errorData.code },
                    { status: 400 }
                );
            }

            // 2. Update shipping method if changed
            if (newShippingOptionId && newShippingOptionId !== currentShippingOptionId) {
                const shippingResponse = await medusaFetch(`/store/orders/${id}/shipping-method`, {
                    method: "POST",
                    headers,
                    body: JSON.stringify({ shipping_option_id: newShippingOptionId }),
                    label: "order-edit-shipping-update",
                    context,
                });

                if (!shippingResponse.ok) {
                    const errorData = (await shippingResponse.json()) as { message?: string; code?: string };
                    // Address was updated but shipping failed - still report partial success
                    return data(
                        {
                            success: false,
                            error: `Address updated but shipping method change failed: ${errorData.message}`,
                            errorCode: errorData.code
                        },
                        { status: 400 }
                    );
                }
            }

            // Success - redirect to order status
            return redirect(`/order/status/${id}`);
        }

        return data({ success: false, error: "Unknown intent" } as ActionData, { status: 400 });
    } catch (error) {
        console.error("Order edit action error:", error);
        return data({ success: false, error: "An unexpected error occurred" } as ActionData, { status: 500 });
    }
}

/**
 * Order Edit Page Component
 */
export default function OrderEdit() {
    const { order, shippingOptions, currentShippingOptionId, csrfToken } = useLoaderData<LoaderData>();
    const actionData = useActionData<ActionData>();
    const navigation = useNavigation();
    const isSubmitting = navigation.state === "submitting";

    // Form state
    const [formData, setFormData] = useState({
        firstName: order.shipping_address?.first_name || "",
        lastName: order.shipping_address?.last_name || "",
        address1: order.shipping_address?.address_1 || "",
        address2: order.shipping_address?.address_2 || "",
        city: order.shipping_address?.city || "",
        province: order.shipping_address?.province || "",
        postalCode: order.shipping_address?.postal_code || "",
        country: order.shipping_address?.country_code || "us",
        phone: order.shipping_address?.phone || "",
        shippingOptionId: currentShippingOptionId || "",
    });

    const [errors, setErrors] = useState<Record<string, string>>({});

    // Validate form
    const validateForm = (): boolean => {
        const newErrors: Record<string, string> = {};

        if (!formData.firstName.trim()) newErrors.firstName = "First name is required";
        if (!formData.lastName.trim()) newErrors.lastName = "Last name is required";
        if (!formData.address1.trim()) newErrors.address1 = "Address is required";
        if (!formData.city.trim()) newErrors.city = "City is required";
        if (!formData.postalCode.trim()) newErrors.postalCode = "Postal code is required";
        if (!formData.country.trim()) newErrors.country = "Country is required";

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    // Calculate new shipping cost based on selection
    const selectedShippingOption = shippingOptions.find((opt) => opt.id === formData.shippingOptionId);
    const currentShippingCost = order.shipping_total;
    const newShippingCost = selectedShippingOption?.amount || currentShippingCost;
    const shippingDifference = newShippingCost - currentShippingCost;
    const newTotal = order.total + shippingDifference;

    // Format currency
    const formatPrice = (amount: number) => {
        return new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: order.currency_code.toUpperCase(),
        }).format(amount / 100);
    };

    return (
        <div className="min-h-screen bg-background-earthy py-8 px-4">
            <div className="max-w-4xl mx-auto">
                {/* Header with back link */}
                <div className="mb-8">
                    <Link
                        to={`/order/status/${order.id}`}
                        className="inline-flex items-center gap-2 text-accent-earthy hover:text-accent-earthy/80 transition-colors"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Back to Order Status
                    </Link>
                    <h1 className="text-3xl font-serif text-text-earthy mt-4">Edit Order #{order.display_id}</h1>
                    <p className="text-text-earthy/60 mt-2">Update your shipping address or delivery method.</p>
                </div>

                {/* Error display */}
                {actionData?.error && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                        <div className="flex items-start gap-3">
                            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                            <div>
                                <p className="text-red-800 font-medium">Update Failed</p>
                                <p className="text-red-700 text-sm mt-1">{actionData.error}</p>
                            </div>
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Main Form - 2 columns */}
                    <div className="lg:col-span-2">
                        <form
                            method="post"
                            onSubmit={(e) => {
                                if (!validateForm()) {
                                    e.preventDefault();
                                }
                            }}
                            className="space-y-6"
                        >
                            <input type="hidden" name="csrf_token" value={csrfToken} />
                            <input type="hidden" name="intent" value="UPDATE_ALL" />
                            <input type="hidden" name="currentShippingOptionId" value={currentShippingOptionId || ""} />

                            {/* Shipping Address */}
                            <div className="bg-white rounded-lg shadow p-6">
                                <h2 className="text-xl font-serif text-text-earthy mb-4 flex items-center gap-2">
                                    <Package className="w-5 h-5 text-accent-earthy" />
                                    Shipping Address
                                </h2>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label htmlFor="firstName" className="block text-sm font-medium text-text-earthy mb-1">
                                            First Name *
                                        </label>
                                        <input
                                            type="text"
                                            id="firstName"
                                            name="firstName"
                                            value={formData.firstName}
                                            onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                                            className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-earthy ${
                                                errors.firstName ? "border-red-500" : "border-gray-300"
                                            }`}
                                        />
                                        {errors.firstName && <p className="text-red-500 text-sm mt-1">{errors.firstName}</p>}
                                    </div>

                                    <div>
                                        <label htmlFor="lastName" className="block text-sm font-medium text-text-earthy mb-1">
                                            Last Name *
                                        </label>
                                        <input
                                            type="text"
                                            id="lastName"
                                            name="lastName"
                                            value={formData.lastName}
                                            onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                                            className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-earthy ${
                                                errors.lastName ? "border-red-500" : "border-gray-300"
                                            }`}
                                        />
                                        {errors.lastName && <p className="text-red-500 text-sm mt-1">{errors.lastName}</p>}
                                    </div>

                                    <div className="sm:col-span-2">
                                        <label htmlFor="address1" className="block text-sm font-medium text-text-earthy mb-1">
                                            Address *
                                        </label>
                                        <input
                                            type="text"
                                            id="address1"
                                            name="address1"
                                            value={formData.address1}
                                            onChange={(e) => setFormData({ ...formData, address1: e.target.value })}
                                            className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-earthy ${
                                                errors.address1 ? "border-red-500" : "border-gray-300"
                                            }`}
                                        />
                                        {errors.address1 && <p className="text-red-500 text-sm mt-1">{errors.address1}</p>}
                                    </div>

                                    <div className="sm:col-span-2">
                                        <label htmlFor="address2" className="block text-sm font-medium text-text-earthy mb-1">
                                            Apartment, suite, etc.
                                        </label>
                                        <input
                                            type="text"
                                            id="address2"
                                            name="address2"
                                            value={formData.address2}
                                            onChange={(e) => setFormData({ ...formData, address2: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-earthy"
                                        />
                                    </div>

                                    <div>
                                        <label htmlFor="city" className="block text-sm font-medium text-text-earthy mb-1">
                                            City *
                                        </label>
                                        <input
                                            type="text"
                                            id="city"
                                            name="city"
                                            value={formData.city}
                                            onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                                            className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-earthy ${
                                                errors.city ? "border-red-500" : "border-gray-300"
                                            }`}
                                        />
                                        {errors.city && <p className="text-red-500 text-sm mt-1">{errors.city}</p>}
                                    </div>

                                    <div>
                                        <label htmlFor="province" className="block text-sm font-medium text-text-earthy mb-1">
                                            State / Province
                                        </label>
                                        <input
                                            type="text"
                                            id="province"
                                            name="province"
                                            value={formData.province}
                                            onChange={(e) => setFormData({ ...formData, province: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-earthy"
                                        />
                                    </div>

                                    <div>
                                        <label htmlFor="postalCode" className="block text-sm font-medium text-text-earthy mb-1">
                                            Postal Code *
                                        </label>
                                        <input
                                            type="text"
                                            id="postalCode"
                                            name="postalCode"
                                            value={formData.postalCode}
                                            onChange={(e) => setFormData({ ...formData, postalCode: e.target.value })}
                                            className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-earthy ${
                                                errors.postalCode ? "border-red-500" : "border-gray-300"
                                            }`}
                                        />
                                        {errors.postalCode && <p className="text-red-500 text-sm mt-1">{errors.postalCode}</p>}
                                    </div>

                                    <div>
                                        <label htmlFor="country" className="block text-sm font-medium text-text-earthy mb-1">
                                            Country *
                                        </label>
                                        <select
                                            id="country"
                                            name="country"
                                            value={formData.country}
                                            onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                                            disabled
                                            className={`w-full px-3 py-2 border rounded-lg bg-gray-100 cursor-not-allowed ${
                                                errors.country ? "border-red-500" : "border-gray-300"
                                            }`}
                                        >
                                            <option value="us">United States</option>
                                            <option value="ca">Canada</option>
                                            <option value="gb">United Kingdom</option>
                                            <option value="au">Australia</option>
                                        </select>
                                        <p className="text-xs text-text-earthy/50 mt-1">Country cannot be changed</p>
                                    </div>

                                    <div className="sm:col-span-2">
                                        <label htmlFor="phone" className="block text-sm font-medium text-text-earthy mb-1">
                                            Phone
                                        </label>
                                        <input
                                            type="tel"
                                            id="phone"
                                            name="phone"
                                            value={formData.phone}
                                            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-earthy"
                                            placeholder="For delivery updates"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Shipping Method */}
                            {shippingOptions.length > 0 && (
                                <div className="bg-white rounded-lg shadow p-6">
                                    <h2 className="text-xl font-serif text-text-earthy mb-4 flex items-center gap-2">
                                        <Truck className="w-5 h-5 text-accent-earthy" />
                                        Shipping Method
                                    </h2>

                                    <div className="space-y-3">
                                        {shippingOptions.map((option) => {
                                            const isCurrent = option.id === currentShippingOptionId;
                                            const priceDiff = (option.amount || 0) - currentShippingCost;

                                            return (
                                                <label
                                                    key={option.id}
                                                    className={`flex items-center justify-between p-4 border rounded-lg cursor-pointer transition-colors ${
                                                        formData.shippingOptionId === option.id
                                                            ? "border-accent-earthy bg-accent-earthy/5"
                                                            : "border-gray-200 hover:border-gray-300"
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <input
                                                            type="radio"
                                                            name="shippingOptionId"
                                                            value={option.id}
                                                            checked={formData.shippingOptionId === option.id}
                                                            onChange={(e) =>
                                                                setFormData({ ...formData, shippingOptionId: e.target.value })
                                                            }
                                                            className="w-4 h-4 text-accent-earthy focus:ring-accent-earthy"
                                                        />
                                                        <div>
                                                            <p className="font-medium text-text-earthy">
                                                                {option.name}
                                                                {isCurrent && (
                                                                    <span className="ml-2 text-xs bg-gray-100 px-2 py-0.5 rounded">
                                                                        Current
                                                                    </span>
                                                                )}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="font-medium text-text-earthy">
                                                            {formatPrice(option.amount || 0)}
                                                        </p>
                                                        {!isCurrent && priceDiff !== 0 && (
                                                            <p
                                                                className={`text-xs ${
                                                                    priceDiff > 0 ? "text-red-600" : "text-green-600"
                                                                }`}
                                                            >
                                                                {priceDiff > 0 ? "+" : ""}
                                                                {formatPrice(priceDiff)}
                                                            </p>
                                                        )}
                                                    </div>
                                                </label>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Submit Button */}
                            <div className="flex gap-4">
                                <Link
                                    to={`/order/status/${order.id}`}
                                    className="flex-1 py-3 px-4 text-center border border-gray-300 text-text-earthy rounded-lg hover:bg-gray-50 transition-colors"
                                >
                                    Cancel
                                </Link>
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="flex-1 py-3 px-4 bg-accent-earthy text-white rounded-lg hover:bg-accent-earthy/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isSubmitting ? "Saving..." : "Save Changes"}
                                </button>
                            </div>
                        </form>
                    </div>

                    {/* Order Summary Sidebar */}
                    <div className="lg:col-span-1">
                        <div className="bg-white rounded-lg shadow p-6 sticky top-8">
                            <h2 className="text-xl font-serif text-text-earthy mb-4">Order Summary</h2>

                            {/* Items */}
                            <div className="space-y-3 mb-4 max-h-64 overflow-y-auto">
                                {order.items.map((item) => (
                                    <div key={item.id} className="flex gap-3">
                                        <div className="w-12 h-12 bg-gray-100 rounded overflow-hidden flex-shrink-0">
                                            {item.thumbnail && (
                                                <img src={item.thumbnail} alt={item.title} className="w-full h-full object-cover" />
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-text-earthy truncate">{item.title}</p>
                                            <p className="text-xs text-text-earthy/60">Qty: {item.quantity}</p>
                                        </div>
                                        <p className="text-sm font-medium text-text-earthy">{formatPrice(item.subtotal)}</p>
                                    </div>
                                ))}
                            </div>

                            {/* Totals */}
                            <div className="border-t border-gray-200 pt-4 space-y-2">
                                <div className="flex justify-between text-sm">
                                    <span className="text-text-earthy/70">Subtotal</span>
                                    <span className="text-text-earthy">{formatPrice(order.subtotal)}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-text-earthy/70">Shipping</span>
                                    <span className="text-text-earthy">
                                        {formatPrice(newShippingCost)}
                                        {shippingDifference !== 0 && (
                                            <span className={`ml-1 ${shippingDifference > 0 ? "text-red-600" : "text-green-600"}`}>
                                                ({shippingDifference > 0 ? "+" : ""}
                                                {formatPrice(shippingDifference)})
                                            </span>
                                        )}
                                    </span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-text-earthy/70">Tax</span>
                                    <span className="text-text-earthy">{formatPrice(order.tax_total)}</span>
                                </div>
                                <div className="flex justify-between font-serif text-lg pt-2 border-t border-gray-200">
                                    <span className="text-text-earthy">Total</span>
                                    <span className="text-text-earthy font-bold">{formatPrice(newTotal)}</span>
                                </div>
                            </div>

                            {/* Note about shipping change */}
                            {shippingDifference !== 0 && (
                                <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                                    <p className="text-xs text-amber-800">
                                        {shippingDifference > 0
                                            ? "Shipping cost will increase. The difference will be charged to your original payment method."
                                            : "Shipping cost will decrease. The difference will be refunded to your original payment method."}
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
