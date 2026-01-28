import { useState, useEffect, useCallback } from "react";
import { Plus, Minus, Loader2, ChevronUp, ShoppingBag } from "../../lib/icons";
import { useLocale } from "../../context/LocaleContext";
import { medusaFetch } from "../../lib/medusa-fetch";
import { createLogger } from "../../lib/logger";
import { Image } from "../ui/Image";

interface CalculatedPrice {
    calculated_amount: number;
    original_amount: number;
    currency_code: string;
    price_list_type?: string | null;
}

interface ProductVariant {
    id: string;
    title: string;
    calculated_price?: CalculatedPrice;
    prices?: Array<{
        amount: number;
        currency_code: string;
    }>;
    options?: Array<{
        id: string;
        value: string;
        option_id: string;
    }>;
    inventory_quantity?: number;
    manage_inventory?: boolean;
    allow_backorder?: boolean;
}

interface Product {
    id: string;
    title: string;
    handle: string;
    thumbnail?: string;
    images?: Array<{ id: string; url: string }>;
    variants: ProductVariant[];
    options?: Array<{
        id: string;
        title: string;
        values: Array<{ id: string; value: string }>;
    }>;
}

/**
 * Pending item structure for batch modification flow.
 * Matches the PendingItem interface in order_.$id.edit.tsx
 */
export interface PendingItemData {
    variantId: string;
    productTitle: string;
    variantTitle?: string;
    thumbnail?: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
}

interface OrderQuickAddDialogProps {
    isOpen: boolean;
    onToggle: () => void;
    orderId: string;
    modificationToken: string;
    regionId?: string | null;
    currencyCode?: string;
    /** New batch flow: Add item to pending state instead of API call */
    onAddItem?: (item: PendingItemData) => void;
    /** Legacy: Refresh order data after immediate API call (deprecated) */
    onItemAdded: () => void;
}

/**
 * Inline expandable product section for adding items to an existing order.
 * Adapted from QuickAddProductDialog but calls order line-items API instead of cart.
 */
