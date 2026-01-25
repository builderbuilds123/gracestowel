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
import { useLoaderData, useActionData, useNavigation, Link, useRevalidator, useNavigate } from "react-router";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { ArrowLeft, AlertCircle, Package, Truck, X, Plus, Minus } from "../lib/icons";
import { OrderQuickAddDialog } from "../components/order/OrderQuickAddDialog";
import { getGuestToken, setGuestToken, clearGuestToken } from "../utils/guest-session.server";
import { medusaFetch } from "../lib/medusa-fetch";
import { getErrorDisplay } from "../utils/error-messages";
import { resolveCSRFSecret, validateCSRFToken, createCSRFToken } from "../utils/csrf.server";
import type { CloudflareEnv } from "../utils/monitored-fetch";
import { createLogger } from "../lib/logger";

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
    variant_id: string;
    thumbnail?: string;
    quantity: number;
    unit_price: number;
    subtotal: number;
}

interface PromoCode {
    code: string;
    amount: number;
}

/**
 * Pending item added locally but not yet saved to server.
 * Used for batch modification flow.
 */
export interface PendingItem {
    id: string; // Temporary client-side ID (e.g., `pending_${variantId}_${timestamp}`)
    variantId: string;
    productTitle: string;
    variantTitle?: string;
    thumbnail?: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
}

/**
 * Tracks quantity changes for existing confirmed line items.
 * Positive delta = increase quantity, negative delta = decrease quantity.
 */
interface QuantityChange {
    lineItemId: string;
    variantId: string;
    originalQuantity: number;
    newQuantity: number;
    unitPrice: number;
}

/**
 * Combined display item for rendering both confirmed and pending items
 * in a unified list with visual distinction.
 */
interface DisplayItem {
    id: string;
    title: string;
    variantId: string;
    variantTitle?: string;
    thumbnail?: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
    status: 'confirmed' | 'pending';
}

interface Order {
    id: string;
    display_id: number;
    email: string;
    currency_code: string;
    subtotal: number;
    shipping_total: number;
    tax_total: number;
    discount_total: number;
    total: number;
    items: OrderItem[];
    shipping_address: Address;
    shipping_methods: ShippingMethod[];
    region_id: string;
    promo_codes?: PromoCode[];
}

interface LoaderData {
    order: Order;
    shippingOptions: ShippingOption[];
    currentShippingOptionId: string | null;
    csrfToken: string;
    modificationToken: string;
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
    const logger = createLogger({ context: "order-edit-loader" });
    const { id } = params;
    const env = context.cloudflare.env as unknown as CloudflareEnv;

    // Log all cookies received
    const cookieHeader = request.headers.get("Cookie");
    logger.info("[ORDER-EDIT] Loader called", {
        orderId: id,
        hasCookieHeader: !!cookieHeader,
        cookieHeaderLength: cookieHeader?.length,
        // Log cookie names only (not values for security)
        cookieNames: cookieHeader?.split(";").map(c => c.trim().split("=")[0]).join(", "),
    });

    // Check URL for token (from email link)
    const url = new URL(request.url);
    const urlToken = url.searchParams.get("token");

    // Get token from cookie or URL
    // guest_order_{orderId} cookie (path=/order, SameSite=strict) is set by /api/set-guest-token
    const { token: cookieToken, source } = await getGuestToken(request, id!);

    logger.info("[ORDER-EDIT] Token sources", {
        orderId: id,
        hasUrlToken: !!urlToken,
        hasCookieToken: !!cookieToken,
        source,
        expectedCookieName: `guest_order_${id}`,
    });

    const token = urlToken || cookieToken;

    if (!token) {
        // No auth - redirect to order status with error
        logger.warn("[ORDER-EDIT] No token found, redirecting", { orderId: id });
        return redirect(`/order/status/${id}?error=TOKEN_REQUIRED`);
    }

    logger.info("[ORDER-EDIT] Token found, proceeding", {
        orderId: id,
        tokenSource: urlToken ? "url" : "cookie",
        tokenLength: token.length,
        tokenPrefix: token.substring(0, 50),
        tokenSuffix: token.substring(token.length - 20),
    });

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

