import { useState, useEffect, useCallback } from "react";
import { X, Loader2, Plus, Minus, ShoppingBag } from "../lib/icons";
import { useCart } from "../context/CartContext";
import { useLocale } from "../context/LocaleContext";
import { medusaFetch } from "../lib/medusa-fetch";
import { createLogger } from "../lib/logger";
import { Image } from "./ui/Image";

interface ProductVariant {
    id: string;
    title: string;
    prices: Array<{
        amount: number;
        currency_code: string;
    }>;
    options?: Array<{
        id: string;
        value: string;
        option_id: string;
    }>;
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
    onClose: () => void;
    regionId?: string | null;
}

/**
 * Minimal product selection dialog for quick adding items to cart.
 * Shows product image, name, color selector, quantity, and price.
 */
export function QuickAddProductDialog({ isOpen, onClose, regionId }: QuickAddProductDialogProps) {
    const { addToCart } = useCart();
    const { currencyCode } = useLocale();
    const [isLoadingProducts, setIsLoadingProducts] = useState(true);
    const [products, setProducts] = useState<Product[]>([]);
    const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({});
    const [quantities, setQuantities] = useState<Record<string, number>>({});

    const logger = createLogger({ context: "QuickAddProductDialog" });

    // Fetch products when dialog opens
    useEffect(() => {
        if (isOpen) {
            fetchProducts();
        }
    }, [isOpen]);

    const fetchProducts = async () => {
        setIsLoadingProducts(true);
        try {
            const params = new URLSearchParams();
            params.append('limit', '10');
            if (regionId) {
                params.append('region_id', regionId);
            }
            const response = await medusaFetch(`/store/products?${params.toString()}`, {
                method: "GET",
                label: "quick-add-products",
            });
            if (response.ok) {
                const data = await response.json() as { products?: Product[] };
                const productList = data.products || [];
                setProducts(productList);

                // Initialize selected variants to first variant of each product
                const initialVariants: Record<string, string> = {};
                const initialQuantities: Record<string, number> = {};
                productList.forEach(product => {
                    if (product.variants.length > 0) {
                        initialVariants[product.id] = product.variants[0].id;
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

    const handleAddToCart = useCallback((product: Product) => {
        const variantId = selectedVariants[product.id];
        const variant = product.variants.find(v => v.id === variantId);
        if (!variant) return;

        const price = variant.prices.find(p => p.currency_code.toLowerCase() === currencyCode.toLowerCase());
        if (!price) return;

        const quantity = quantities[product.id] || 1;
        const formattedPrice = new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currencyCode,
        }).format(price.amount);

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
        });

        // Reset quantity after adding
        setQuantities(prev => ({ ...prev, [product.id]: 1 }));
    }, [selectedVariants, quantities, currencyCode, addToCart]);

    const formatPrice = (amount: number) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currencyCode,
        }).format(amount);
    };

    const getColorOptions = (product: Product): Array<{ variantId: string; color: string }> => {
        const colorOptionDef = product.options?.find(o => o.title.toLowerCase() === 'color');
        if (!colorOptionDef) return [];

        return product.variants
            .map(variant => {
                const colorOpt = variant.options?.find(opt => opt.option_id === colorOptionDef.id);
                return colorOpt ? { variantId: variant.id, color: colorOpt.value } : null;
            })
            .filter((item): item is { variantId: string; color: string } => item !== null);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/50" onClick={onClose} />

            {/* Dialog */}
            <div className="relative bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[85vh] flex flex-col">
                {/* Header */}
                <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                    <h2 className="text-lg font-serif text-text-earthy">Add Products</h2>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600"
                        aria-label="Close dialog"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Products List */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {isLoadingProducts ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="w-8 h-8 animate-spin text-accent-earthy" />
                        </div>
                    ) : products.length === 0 ? (
                        <p className="text-center text-gray-500 py-12">No products available</p>
                    ) : (
                        products.map(product => {
                            const selectedVariantId = selectedVariants[product.id];
                            const selectedVariant = product.variants.find(v => v.id === selectedVariantId);
                            const price = selectedVariant?.prices.find(p =>
                                p.currency_code.toLowerCase() === currencyCode.toLowerCase()
                            );
                            const colorOptions = getColorOptions(product);
                            const quantity = quantities[product.id] || 1;

                            if (!price) return null;

                            return (
                                <div key={product.id} className="flex gap-4 p-3 border border-gray-200 rounded-lg">
                                    {/* Product Image */}
                                    <div className="w-20 h-20 flex-shrink-0 bg-gray-100 rounded-lg overflow-hidden">
                                        {product.thumbnail ? (
                                            <Image
                                                src={product.thumbnail}
                                                alt={product.title}
                                                width={80}
                                                height={80}
                                                className="w-full h-full object-cover"
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center">
                                                <ShoppingBag className="w-8 h-8 text-gray-300" />
                                            </div>
                                        )}
                                    </div>

                                    {/* Product Details */}
                                    <div className="flex-1 min-w-0">
                                        <h3 className="font-medium text-text-earthy text-sm truncate">
                                            {product.title}
                                        </h3>
                                        <p className="text-accent-earthy font-medium text-sm mt-0.5">
                                            {formatPrice(price.amount)}
                                        </p>

                                        {/* Color Selector */}
                                        {colorOptions.length > 1 ? (
                                            <div className="flex gap-1.5 mt-2">
                                                {colorOptions.map(({ variantId, color }) => (
                                                    <button
                                                        key={variantId}
                                                        onClick={() => handleVariantChange(product.id, variantId)}
                                                        className={`w-6 h-6 rounded-full border-2 transition-all ${
                                                            selectedVariantId === variantId
                                                                ? 'border-accent-earthy ring-2 ring-accent-earthy/30'
                                                                : 'border-gray-300 hover:border-gray-400'
                                                        }`}
                                                        style={{ backgroundColor: color.toLowerCase() }}
                                                        title={color}
                                                        aria-label={`Select ${color}`}
                                                    />
                                                ))}
                                            </div>
                                        ) : null}

                                        {/* Quantity & Add Button */}
                                        <div className="flex items-center gap-3 mt-2">
                                            <div className="flex items-center border border-gray-200 rounded">
                                                <button
                                                    onClick={() => handleQuantityChange(product.id, -1)}
                                                    className="p-1 hover:bg-gray-100"
                                                    aria-label="Decrease quantity"
                                                >
                                                    <Minus className="w-3 h-3" />
                                                </button>
                                                <span className="px-2 text-sm font-medium min-w-[24px] text-center">
                                                    {quantity}
                                                </span>
                                                <button
                                                    onClick={() => handleQuantityChange(product.id, 1)}
                                                    className="p-1 hover:bg-gray-100"
                                                    aria-label="Increase quantity"
                                                >
                                                    <Plus className="w-3 h-3" />
                                                </button>
                                            </div>
                                            <button
                                                onClick={() => handleAddToCart(product)}
                                                className="px-3 py-1 text-xs bg-accent-earthy text-white rounded hover:bg-accent-earthy/90 transition-colors"
                                            >
                                                Add to Cart
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
}

export default QuickAddProductDialog;