export function OrderQuickAddDialog({
    isOpen,
    onToggle,
    orderId,
    modificationToken,
    regionId,
    currencyCode: propCurrencyCode,
    onAddItem,
    onItemAdded,
}: OrderQuickAddDialogProps) {
    const { currency: localeCurrency } = useLocale();
    // Use prop currency code if provided (from order), fallback to locale
    const currencyCode = propCurrencyCode || localeCurrency;
    const [isLoadingProducts, setIsLoadingProducts] = useState(false);
    const [products, setProducts] = useState<Product[]>([]);
    const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({});
    const [quantities, setQuantities] = useState<Record<string, number>>({});
    const [addingProductId, setAddingProductId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const logger = createLogger({ context: "OrderQuickAddDialog" });

    // Fetch products when section opens
    useEffect(() => {
        if (isOpen && products.length === 0) {
            fetchProducts();
        }
    }, [isOpen, products.length]);

    const fetchProducts = async () => {
        setIsLoadingProducts(true);
        setError(null);
        try {
            const params = new URLSearchParams();
            params.append('limit', '6');
            params.append('fields', '+variants.calculated_price,*variants.options,*options,+variants.inventory_quantity,+variants.manage_inventory,+variants.allow_backorder');
            if (regionId) {
                params.append('region_id', regionId);
            }
            const response = await medusaFetch(`/store/products?${params.toString()}`, {
                method: "GET",
                label: "order-quick-add-products",
            });
            if (response.ok) {
                const data = await response.json() as { products?: Product[] };
                const allProducts = data.products || [];

                // Filter to only products with at least one available variant
                const isAvailable = (variant: ProductVariant): boolean => {
                    if (variant.manage_inventory === false) return true;
                    if (variant.allow_backorder) return true;
                    return (variant.inventory_quantity ?? 0) > 0;
                };

                const productList = allProducts.filter(product =>
                    product.variants.some(isAvailable)
                );
                setProducts(productList);

                // Initialize selected variants to first available variant of each product
                const initialVariants: Record<string, string> = {};
                const initialQuantities: Record<string, number> = {};
                productList.forEach(product => {
                    const availableVariant = product.variants.find(isAvailable);
                    if (availableVariant) {
                        initialVariants[product.id] = availableVariant.id;
                        initialQuantities[product.id] = 1;
                    }
                });
                setSelectedVariants(initialVariants);
                setQuantities(initialQuantities);
            }
        } catch (err) {
            logger.error("Failed to fetch products", err instanceof Error ? err : new Error(String(err)));
            setError("Failed to load products");
        } finally {
            setIsLoadingProducts(false);
        }
    };

    const handleVariantChange = useCallback((productId: string, variantId: string) => {
        setSelectedVariants(prev => ({ ...prev, [productId]: variantId }));
    }, []);

    const handleQuantityChange = useCallback((productId: string, delta: number) => {
        setQuantities(prev => {
            const current = prev[productId] || 1;
            const newQuantity = Math.max(1, current + delta);
            return { ...prev, [productId]: newQuantity };
        });
    }, []);

    const formatPrice = (amount: number) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currencyCode,
        }).format(amount);
    };

    // Get price from variant
    const getVariantPrice = useCallback((variant: ProductVariant): number | null => {
        if (variant.calculated_price?.calculated_amount !== undefined) {
            return variant.calculated_price.calculated_amount;
        }
        const legacyPrice = variant.prices?.find(p =>
            p.currency_code.toLowerCase() === currencyCode.toLowerCase()
        );
        return legacyPrice?.amount ?? null;
    }, [currencyCode]);

    const handleAddToOrder = useCallback(async (product: Product) => {
        const variantId = selectedVariants[product.id];
        const variant = product.variants.find(v => v.id === variantId);
        if (!variant) return;

        const quantity = quantities[product.id] || 1;
        const priceAmount = getVariantPrice(variant);
        if (priceAmount === null) return;

        setAddingProductId(product.id);
        setError(null);

        // NEW: Batch modification flow - add to pending state instead of API call
        if (onAddItem) {
            const pendingItem: PendingItemData = {
                variantId,
                productTitle: product.title,
                variantTitle: variant.title !== 'Default Title' ? variant.title : undefined,
                thumbnail: product.thumbnail,
                quantity,
                unitPrice: priceAmount,
                subtotal: priceAmount * quantity,
            };

            onAddItem(pendingItem);

            // Reset quantity and show brief feedback
            setQuantities(prev => ({ ...prev, [product.id]: 1 }));
            setTimeout(() => setAddingProductId(null), 500);
            return;
        }

        // LEGACY: Immediate API call (deprecated, kept for backward compatibility)
        try {
            const response = await medusaFetch(`/store/orders/${orderId}/line-items`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-modification-token": modificationToken,
                },
                body: JSON.stringify({
                    variant_id: variantId,
                    quantity,
                }),
                label: "order-add-line-item",
            });

            if (!response.ok) {
                const errorData = await response.json() as { message?: string; code?: string };
                throw new Error(errorData.message || "Failed to add item");
            }

            // Reset quantity and show brief feedback
            setQuantities(prev => ({ ...prev, [product.id]: 1 }));

            // Notify parent to refresh order data
            onItemAdded();

            setTimeout(() => setAddingProductId(null), 800);
        } catch (err) {
            logger.error("Failed to add item to order", err instanceof Error ? err : new Error(String(err)));
            setError(err instanceof Error ? err.message : "Failed to add item");
            setAddingProductId(null);
        }
    }, [selectedVariants, quantities, orderId, modificationToken, onAddItem, onItemAdded, getVariantPrice, logger]);

    // Check if a variant is available for purchase
    const isVariantAvailable = useCallback((variant: ProductVariant): boolean => {
        if (variant.manage_inventory === false) return true;
        if (variant.allow_backorder) return true;
        return (variant.inventory_quantity ?? 0) > 0;
    }, []);

    const getColorOptions = (product: Product): Array<{ variantId: string; color: string }> => {
        const colorOptionDef = product.options?.find(o => o.title.toLowerCase() === 'color');
        if (!colorOptionDef) return [];

        return product.variants
            .filter(isVariantAvailable)
            .map(variant => {
                const colorOpt = variant.options?.find(opt => opt.option_id === colorOptionDef.id);
                return colorOpt ? { variantId: variant.id, color: colorOpt.value } : null;
            })
            .filter((item): item is { variantId: string; color: string } => item !== null);
    };

    return (
        <div className="mb-4">
            {/* Toggle Button */}
            <button
                onClick={onToggle}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 border border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-accent-earthy hover:text-accent-earthy transition-colors"
            >
                {isOpen ? (
                    <>
                        <ChevronUp className="w-4 h-4" />
                        <span className="text-sm">Hide products</span>
                    </>
                ) : (
                    <>
                        <Plus className="w-4 h-4" />
                        <span className="text-sm">Add more items</span>
                    </>
                )}
            </button>

            {/* Error Display */}
            {error && (
                <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
                    {error}
                </div>
            )}

            {/* Expandable Products Section */}
            {isOpen && (
                <div className="mt-4 max-h-80 overflow-y-auto space-y-3 pr-1">
                    {isLoadingProducts ? (
                        <div className="flex items-center justify-center py-6">
                            <Loader2 className="w-5 h-5 animate-spin text-accent-earthy" />
                        </div>
                    ) : products.length === 0 ? (
                        <p className="text-center text-gray-400 py-4 text-sm">No additional products available</p>
                    ) : (
                        products.map(product => {
                            const selectedVariantId = selectedVariants[product.id];
                            const selectedVariant = product.variants.find(v => v.id === selectedVariantId);
                            const priceAmount = selectedVariant ? getVariantPrice(selectedVariant) : null;
                            const colorOptions = getColorOptions(product);
                            const quantity = quantities[product.id] || 1;
                            const isAdding = addingProductId === product.id;

                            if (priceAmount === null) return null;

                            return (
                                <div
                                    key={product.id}
                                    className="flex gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100"
                                >
                                    {/* Product Image */}
                                    <div className="w-14 h-14 flex-shrink-0 bg-white rounded overflow-hidden">
                                        {product.thumbnail ? (
                                            <Image
                                                src={product.thumbnail}
                                                alt={product.title}
                                                width={56}
                                                height={56}
                                                className="w-full h-full object-cover"
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center bg-gray-100">
                                                <ShoppingBag className="w-5 h-5 text-gray-300" />
                                            </div>
                                        )}
                                    </div>

                                    {/* Product Details */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-start justify-between gap-2">
                                            <h4 className="font-medium text-text-earthy text-sm truncate">
                                                {product.title}
                                            </h4>
                                            <span className="text-accent-earthy font-medium text-sm whitespace-nowrap">
                                                {formatPrice(priceAmount)}
                                            </span>
                                        </div>

                                        {/* Color Selector & Controls */}
                                        <div className="flex items-center justify-between mt-2">
                                            {/* Color Options */}
                                            {colorOptions.length > 1 ? (
                                                <div className="flex gap-1">
                                                    {colorOptions.map(({ variantId, color }) => (
                                                        <button
                                                            key={variantId}
                                                            onClick={() => handleVariantChange(product.id, variantId)}
                                                            className={`w-5 h-5 rounded-full border transition-all ${
                                                                selectedVariantId === variantId
                                                                    ? 'border-accent-earthy ring-1 ring-accent-earthy/30'
                                                                    : 'border-gray-300 hover:border-gray-400'
                                                            }`}
                                                            style={{ backgroundColor: color.toLowerCase() }}
                                                            title={color}
                                                            aria-label={`Select ${color}`}
                                                        />
                                                    ))}
                                                </div>
                                            ) : (
                                                <div />
                                            )}

                                            {/* Quantity & Add */}
                                            <div className="flex items-center gap-2">
                                                <div className="flex items-center border border-gray-200 rounded bg-white">
                                                    <button
                                                        onClick={() => handleQuantityChange(product.id, -1)}
                                                        className="p-1 hover:bg-gray-50"
                                                        aria-label="Decrease quantity"
                                                    >
                                                        <Minus className="w-3 h-3" />
                                                    </button>
                                                    <span className="px-2 text-xs font-medium min-w-[20px] text-center">
                                                        {quantity}
                                                    </span>
                                                    <button
                                                        onClick={() => handleQuantityChange(product.id, 1)}
                                                        className="p-1 hover:bg-gray-50"
                                                        aria-label="Increase quantity"
                                                    >
                                                        <Plus className="w-3 h-3" />
                                                    </button>
                                                </div>
                                                <button
                                                    onClick={() => handleAddToOrder(product)}
                                                    disabled={isAdding}
                                                    className={`px-2 py-1 text-xs rounded transition-colors ${
                                                        isAdding
                                                            ? 'bg-green-500 text-white'
                                                            : 'bg-accent-earthy text-white hover:bg-accent-earthy/90'
                                                    }`}
                                                >
                                                    {isAdding ? '+ Added' : 'Add'}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            )}
        </div>
    );
}

export default OrderQuickAddDialog;
