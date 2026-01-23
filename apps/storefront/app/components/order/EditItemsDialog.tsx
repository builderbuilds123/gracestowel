import { useState, useEffect } from "react";
import { X, Loader2, Minus, Plus } from "../../lib/icons";

interface OrderItem {
    id: string;
    title: string;
    thumbnail?: string;
    quantity: number;
    unit_price: number;
    variant_id: string;
    variant_title?: string;
}

interface EditItemsDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onUpdate: (updates: Array<{ item_id: string; quantity: number }>) => Promise<void>;
    items: OrderItem[];
    currencyCode: string;
}

export function EditItemsDialog({
    isOpen,
    onClose,
    onUpdate,
    items,
    currencyCode,
}: EditItemsDialogProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [quantities, setQuantities] = useState<Record<string, number>>({});

    // Initialize quantities when dialog opens
    useEffect(() => {
        if (isOpen) {
            const initialQuantities: Record<string, number> = {};
            items.forEach(item => {
                initialQuantities[item.id] = item.quantity;
            });
            setQuantities(initialQuantities);
        }
    }, [isOpen, items]);

    const handleQuantityChange = (itemId: string, delta: number) => {
        setQuantities(prev => {
            const current = prev[itemId] || 0;
            const newQty = Math.max(0, current + delta); // Allow going to 0? Maybe imply removal? 
            // For now, let's keep it simple: min 1?
            // "Update Quantity" usually implies "Change". 0 implies "Remove" (Cancel Item).
            // My backend workflow checks quantity >= 0.
            // If 0, it updates quantity to 0. Is that "Removed"?
            // Usually standard logic differs. Let's enforce min 1 for now to avoid accidental deletions unless specific "Remove" button is added.
            // Actually, if I allow 0, I need to verify backend handles it (it just sets qty to 0, which might look weird if not deleted).
            // Let's enforce min 1.
            return {
                ...prev,
                [itemId]: Math.max(1, newQty)
            };
        });
    };

    const hasChanges = () => {
        return items.some(item => quantities[item.id] !== item.quantity);
    };

    const handleSubmit = async () => {
        const updates = items
            .filter(item => quantities[item.id] !== item.quantity)
            .map(item => ({
                item_id: item.id,
                quantity: quantities[item.id]
            }));

        if (updates.length === 0) {
            onClose();
            return;
        }

        setIsLoading(true);
        setError(null);
        try {
            await onUpdate(updates);
            onClose();
        } catch (err: any) {
            setError(err.message || "Failed to update quantities.");
        } finally {
            setIsLoading(false);
        }
    };

    const formatPrice = (amount: number) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currencyCode,
        }).format(amount);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50" onClick={!isLoading ? onClose : undefined} />
            <div className="relative bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 flex flex-col max-h-[90vh]">
                <div className="p-6 border-b border-gray-200 flex items-center justify-between">
                    <h2 className="text-xl font-serif text-text-earthy">Edit Quantities</h2>
                    <button onClick={onClose} disabled={isLoading} className="text-gray-400 hover:text-gray-600">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {error ? (
                    <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                        {error}
                    </div>
                ) : null}

                <div className="p-6 overflow-y-auto flex-1">
                    <div className="space-y-4">
                        {items.map(item => (
                            <div key={item.id} className="flex items-center justify-between border-b border-gray-100 pb-4 last:border-0">
                                <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 bg-gray-100 rounded overflow-hidden">
                                        {item.thumbnail ? (
                                            <img src={item.thumbnail} alt={item.title} className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full bg-gray-200" />
                                        )}
                                    </div>
                                    <div>
                                        <p className="font-medium text-sm text-text-earthy">{item.title}</p>
                                        <p className="text-xs text-gray-500">{item.variant_title}</p>
                                        <p className="text-xs font-medium text-accent-earthy">{formatPrice(item.unit_price)}</p>
                                    </div>
                                </div>
                                
                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={() => handleQuantityChange(item.id, -1)}
                                        disabled={quantities[item.id] <= 1}
                                        className="p-1 rounded-full bg-gray-100 hover:bg-gray-200 disabled:opacity-50"
                                    >
                                        <Minus className="w-4 h-4" />
                                    </button>
                                    <span className="w-8 text-center font-medium">{quantities[item.id]}</span>
                                    <button
                                        onClick={() => handleQuantityChange(item.id, 1)}
                                        className="p-1 rounded-full bg-gray-100 hover:bg-gray-200"
                                    >
                                        <Plus className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="p-6 border-t border-gray-200 bg-gray-50">
                    <button
                        onClick={handleSubmit}
                        disabled={isLoading || !hasChanges()}
                        className="w-full py-3 bg-accent-earthy text-white rounded-lg hover:bg-accent-earthy/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Updating...
                            </>
                        ) : (
                            "Save Changes"
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
