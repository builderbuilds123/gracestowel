import { useState, useEffect } from "react";
import { useFetcher } from "react-router";
import { CancelOrderDialog } from "../CancelOrderDialog";
import { CancelRejectedModal } from "./CancelRejectedModal";
import { EditAddressDialog } from "../EditAddressDialog";
import { AddItemsDialog } from "../AddItemsDialog";
import { EditItemsDialog } from "./EditItemsDialog";
import { OrderEditPaymentDialog } from "./OrderEditPaymentDialog";
import { Pencil, Plus, ShoppingBag } from "../../lib/icons";

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

interface ActionData {
    success: boolean;
    action?: string;
    error?: string;
    errorCode?: string;
    address?: Address;
    new_total?: number;
    // Story 6.4: Payment error handling
    retryable?: boolean;
    errorType?: string;
    itemsAdded?: number;
    itemsUpdated?: number;
    payment_collection?: {
        amount: number;
        payment_sessions?: Array<{
            data?: {
                client_secret?: string;
            };
        }>;
    };
}

interface OrderItem {
    id: string;
    title: string;
    thumbnail?: string;
    quantity: number;
    unit_price: number;
    variant_id: string;
    variant_title?: string;
}

interface OrderModificationDialogsProps {
    orderId: string;
    orderNumber: string;
    currencyCode: string;
    items?: OrderItem[]; // Made optional to prevent breaking if not passed yet
    currentAddress?: Address;
    token: string;
    stripePublishableKey: string;
    onOrderUpdated: (newTotal?: number) => void;
    onAddressUpdated: (address: Address) => void;
    onOrderCanceled: () => void;
}

/**
 * Order Modification Dialogs
 * 
 * Uses Remix useFetcher() to submit to the route's action function.
 * Token is NOT passed from client - action reads from HttpOnly cookie.
 * 
 * @see Story 4-3: Session Persistence (AC4)
 */