    logger.info("[ORDER-EDIT] Backend response", {
        orderId: id,
        status: orderResponse.status,
        ok: orderResponse.ok,
    });

    if (!orderResponse.ok) {
        const status = orderResponse.status;
        // Try to get error body for debugging
        let errorBody: unknown;
        try {
            errorBody = await orderResponse.clone().json();
        } catch {
            errorBody = await orderResponse.clone().text();
        }
        logger.error("[ORDER-EDIT] Backend error", new Error(`Status ${status}`), {
            orderId: id,
            status,
            errorBody,
        });

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
        order_state?: {
            display_status: string;
            can_edit: boolean;
            message: string | null;
        };
        modification?: {
            can_modify: boolean;
            remaining_seconds: number;
        };
    };

    // 2. Check if order can be edited using order_state (if available) or legacy canEdit
    const canEditOrder = orderData.order_state?.can_edit ?? orderData.canEdit;
    if (!canEditOrder) {
        // Redirect with specific error based on display_status
        const displayStatus = orderData.order_state?.display_status;
        if (displayStatus === "delivered") {
            return redirect(`/order/status/${id}?error=ORDER_DELIVERED`);
        } else if (displayStatus === "shipped") {
            return redirect(`/order/status/${id}?error=ORDER_SHIPPED`);
        } else if (displayStatus === "canceled") {
            return redirect(`/order/status/${id}?error=ORDER_CANCELED`);
        } else if (displayStatus === "processing") {
            return redirect(`/order/status/${id}?error=PAYMENT_CAPTURED`);
        }
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
            modificationToken: token,
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
    const logger = createLogger({ context: "order-edit-action" });

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
        logger.error("Order edit action error", error instanceof Error ? error : new Error(String(error)), { orderId: id });
        return data({ success: false, error: "An unexpected error occurred" } as ActionData, { status: 500 });
    }
}

/**
 * Order Edit Page Component
 */
