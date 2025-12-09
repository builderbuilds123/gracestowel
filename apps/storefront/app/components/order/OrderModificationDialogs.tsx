import { useState } from "react";
import { CancelOrderDialog } from "../CancelOrderDialog";
import { EditAddressDialog } from "../EditAddressDialog";
import { AddItemsDialog } from "../AddItemsDialog";
import { Pencil, Plus } from "lucide-react";

interface OrderModificationDialogsProps {
    orderId: string;
    token: string;
    orderNumber: string;
    currencyCode: string;
    currentAddress: any;
    onOrderUpdated: (newTotal?: any) => void;
    onAddressUpdated: (address: any) => void;
    onOrderCanceled: () => void;
    medusaBackendUrl: string;
    medusaPublishableKey: string;
}

export function OrderModificationDialogs({
    orderId,
    token,
    orderNumber,
    currencyCode,
    currentAddress,
    onOrderUpdated,
    onAddressUpdated,
    onOrderCanceled,
    medusaBackendUrl,
    medusaPublishableKey
}: OrderModificationDialogsProps) {
    const [showCancelDialog, setShowCancelDialog] = useState(false);
    const [showEditAddressDialog, setShowEditAddressDialog] = useState(false);
    const [showAddItemsDialog, setShowAddItemsDialog] = useState(false);

    // Handlers reusing the existing logic structure but encapsulated
    const handleCancelOrder = async () => {
        const response = await fetch(`${medusaBackendUrl}/store/orders/${orderId}/cancel`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-publishable-api-key': medusaPublishableKey,
                'x-modification-token': token // Support header auth as well
            },
            body: JSON.stringify({ token, reason: 'Customer requested cancellation' }),
        });

        if (!response.ok) {
            const data = await response.json() as any;
            throw new Error(data.message || 'Failed to cancel order');
        }
        onOrderCanceled();
        setShowCancelDialog(false);
    };

    const handleUpdateAddress = async (address: any) => {
        const response = await fetch(`${medusaBackendUrl}/store/orders/${orderId}/address`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-publishable-api-key': medusaPublishableKey,
                'x-modification-token': token
            },
            body: JSON.stringify({ token, address }),
        });

        if (!response.ok) {
            const data = await response.json() as any;
            throw new Error(data.message || 'Failed to update address');
        }
        onAddressUpdated(address);
        setShowEditAddressDialog(false);
    };

    const handleAddItems = async (items: Array<{ variant_id: string; quantity: number }>) => {
        const response = await fetch(`${medusaBackendUrl}/store/orders/${orderId}/line-items`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-publishable-api-key': medusaPublishableKey,
                'x-modification-token': token
            },
            body: JSON.stringify({ token, items }),
        });

        if (!response.ok) {
            const data = await response.json() as any;
            throw new Error(data.message || 'Failed to add items');
        }
        const result = await response.json() as any;
        onOrderUpdated(result.new_total);
        setShowAddItemsDialog(false);
    };

    return (
        <>
            {/* Buttons Row */}
            <div className="flex flex-wrap gap-2">
                <button
                    onClick={() => setShowAddItemsDialog(true)}
                    className="px-4 py-2 text-accent-earthy border border-accent-earthy rounded-lg hover:bg-accent-earthy/10 transition-colors text-sm font-medium flex items-center gap-2"
                >
                    <Plus className="w-4 h-4" />
                    Add Items
                </button>
                <button
                    onClick={() => setShowEditAddressDialog(true)}
                    className="px-4 py-2 text-accent-earthy border border-accent-earthy rounded-lg hover:bg-accent-earthy/10 transition-colors text-sm font-medium flex items-center gap-2"
                >
                    <Pencil className="w-4 h-4" />
                    Edit Address
                </button>
                <button
                    onClick={() => setShowCancelDialog(true)}
                    className="px-4 py-2 text-red-600 border border-red-300 rounded-lg hover:bg-red-50 transition-colors text-sm font-medium"
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
