import { useState, useEffect, useCallback } from "react";
import { Plus, Minus, Loader2, ChevronUp, ShoppingBag } from "../lib/icons";
import { useCart } from "../context/CartContext";
import { useLocale } from "../context/LocaleContext";
import { medusaFetch } from "../lib/medusa-fetch";
import { createLogger } from "../lib/logger";
import { Image } from "./ui/Image";

interface CalculatedPrice {
    calculated_amount: number;
    original_amount: number;
    currency_code: string;
    price_list_type?: string | null;
}

interface ProductVariant {
    id: string;
    title: string;
    // Medusa v2 uses calculated_price for region-aware pricing
    calculated_price?: CalculatedPrice;
    // Legacy fallback
    prices?: Array<{
        amount: number;
        currency_code: string;
    }>;
    options?: Array<{
        id: string;
        value: string;
        option_id: string;
    }>;
    // Inventory tracking
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

interface QuickAddProductDialogProps {
    isOpen: boolean;
    onToggle: () => void;
    regionId?: string | null;
}

/**
 * Inline expandable product section for upselling.
 * Shows as a collapsed button, expands to show products when clicked.
 */
export function QuickAddProductDialog({ isOpen, onToggle, regionId }: QuickAddProductDialogProps) {
    const { addToCart } = useCart();
    const { currency: currencyCode } = useLocale();
    const [isLoadingProducts, setIsLoadingProducts] = useState(false);
    const [products, setProducts] = useState<Product[]>([]);
    const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({});
    const [quantities, setQuantities] = useState<Record<string, number>>({});
    const [addingProductId, setAddingProductId] = useState<string | null>(null);

    const logger = createLogger({ context: "QuickAddProductDialog" });

    // Fetch products when section opens
    useEffect(() => {
        if (isOpen && products.length === 0) {
            fetchProducts();
        }
    }, [isOpen, products.length]);

    const fetchProducts = async () => {
        setIsLoadingProducts(true);
        try {
            const params = new URLSearchParams();
            params.append('limit', '6');
            // Use Medusa v2 field patterns for pricing
            // +field adds to defaults, *relation expands nested data
            params.append('fields', '+variants.calculated_price,*variants.options,*options,+variants.inventory_quantity,+variants.manage_inventory,+variants.allow_backorder');
            if (regionId) {
                params.append('region_id', regionId);
            }
            const response = await medusaFetch(`/store/products?${params.toString()}`, {
                method: "GET",
                label: "quick-add-products",
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

    // Get price from variant - supports both v2 calculated_price and legacy prices array
    const getVariantPrice = useCallback((variant: ProductVariant): number | null => {
        // Medusa v2 format
        if (variant.calculated_price?.calculated_amount !== undefined) {
            return variant.calculated_price.calculated_amount;
        }
        // Legacy format fallback
        const legacyPrice = variant.prices?.find(p =>
            p.currency_code.toLowerCase() === currencyCode.toLowerCase()
        );
        return legacyPrice?.amount ?? null;
    }, [currencyCode]);

    const handleAddToCart = useCallback((product: Product) => {
        const variantId = selectedVariants[product.id];
        const variant = product.variants.find(v => v.id === variantId);
        if (!variant) return;

        const priceAmount = getVariantPrice(variant);
        if (priceAmount === null) return;

        setAddingProductId(product.id);

        const quantity = quantities[product.id] || 1;
        const formattedPrice = new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currencyCode,
        }).format(priceAmount);

        // Get color from variant options
        const colorOption = variant.options?.find(opt =>
            opt.value && product.options?.some(o => o.id === opt.option_id && o.title.toLowerCase() === 'color')
        );

        addToCart({
            id: product.id,
            variantId: variant.id,
            title: product.title,
            price: formattedPrice,
            image: product.thumbnail || product.images?.[0]?.url || "",
            quantity,
            color: colorOption?.value,
        }, { silent: true });

        // Reset quantity and show brief feedback
        setQuantities(prev => ({ ...prev, [product.id]: 1 }));
        setTimeout(() => setAddingProductId(null), 800);
    }, [selectedVariants, quantities, currencyCode, addToCart, getVariantPrice]);

    // Check if a variant is available for purchase
    const isVariantAvailable = useCallback((variant: ProductVariant): boolean => {
        // If inventory is not managed, always available
        if (variant.manage_inventory === false) return true;
        // If backorders are allowed, always available
        if (variant.allow_backorder) return true;
        // Otherwise, check inventory quantity
        return (variant.inventory_quantity ?? 0) > 0;
    }, []);

    // Get available variants for a product
    const getAvailableVariants = useCallback((product: Product): ProductVariant[] => {
        return product.variants.filter(isVariantAvailable);
    }, [isVariantAvailable]);

    const getColorOptions = (product: Product): Array<{ variantId: string; color: string }> => {
        const colorOptionDef = product.options?.find(o => o.title.toLowerCase() === 'color');
        if (!colorOptionDef) return [];

        // Only include available variants
        return product.variants
            .filter(isVariantAvailable)
            .map(variant => {
                const colorOpt = variant.options?.find(opt => opt.option_id === colorOptionDef.id);
                return colorOpt ? { variantId: variant.id, color: colorOpt.value } : null;
            })
            .filter((item): item is { variantId: string; color: string } => item !== null);
    };

    return (
        <div className="mb-6">
            {/* Toggle Button - Shows + icon when collapsed */}
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
                                                    onClick={() => handleAddToCart(product)}
                                                    disabled={isAdding}
                                                    className={`px-2 py-1 text-xs rounded transition-colors ${
                                                        isAdding
                                                            ? 'bg-green-500 text-white'
                                                            : 'bg-accent-earthy text-white hover:bg-accent-earthy/90'
                                                    }`}
                                                >
                                                    {isAdding ? '✓ Added' : 'Add'}
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

export default QuickAddProductDialog;