export default function OrderEdit() {
    const { order, shippingOptions, currentShippingOptionId, csrfToken, modificationToken } = useLoaderData<LoaderData>();
    const actionData = useActionData<ActionData>();
    const navigation = useNavigation();
    const revalidator = useRevalidator();
    const navigate = useNavigate();
    const isSubmitting = navigation.state === "submitting";

    // Quick add dialog state
    const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);

    // Pending items state - items added locally but not yet saved to server
    const [pendingItems, setPendingItems] = useState<PendingItem[]>([]);
    // Quantity changes for existing confirmed items (keyed by line item ID)
    const [quantityChanges, setQuantityChanges] = useState<Map<string, QuantityChange>>(new Map());
    const [isSavingItems, setIsSavingItems] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);

    // Ref to track intentional save - prevents beforeunload warning during form submission
    const isIntentionalSaveRef = useRef(false);

    // Derived state for conditional rendering (React best practice: rerender-derived-state)
    const hasPendingChanges = pendingItems.length > 0 || quantityChanges.size > 0;

    // Calculate pending totals in a single pass (React best practice: js-combine-iterations)
    // Includes both new items and quantity changes to existing items
    const pendingTotal = useMemo(() => {
        // Sum of new pending items
        const newItemsTotal = pendingItems.reduce((sum, item) => sum + item.subtotal, 0);

        // Sum of quantity change deltas (can be positive or negative)
        let quantityChangeTotal = 0;
        quantityChanges.forEach(change => {
            const delta = change.newQuantity - change.originalQuantity;
            quantityChangeTotal += delta * change.unitPrice;
        });

        return newItemsTotal + quantityChangeTotal;
    }, [pendingItems, quantityChanges]);

    // Combine confirmed items + pending items for unified display
    // Apply quantity changes to confirmed items for display
    const displayItems: DisplayItem[] = useMemo(() => [
        ...order.items.map(item => {
            const change = quantityChanges.get(item.id);
            const displayQuantity = change ? change.newQuantity : item.quantity;
            return {
                id: item.id,
                title: item.title,
                variantId: item.variant_id,
                thumbnail: item.thumbnail,
                quantity: displayQuantity,
                unitPrice: item.unit_price,
                subtotal: item.unit_price * displayQuantity,
                status: 'confirmed' as const,
            };
        }).filter(item => item.quantity > 0), // Hide items with quantity 0
        ...pendingItems.map(item => ({
            id: item.id,
            title: item.productTitle,
            variantId: item.variantId,
            variantTitle: item.variantTitle,
            thumbnail: item.thumbnail,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            subtotal: item.subtotal,
            status: 'pending' as const,
        })),
    ], [order.items, pendingItems, quantityChanges]);

    // Handler for adding items from OrderQuickAddDialog (React best practice: rerender-functional-setstate)
    // Checks in order: 1) existing confirmed items, 2) pending items, 3) creates new pending item
    const handleAddPendingItem = useCallback((item: Omit<PendingItem, 'id'>) => {
        // First, check if this variant exists in confirmed items
        const existingConfirmedItem = order.items.find(i => i.variant_id === item.variantId);

        if (existingConfirmedItem) {
            // Increment quantity of existing confirmed item via quantityChanges
            setQuantityChanges(prev => {
                const newMap = new Map(prev);
                const existingChange = newMap.get(existingConfirmedItem.id);
                const currentQuantity = existingChange
                    ? existingChange.newQuantity
                    : existingConfirmedItem.quantity;

                newMap.set(existingConfirmedItem.id, {
                    lineItemId: existingConfirmedItem.id,
                    variantId: existingConfirmedItem.variant_id,
                    originalQuantity: existingConfirmedItem.quantity,
                    newQuantity: currentQuantity + item.quantity,
                    unitPrice: existingConfirmedItem.unit_price,
                });

                return newMap;
            });
            setSaveError(null);
            return;
        }

        // Then, check if this variant exists in pending items
        setPendingItems(prev => {
            const existingIndex = prev.findIndex(p => p.variantId === item.variantId);

            if (existingIndex >= 0) {
                // Merge: update quantity and subtotal of existing pending item
                return prev.map((p, idx) => {
                    if (idx === existingIndex) {
                        const newQuantity = p.quantity + item.quantity;
                        return {
                            ...p,
                            quantity: newQuantity,
                            subtotal: p.unitPrice * newQuantity,
                        };
                    }
                    return p;
                });
            }

            // New variant: add to pending list
            return [
                ...prev,
                {
                    ...item,
                    id: `pending_${item.variantId}_${Date.now()}`,
                },
            ];
        });
        setSaveError(null);
    }, [order.items]);

    // Handler for removing a pending item
    const handleRemovePendingItem = useCallback((itemId: string) => {
        setPendingItems(prev => prev.filter(item => item.id !== itemId));
    }, []);

    // Handler for updating pending item quantity (React best practice: rerender-functional-setstate)
    // Auto-removes item if quantity becomes 0 (matches checkout behavior)
    const handleUpdatePendingQuantity = useCallback((itemId: string, newQuantity: number) => {
        if (newQuantity <= 0) {
            // Remove item when quantity reaches 0
            setPendingItems(prev => prev.filter(item => item.id !== itemId));
            return;
        }

        setPendingItems(prev =>
            prev.map(item => {
                if (item.id === itemId) {
                    return {
                        ...item,
                        quantity: newQuantity,
                        subtotal: item.unitPrice * newQuantity,
                    };
                }
                return item;
            })
        );
    }, []);

    // Handler for updating confirmed item quantity (React best practice: rerender-functional-setstate)
    // Tracks the change in quantityChanges map; reverts to original if quantity matches
    const handleUpdateConfirmedQuantity = useCallback((lineItemId: string, newQuantity: number) => {
        const confirmedItem = order.items.find(item => item.id === lineItemId);
        if (!confirmedItem) return;

        setQuantityChanges(prev => {
            const newMap = new Map(prev);

            // If new quantity matches original, remove the change entry
            if (newQuantity === confirmedItem.quantity) {
                newMap.delete(lineItemId);
                return newMap;
            }

            // Prevent negative quantities (but allow 0 for removal)
            if (newQuantity < 0) return prev;

            newMap.set(lineItemId, {
                lineItemId,
                variantId: confirmedItem.variant_id,
                originalQuantity: confirmedItem.quantity,
                newQuantity,
                unitPrice: confirmedItem.unit_price,
            });

            return newMap;
        });
    }, [order.items]);

    // Handler for discarding all pending changes
    const handleDiscardChanges = useCallback(() => {
        setPendingItems([]);
        setQuantityChanges(new Map());
        setSaveError(null);
    }, []);

    // Form state (must be defined before handleSaveChanges which uses validateForm)
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

    // Validate form (memoized for stable reference in handleSaveChanges)
    const validateForm = useCallback((): boolean => {
        const newErrors: Record<string, string> = {};

        if (!formData.address1.trim()) newErrors.address1 = "Address is required";
        if (!formData.city.trim()) newErrors.city = "City is required";
        if (!formData.postalCode.trim()) newErrors.postalCode = "Postal code is required";
        if (!formData.country.trim()) newErrors.country = "Country is required";

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    }, [formData.address1, formData.city, formData.postalCode, formData.country]);

    // Unified handler for saving ALL changes (pending items + quantity changes + address/shipping)
    const handleSaveChanges = useCallback(async (formElement: HTMLFormElement) => {
        // Validate form first
        if (!validateForm()) {
            return;
        }

        setIsSavingItems(true);
        setSaveError(null);

        try {
            // Step 1: If there are pending items or quantity changes, save them via batch API
            const hasItemChanges = pendingItems.length > 0 || quantityChanges.size > 0;

            if (hasItemChanges) {
                // Build batch items array from both pending items and quantity changes
                const batchItems: Array<{
                    action: 'add' | 'update_quantity';
                    variant_id: string;
                    quantity: number;
                }> = [];

                // Add new pending items
                pendingItems.forEach(item => {
                    batchItems.push({
                        action: 'add',
                        variant_id: item.variantId,
                        quantity: item.quantity,
                    });
                });

                // Add quantity changes for existing items
                quantityChanges.forEach(change => {
                    batchItems.push({
                        action: 'update_quantity',
                        variant_id: change.variantId,
                        quantity: change.newQuantity,
                    });
                });

                const batchResponse = await fetch(`/api/orders/${order.id}/batch-modify`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-modification-token': modificationToken,
                    },
                    body: JSON.stringify({ items: batchItems }),
                });

                if (!batchResponse.ok) {
                    const errorData = await batchResponse.json() as { message?: string; code?: string; failed_items?: Array<{ variant_id: string; reason: string }> };
                    throw new Error(errorData.message || 'Failed to save items');
                }

                // Clear pending items and quantity changes after successful batch save
                setPendingItems([]);
                setQuantityChanges(new Map());
            }

            // Step 2: Submit the form for address/shipping changes via React Router action
            // Mark as intentional save to bypass beforeunload warning
            isIntentionalSaveRef.current = true;
            formElement.submit();
        } catch (err) {
            setSaveError(err instanceof Error ? err.message : 'Failed to save changes');
            setIsSavingItems(false);
        }
        // Note: Don't set isSavingItems=false on success - the form submission will cause a page transition
    }, [pendingItems, quantityChanges, order.id, modificationToken, validateForm]);

    // Navigation warning when there are unsaved changes
    useEffect(() => {
        if (!hasPendingChanges) return;

        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            // Skip warning if user is intentionally saving
            if (isIntentionalSaveRef.current) return;

            e.preventDefault();
            // Modern browsers ignore custom messages, but we still need to set returnValue
            e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
            return e.returnValue;
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [hasPendingChanges]);

    // Legacy handler - kept for backward compatibility but now unused
    const handleItemAdded = () => {
        // With batch modification, we no longer refresh on each add
        // Items are accumulated locally until user clicks "Save Changes"
        revalidator.revalidate();
    };

    // Calculate new shipping cost based on selection
    const selectedShippingOption = shippingOptions.find((opt) => opt.id === formData.shippingOptionId);
    const currentShippingCost = order.shipping_total;
    const newShippingCost = selectedShippingOption?.amount || currentShippingCost;
    const shippingDifference = newShippingCost - currentShippingCost;
    // Include pending items in total calculation
    const newTotal = order.total + shippingDifference + pendingTotal;

    // Format currency (Medusa uses major units - dollars, not cents)
    const formatPrice = (amount: number) => {
        return new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: order.currency_code.toUpperCase(),
        }).format(amount);
    };

    return (
        <div className="bg-background-earthy min-h-screen pt-20 pb-12">
            <div className="container mx-auto px-4">
                {/* Header with back link */}
                <div className="mb-8">
                    <Link
                        to={`/order/status/${order.id}`}
                        className="inline-flex items-center text-text-earthy hover:text-accent-earthy transition-colors"
                    >
                        <ArrowLeft className="w-4 h-4 mr-2" />
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

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
                    {/* Main Form - 7 columns */}
                    <div className="lg:col-span-7">
                        <form
                            method="post"
                            onSubmit={(e) => {
                                e.preventDefault();
                                handleSaveChanges(e.currentTarget);
                            }}
                            className="space-y-6"
                        >
                            <input type="hidden" name="csrf_token" value={csrfToken} />
                            <input type="hidden" name="intent" value="UPDATE_ALL" />
                            <input type="hidden" name="currentShippingOptionId" value={currentShippingOptionId || ""} />

                            {/* Contact Information (Read-only) */}
                            <div className="bg-white rounded-lg shadow p-6">
                                <h2 className="text-xl font-serif text-text-earthy mb-4 flex items-center gap-2">
                                    <Package className="w-5 h-5 text-accent-earthy" />
                                    Contact Information
                                </h2>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                                    <div>
                                        <label className="block text-sm font-medium text-text-earthy mb-1">
                                            Name
                                        </label>
                                        <p className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-text-earthy">
                                            {formData.firstName} {formData.lastName}
                                        </p>
                                        <p className="text-xs text-text-earthy/50 mt-1">Contact name cannot be changed</p>
                                        {/* Hidden inputs to preserve values for form submission */}
                                        <input type="hidden" name="firstName" value={formData.firstName} />
                                        <input type="hidden" name="lastName" value={formData.lastName} />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-text-earthy mb-1">
                                            Email
                                        </label>
                                        <p className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-text-earthy">
                                            {order.email}
                                        </p>
                                        <p className="text-xs text-text-earthy/50 mt-1">Email cannot be changed</p>
                                    </div>
                                </div>

                                <h3 className="text-lg font-medium text-text-earthy mb-4">Shipping Address</h3>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                                    <div className="sm:col-span-2">
                                        <label htmlFor="address1" className="block text-sm font-medium text-text-earthy mb-1">
                                            Address *
                                        </label>
                                        <input
                                            type="text"
                                            id="address1"
                                            name="address1"
                                            value={formData.address1}
                                            onChange={(e) => setFormData(prev => ({ ...prev, address1: e.target.value }))}
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
                                            onChange={(e) => setFormData(prev => ({ ...prev, address2: e.target.value }))}
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
                                            onChange={(e) => setFormData(prev => ({ ...prev, city: e.target.value }))}
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
                                            onChange={(e) => setFormData(prev => ({ ...prev, province: e.target.value }))}
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
                                            onChange={(e) => setFormData(prev => ({ ...prev, postalCode: e.target.value }))}
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
                                        {/* Hidden input to submit the disabled country value */}
                                        <input type="hidden" name="country" value={formData.country} />
                                        <select
                                            id="country"
                                            value={formData.country}
                                            onChange={(e) => setFormData(prev => ({ ...prev, country: e.target.value }))}
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
                                            onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
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
                                                                setFormData(prev => ({ ...prev, shippingOptionId: e.target.value }))
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

                            {/* Save Error Display */}
                            {saveError && (
                                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                                    {saveError}
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
                                    disabled={isSubmitting || isSavingItems}
                                    className="flex-1 py-3 px-4 bg-accent-earthy text-white rounded-lg hover:bg-accent-earthy/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isSubmitting || isSavingItems
                                        ? "Saving..."
                                        : hasPendingChanges
                                            ? `Save Changes (${pendingTotal >= 0 ? '+' : ''}${formatPrice(pendingTotal)})`
                                            : "Save Changes"
                                    }
                                </button>
                            </div>
                        </form>
                    </div>

                    {/* Order Summary Sidebar - 5 columns */}
                    <div className="lg:col-span-5">
                        <div className="bg-white rounded-lg shadow p-6 sticky top-8">
                            <h2 className="text-xl font-serif text-text-earthy mb-4">Order Summary</h2>

                            {/* Add More Items Section */}
                            <OrderQuickAddDialog
                                isOpen={isQuickAddOpen}
                                onToggle={() => setIsQuickAddOpen(!isQuickAddOpen)}
                                orderId={order.id}
                                modificationToken={modificationToken}
                                regionId={order.region_id}
                                currencyCode={order.currency_code}
                                onAddItem={handleAddPendingItem}
                                onItemAdded={handleItemAdded}
                            />

                            {/* Items - Combined confirmed + pending with visual distinction */}
                            <div className="space-y-3 mb-4 max-h-64 overflow-y-auto">
                                {displayItems.map((item) => {
                                    // Check if this confirmed item has quantity changes
                                    const hasQuantityChange = item.status === 'confirmed' && quantityChanges.has(item.id);
                                    const originalQuantity = hasQuantityChange
                                        ? order.items.find(i => i.id === item.id)?.quantity
                                        : undefined;

                                    return (
                                        <div
                                            key={item.id}
                                            className={`flex gap-3 p-2 rounded transition-colors ${
                                                item.status === 'pending'
                                                    ? 'bg-amber-50 border border-amber-200'
                                                    : hasQuantityChange
                                                        ? 'bg-blue-50 border border-blue-200'
                                                        : ''
                                            }`}
                                        >
                                            <div className="w-12 h-12 bg-gray-100 rounded overflow-hidden flex-shrink-0">
                                                {item.thumbnail && (
                                                    <img src={item.thumbnail} alt={item.title} className="w-full h-full object-cover" />
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-start gap-1">
                                                    <p className="text-sm font-medium text-text-earthy truncate flex-1">{item.title}</p>
                                                    {item.status === 'pending' && (
                                                        <button
                                                            onClick={() => handleRemovePendingItem(item.id)}
                                                            className="p-0.5 text-amber-600 hover:text-amber-800 transition-colors"
                                                            aria-label="Remove pending item"
                                                        >
                                                            <X className="w-3.5 h-3.5" />
                                                        </button>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {item.status === 'pending' ? (
                                                        // Quantity controls for pending items
                                                        <>
                                                            <div className="flex items-center gap-1.5">
                                                                <button
                                                                    onClick={() => handleUpdatePendingQuantity(item.id, item.quantity - 1)}
                                                                    className="p-0.5 rounded-full hover:bg-amber-100 border border-amber-300 transition-colors cursor-pointer"
                                                                    aria-label="Decrease quantity"
                                                                >
                                                                    <Minus className="w-2.5 h-2.5 text-amber-700" />
                                                                </button>
                                                                <span className="w-4 text-center text-xs text-amber-700 font-medium">{item.quantity}</span>
                                                                <button
                                                                    onClick={() => handleUpdatePendingQuantity(item.id, item.quantity + 1)}
                                                                    className="p-0.5 rounded-full hover:bg-amber-100 border border-amber-300 transition-colors cursor-pointer"
                                                                    aria-label="Increase quantity"
                                                                >
                                                                    <Plus className="w-2.5 h-2.5 text-amber-700" />
                                                                </button>
                                                            </div>
                                                            <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                                                                Pending
                                                            </span>
                                                        </>
                                                    ) : (
                                                        // Quantity controls for confirmed items
                                                        <>
                                                            <div className="flex items-center gap-1.5">
                                                                <button
                                                                    onClick={() => handleUpdateConfirmedQuantity(item.id, item.quantity - 1)}
                                                                    className={`p-0.5 rounded-full transition-colors cursor-pointer ${
                                                                        hasQuantityChange
                                                                            ? 'hover:bg-blue-100 border border-blue-300'
                                                                            : 'hover:bg-gray-100 border border-gray-300'
                                                                    }`}
                                                                    aria-label="Decrease quantity"
                                                                >
                                                                    <Minus className={`w-2.5 h-2.5 ${hasQuantityChange ? 'text-blue-700' : 'text-text-earthy/60'}`} />
                                                                </button>
                                                                <span className={`w-4 text-center text-xs font-medium ${
                                                                    hasQuantityChange ? 'text-blue-700' : 'text-text-earthy/60'
                                                                }`}>{item.quantity}</span>
                                                                <button
                                                                    onClick={() => handleUpdateConfirmedQuantity(item.id, item.quantity + 1)}
                                                                    className={`p-0.5 rounded-full transition-colors cursor-pointer ${
                                                                        hasQuantityChange
                                                                            ? 'hover:bg-blue-100 border border-blue-300'
                                                                            : 'hover:bg-gray-100 border border-gray-300'
                                                                    }`}
                                                                    aria-label="Increase quantity"
                                                                >
                                                                    <Plus className={`w-2.5 h-2.5 ${hasQuantityChange ? 'text-blue-700' : 'text-text-earthy/60'}`} />
                                                                </button>
                                                            </div>
                                                            {hasQuantityChange && originalQuantity !== undefined && (
                                                                <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                                                                    was {originalQuantity}
                                                                </span>
                                                            )}
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                            <p className="text-sm font-medium text-text-earthy flex-shrink-0">{formatPrice(item.subtotal)}</p>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Totals */}
                            <div className="border-t border-gray-200 pt-4 space-y-2">
                                <div className="flex justify-between text-sm">
                                    <span className="text-text-earthy/70">Subtotal</span>
                                    <span className="text-text-earthy">{formatPrice(order.subtotal)}</span>
                                </div>

                                {/* Pending Changes Total */}
                                {hasPendingChanges && (
                                    <div className={`flex justify-between text-sm p-2 rounded border ${
                                        pendingTotal >= 0
                                            ? 'bg-amber-50 border-amber-200'
                                            : 'bg-blue-50 border-blue-200'
                                    }`}>
                                        <span className={pendingTotal >= 0 ? 'text-amber-700' : 'text-blue-700'}>
                                            {pendingItems.length > 0 && quantityChanges.size > 0
                                                ? `Pending Changes (${pendingItems.length} new, ${quantityChanges.size} modified)`
                                                : pendingItems.length > 0
                                                    ? `+ New Items (${pendingItems.length})`
                                                    : `Quantity Changes (${quantityChanges.size})`
                                            }
                                        </span>
                                        <span className={`font-medium ${pendingTotal >= 0 ? 'text-amber-700' : 'text-blue-700'}`}>
                                            {pendingTotal >= 0 ? '+' : ''}{formatPrice(pendingTotal)}
                                        </span>
                                    </div>
                                )}

                                {/* Promo Codes */}
                                {order.promo_codes?.map((promo) => (
                                    <div key={promo.code} className="flex justify-between text-sm">
                                        <span className="bg-green-100 text-green-800 px-2 py-0.5 rounded text-xs font-medium">
                                            {promo.code}
                                        </span>
                                        <span className="text-green-600">-{formatPrice(promo.amount)}</span>
                                    </div>
                                ))}

                                {/* Show discount if there's a discount but no promo codes parsed */}
                                {order.discount_total > 0 && !order.promo_codes?.length && (
                                    <div className="flex justify-between text-sm">
                                        <span className="text-text-earthy/70">Discount</span>
                                        <span className="text-green-600">-{formatPrice(order.discount_total)}</span>
                                    </div>
                                )}

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
