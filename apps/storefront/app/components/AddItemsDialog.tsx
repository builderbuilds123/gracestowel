import { useState, useEffect } from "react";
import { X, Loader2, Plus, Minus, ShoppingBag } from "lucide-react";
import { medusaFetch } from "../lib/medusa-fetch";

interface Product {
    id: string;
    title: string;
    thumbnail?: string;
    variants: Array<{
        id: string;
        title: string;
        prices: Array<{
            amount: number;
            currency_code: string;
        }>;
    }>;
}

interface SelectedItem {
    variant_id: string;
    product_title: string;
    variant_title: string;
    quantity: number;
    price: number;
}

interface AddItemsDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onAdd: (items: Array<{ variant_id: string; quantity: number }>) => Promise<void>;
    currencyCode: string;
    /** Region ID for region-specific pricing */
    regionId?: string | null;
}

/**
 * Dialog for adding items to an order within the modification window.
 */
export function AddItemsDialog({ isOpen, onClose, onAdd, currencyCode, regionId }: AddItemsDialogProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [isLoadingProducts, setIsLoadingProducts] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [products, setProducts] = useState<Product[]>([]);
    const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);

    // Fetch products when dialog opens
    useEffect(() => {
        if (isOpen) {
            fetchProducts();
        }
    }, [isOpen]);

    const fetchProducts = async () => {
        setIsLoadingProducts(true);
        try {
            // Build URL with optional region_id for pricing
            const params = new URLSearchParams();
            params.append('limit', '20');
            if (regionId) {
                params.append('region_id', regionId);
            }
            // Use medusaFetch which automatically injects the publishable key
            const response = await medusaFetch(`/store/products?${params.toString()}`, {
                method: "GET",
                label: "add-items-products",
            });
            if (response.ok) {
                const data = await response.json() as { products?: Product[] };
                setProducts(data.products || []);
            }
        } catch (err) {
            console.error("Failed to fetch products:", err);
        } finally {
            setIsLoadingProducts(false);
        }
    };

    if (!isOpen) return null;

    const handleAddItem = (product: Product, variant: Product['variants'][0]) => {
        const price = variant.prices.find(p => p.currency_code === currencyCode.toLowerCase());
        if (!price) return;

        const existingIndex = selectedItems.findIndex(item => item.variant_id === variant.id);
        if (existingIndex >= 0) {
            // Increment quantity
            const updated = [...selectedItems];
            updated[existingIndex].quantity += 1;
            setSelectedItems(updated);
        } else {
            // Add new item
            setSelectedItems([...selectedItems, {
                variant_id: variant.id,
                product_title: product.title,
                variant_title: variant.title,
                quantity: 1,
                price: price.amount,
            }]);
        }
    };

    const handleRemoveItem = (variantId: string) => {
        const existingIndex = selectedItems.findIndex(item => item.variant_id === variantId);
        if (existingIndex >= 0) {
            const updated = [...selectedItems];
            if (updated[existingIndex].quantity > 1) {
                updated[existingIndex].quantity -= 1;
            } else {
                updated.splice(existingIndex, 1);
            }
            setSelectedItems(updated);
        }
    };

    const getItemQuantity = (variantId: string) => {
        const item = selectedItems.find(i => i.variant_id === variantId);
        return item?.quantity || 0;
    };

    const getTotalAmount = () => {
        return selectedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    };

    const handleSubmit = async () => {
        if (selectedItems.length === 0) return;
        
        setIsLoading(true);
        setError(null);
        try {
            await onAdd(selectedItems.map(item => ({
                variant_id: item.variant_id,
                quantity: item.quantity,
            })));
            setSelectedItems([]);
            onClose();
        } catch (err: any) {
            setError(err.message || "Failed to add items. Please try again.");
        } finally {
            setIsLoading(false);
        }
    };

    const formatPrice = (amount: number) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currencyCode,
        }).format(amount / 100);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/50" onClick={!isLoading ? onClose : undefined} />

            {/* Dialog */}
            <div className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="p-6 border-b border-gray-200 flex items-center justify-between">
                    <h2 className="text-xl font-serif text-text-earthy">Add Items to Order</h2>
                    <button
                        onClick={onClose}
                        disabled={isLoading}
                        className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {error && (
                    <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                        {error}
                    </div>
                )}

                {/* Products Grid */}
                <div className="flex-1 overflow-y-auto p-6">
                    {isLoadingProducts ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="w-8 h-8 animate-spin text-accent-earthy" />
                        </div>
                    ) : products.length === 0 ? (
                        <p className="text-center text-gray-500 py-12">No products available</p>
                    ) : (
                        <div className="grid grid-cols-2 gap-4">
                            {products.map(product => (
                                product.variants.map(variant => {
                                    const price = variant.prices.find(p => p.currency_code === currencyCode.toLowerCase());
                                    if (!price) return null;
                                    const quantity = getItemQuantity(variant.id);
                                    
                                    return (
                                        <div key={variant.id} className="border border-gray-200 rounded-lg p-4">
                                            <div className="aspect-square bg-gray-100 rounded-lg mb-3 flex items-center justify-center">
                                                {product.thumbnail ? (
                                                    <img src={product.thumbnail} alt={product.title} className="w-full h-full object-cover rounded-lg" />
                                                ) : (
                                                    <ShoppingBag className="w-12 h-12 text-gray-300" />
                                                )}
                                            </div>
                                            <h3 className="font-medium text-text-earthy text-sm">{product.title}</h3>
                                            <p className="text-xs text-gray-500 mb-2">{variant.title}</p>
                                            <p className="font-medium text-accent-earthy mb-3">{formatPrice(price.amount)}</p>
                                            
                                            {quantity > 0 ? (
                                                <div className="flex items-center justify-between">
                                                    <button
                                                        onClick={() => handleRemoveItem(variant.id)}
                                                        className="p-1 rounded-full bg-gray-100 hover:bg-gray-200"
                                                    >
                                                        <Minus className="w-4 h-4" />
                                                    </button>
                                                    <span className="font-medium">{quantity}</span>
                                                    <button
                                                        onClick={() => handleAddItem(product, variant)}
                                                        className="p-1 rounded-full bg-accent-earthy text-white hover:bg-accent-earthy/90"
                                                    >
                                                        <Plus className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            ) : (
                                                <button
                                                    onClick={() => handleAddItem(product, variant)}
                                                    className="w-full py-2 text-sm bg-accent-earthy text-white rounded-lg hover:bg-accent-earthy/90 transition-colors"
                                                >
                                                    Add
                                                </button>
                                            )}
                                        </div>
                                    );
                                })
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                {selectedItems.length > 0 && (
                    <div className="p-6 border-t border-gray-200 bg-gray-50">
                        <div className="flex items-center justify-between mb-4">
                            <span className="text-text-earthy">
                                {selectedItems.reduce((sum, item) => sum + item.quantity, 0)} item(s) selected
                            </span>
                            <span className="font-medium text-accent-earthy">
                                +{formatPrice(getTotalAmount())}
                            </span>
                        </div>
                        <button
                            onClick={handleSubmit}
                            disabled={isLoading}
                            className="w-full py-3 bg-accent-earthy text-white rounded-lg hover:bg-accent-earthy/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Adding Items...
                                </>
                            ) : (
                                "Add to Order"
                            )}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

export default AddItemsDialog;