export function OrderModificationDialogs({
    orderId,
    orderNumber,
    currencyCode,
    items = [],
    currentAddress,
    token,
    stripePublishableKey,
    onOrderUpdated,
    onAddressUpdated,
    onOrderCanceled,
}: OrderModificationDialogsProps) {
    const [showCancelDialog, setShowCancelDialog] = useState(false);
    const [showCancelRejectedModal, setShowCancelRejectedModal] = useState(false);
    const [showEditAddressDialog, setShowEditAddressDialog] = useState(false);
    const [showAddItemsDialog, setShowAddItemsDialog] = useState(false);
    const [showEditItemsDialog, setShowEditItemsDialog] = useState(false);
    const [showPaymentDialog, setShowPaymentDialog] = useState(false);
    const [pendingPayment, setPendingPayment] = useState<{ amount: number; clientSecret: string } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isRetryable, setIsRetryable] = useState<boolean>(false);
    const [isPaymentError, setIsPaymentError] = useState<boolean>(false);
    
    const fetcher = useFetcher<ActionData>();
    const isSubmitting = fetcher.state !== "idle";

    // Handle action responses
    useEffect(() => {
        if (fetcher.data) {
            if (fetcher.data.success) {
                setError(null);
                
                if (fetcher.data.action === "canceled") {
                    setShowCancelDialog(false);
                    onOrderCanceled();
                } else if (fetcher.data.action === "address_updated" && fetcher.data.address) {
                    setShowEditAddressDialog(false);
                    onAddressUpdated(fetcher.data.address);
                } else if (fetcher.data.action === "items_added") {
                    setShowAddItemsDialog(false);
                    onOrderUpdated(fetcher.data.new_total);
                } else if (fetcher.data.action === "items_updated") {
                    setShowEditItemsDialog(false);
                    onOrderUpdated(fetcher.data.new_total);
                } else if (fetcher.data.action === "payment_required" && fetcher.data.payment_collection) {
                    const paymentSession = fetcher.data.payment_collection.payment_sessions?.[0];
                    const clientSecret = paymentSession?.data?.client_secret;
                    if (clientSecret) {
                        setPendingPayment({
                            amount: fetcher.data.payment_collection.amount,
                            clientSecret
                        });
                        setShowPaymentDialog(true);
                        // Close other dialogs
                        setShowAddItemsDialog(false);
                        setShowEditItemsDialog(false);
                    } else {
                        setError("Payment session initialized but client secret missing.");
                    }
                }
            } else if (fetcher.data.error) {
                // Story 3.5: Handle order_shipped error specifically with a modal
                if (fetcher.data.errorCode === "order_shipped") {
                    setShowCancelDialog(false);
                    setShowCancelRejectedModal(true);
                    setError(null);
                } else {
                    setError(fetcher.data.error);
                }
                
                // Story 6.4: Track retryable state for UX
                setIsRetryable(fetcher.data.retryable ?? false);
                setIsPaymentError(fetcher.data.errorType === "payment_error");
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fetcher.data]);

    // Submit handlers using fetcher (no client-side fetch)
    const handleCancelOrder = async () => {
        setError(null);
        fetcher.submit(
            { intent: "CANCEL_ORDER", reason: "Customer requested cancellation" },
            { method: "POST" }
        );
    };

    const handleUpdateAddress = async (address: Address) => {
        setError(null);
        fetcher.submit(
            { intent: "UPDATE_ADDRESS", address: JSON.stringify(address) },
            { method: "POST" }
        );
    };

    const handleAddItems = async (items: Array<{ variant_id: string; quantity: number }>) => {
        setError(null);
        fetcher.submit(
            { intent: "ADD_ITEMS", items: JSON.stringify(items) },
            { method: "POST" }
        );
    };

    const handleUpdateQuantities = async (updates: Array<{ item_id: string; quantity: number }>) => {
        setError(null);
        fetcher.submit(
            { intent: "UPDATE_QUANTITY", items: JSON.stringify(updates) },
            { method: "POST" }
        );
    };

    return (
        <>
            {/* Error Display - Story 6.4: Different styling for payment errors */}
            {error ? (
                <div className={`mb-4 p-3 rounded-lg text-sm ${
                    isPaymentError 
                        ? 'bg-amber-50 border border-amber-200 text-amber-800'
                        : 'bg-red-50 border border-red-200 text-red-700'
                }`}>
                    <p>{error}</p>
                    {isPaymentError ? (
                        <p className="mt-2 font-medium">
                            {isRetryable 
                                ? "You can try again or use a different payment method."
                                : "Please use a different card to continue."}
                        </p>
                    ) : null}
                </div>
            ) : null}

            {/* Buttons Row */}
            <div className="flex flex-wrap gap-2">
                <div className="relative group">
                    <button
                        disabled={isSubmitting}
                        className="px-4 py-2 bg-accent-earthy text-white rounded-lg hover:bg-accent-earthy/90 transition-colors text-sm font-medium flex items-center gap-2 disabled:opacity-50"
                    >
                        <Pencil className="w-4 h-4" />
                        Modify Order
                    </button>
                    {/* Shadowy dropdown or grouped items revealed on hover/click */}
                    <div className="absolute left-0 mt-2 w-48 bg-white border border-gray-100 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10 p-1">
                        <button
                            onClick={() => setShowAddItemsDialog(true)}
                            disabled={isSubmitting}
                            className="w-full text-left px-3 py-2 text-sm text-text-earthy hover:bg-gray-50 rounded flex items-center gap-2 disabled:opacity-50"
                        >
                            <Plus className="w-4 h-4" />
                            Add Items
                        </button>
                        <button
                            onClick={() => setShowEditItemsDialog(true)}
                            disabled={isSubmitting || items.length === 0}
                            className="w-full text-left px-3 py-2 text-sm text-text-earthy hover:bg-gray-50 rounded flex items-center gap-2 disabled:opacity-50"
                        >
                            <ShoppingBag className="w-4 h-4" />
                            Edit Quantities
                        </button>
                        <button
                            onClick={() => setShowEditAddressDialog(true)}
                            disabled={isSubmitting}
                            className="w-full text-left px-3 py-2 text-sm text-text-earthy hover:bg-gray-50 rounded flex items-center gap-2 disabled:opacity-50"
                        >
                            <Pencil className="w-4 h-4" />
                            Edit Address
                        </button>
                    </div>
                </div>

                <button
                    onClick={() => setShowCancelDialog(true)}
                    disabled={isSubmitting}
                    className="px-4 py-2 text-red-600 border border-red-300 rounded-lg hover:bg-red-50 transition-colors text-sm font-medium disabled:opacity-50"
                >
                    Cancel Order
                </button>
            </div>

            {/* Dialogs */}
            <CancelOrderDialog
                isOpen={showCancelDialog}
                onClose={() => setShowCancelDialog(false)}
                onConfirm={handleCancelOrder}
                orderNumber={orderNumber}
            />

            <CancelRejectedModal
                isOpen={showCancelRejectedModal}
                onClose={() => setShowCancelRejectedModal(false)}
            />

            <EditAddressDialog
                isOpen={showEditAddressDialog}
                onClose={() => setShowEditAddressDialog(false)}
                onSave={handleUpdateAddress}
                currentAddress={currentAddress}
            />

            <AddItemsDialog
                isOpen={showAddItemsDialog}
                onClose={() => setShowAddItemsDialog(false)}
                onAdd={handleAddItems}
                currencyCode={currencyCode}
            />

            <EditItemsDialog
                isOpen={showEditItemsDialog}
                onClose={() => setShowEditItemsDialog(false)}
                onUpdate={handleUpdateQuantities}
                items={items}
                currencyCode={currencyCode}
            />

            {pendingPayment ? (
                <OrderEditPaymentDialog
                    isOpen={showPaymentDialog}
                    onClose={() => setShowPaymentDialog(false)}
                    clientSecret={pendingPayment.clientSecret}
                    stripePublishableKey={stripePublishableKey}
                    orderId={orderId}
                    token={token}
                    amount={pendingPayment.amount}
                    currencyCode={currencyCode}
                />
            ) : null}
        </>
    );
}
