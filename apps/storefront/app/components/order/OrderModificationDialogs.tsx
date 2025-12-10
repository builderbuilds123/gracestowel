import { useState, useEffect } from "react";
import { useFetcher } from "react-router";
import { CancelOrderDialog } from "../CancelOrderDialog";
import { EditAddressDialog } from "../EditAddressDialog";
import { AddItemsDialog } from "../AddItemsDialog";
import { Pencil, Plus } from "lucide-react";

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
    address?: Address;
    new_total?: number;
}

interface OrderModificationDialogsProps {
    orderId: string;
    orderNumber: string;
    currencyCode: string;
    currentAddress?: Address;
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
    currentAddress,
    onOrderUpdated,
    onAddressUpdated,
    onOrderCanceled,
}: OrderModificationDialogsProps) {
    const [showCancelDialog, setShowCancelDialog] = useState(false);
    const [showEditAddressDialog, setShowEditAddressDialog] = useState(false);
    const [showAddItemsDialog, setShowAddItemsDialog] = useState(false);
    const [error, setError] = useState<string | null>(null);
    
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
                }
            } else if (fetcher.data.error) {
                setError(fetcher.data.error);
            }
        }
    }, [fetcher.data, onOrderCanceled, onAddressUpdated, onOrderUpdated]);

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

    return (
        <>
            {/* Error Display */}
            {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                    {error}
                </div>
            )}

            {/* Buttons Row */}
            <div className="flex flex-wrap gap-2">
                <button
                    onClick={() => setShowAddItemsDialog(true)}
                    disabled={isSubmitting}
                    className="px-4 py-2 text-accent-earthy border border-accent-earthy rounded-lg hover:bg-accent-earthy/10 transition-colors text-sm font-medium flex items-center gap-2 disabled:opacity-50"
                >
                    <Plus className="w-4 h-4" />
                    Add Items
                </button>
                <button
                    onClick={() => setShowEditAddressDialog(true)}
                    disabled={isSubmitting}
                    className="px-4 py-2 text-accent-earthy border border-accent-earthy rounded-lg hover:bg-accent-earthy/10 transition-colors text-sm font-medium flex items-center gap-2 disabled:opacity-50"
                >
                    <Pencil className="w-4 h-4" />
                    Edit Address
                </button>
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
        </>
    );
}
