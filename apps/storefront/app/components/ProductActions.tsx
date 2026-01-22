/**
 * ProductActions Component
 * 
 * Handles color selection, quantity, and add-to-cart.
 * Extracted from products.$handle.tsx for better component organization.
 * 
 * NOTE: Embroidery customization feature was removed to address CodeQL
 * security vulnerability (XSS through DOM). Can be re-added with proper
 * sanitization in the future.
 */

import { useState } from "react";
import { Towel } from "@phosphor-icons/react";
import { useCart } from "../context/CartContext";
import { useLocale } from "../context/LocaleContext";

import { PRODUCT_COLOR_MAP } from "../lib/colors";


interface ProductActionsProps {
    product: {
        id: string;
        title: string;
        formattedPrice: string;
        images: string[];
        colors: string[];
        disableEmbroidery: boolean;
        variants: Array<{
            id: string;
            title: string;
            sku?: string;
            options?: Array<{
                value: string;
            }>;
        }>;
    };
    selectedVariant?: {
        id: string;
        sku?: string | null;
        inventory_quantity?: number;
    };
    selectedColor: string;
    onColorChange: (color: string) => void;
    isOutOfStock: boolean;
}

export function ProductActions({ product, selectedVariant, selectedColor, onColorChange, isOutOfStock }: ProductActionsProps) {
    const { addToCart } = useCart();
    const { t } = useLocale();
    
    const [quantity, setQuantity] = useState(1);

    const handleQuantityChange = (delta: number) => {
        setQuantity(prev => Math.max(1, prev + delta));
    };

    const handleAddToCart = () => {
        const variantId = selectedVariant?.id;
        
        addToCart({
            id: product.id,
            variantId: variantId || "",
            sku: selectedVariant?.sku || undefined,
            title: product.title,
            price: product.formattedPrice,
            image: product.images[0],
            quantity,
            color: selectedColor,
        });

        // Track add to cart event in PostHog
        if (typeof window !== 'undefined') {
            import('../utils/posthog').then(({ default: posthog }) => {
                posthog.capture('product_added_to_cart', {
                    product_id: product.id,
                    product_name: product.title,
                    product_price: product.formattedPrice,
                    quantity,
                    color: selectedColor,
                    variant_id: variantId,
                });
            });
        }
    };

    return (
        <>
            {/* Color Selector */}
            {product.colors.length > 0 && (
                <div className="mb-8">
                    <span className="block text-sm font-medium text-text-earthy mb-3">
                        Color: <span className="text-text-earthy/60">{selectedColor}</span>
                    </span>
                    <div className="flex gap-3">
                        {product.colors.map((color) => (
                            <button
                                key={color}
                                onClick={() => onColorChange(color)}
                                className={`w-10 h-10 rounded-full border-2 transition-all cursor-pointer ${
                                    selectedColor === color
                                        ? "border-accent-earthy ring-2 ring-accent-earthy/20 ring-offset-2"
                                        : "border-transparent hover:scale-110"
                                }`}
                                style={{ backgroundColor: PRODUCT_COLOR_MAP[color] || "#ccc" }}
                                aria-label={`Select color ${color}`}
                                title={color}
                            />
                        ))}
                    </div>
                </div>
            )}

            {/* Quantity and Add Button */}
            <div className="flex flex-col sm:flex-row gap-4 mb-10">
                <div className="flex items-center border border-card-earthy bg-card-earthy/10 rounded-lg h-14 w-fit">
                    <button
                        onClick={() => handleQuantityChange(-1)}
                        className="px-4 h-full hover:bg-card-earthy/20 text-text-earthy transition-colors rounded-l-lg cursor-pointer"
                        aria-label="Decrease quantity"
                    >
                        -
                    </button>
                    <span className="px-4 text-text-earthy font-medium min-w-[3rem] text-center">
                        {quantity}
                    </span>
                    <button
                        onClick={() => handleQuantityChange(1)}
                        className="px-4 h-full hover:bg-card-earthy/20 text-text-earthy transition-colors rounded-r-lg cursor-pointer"
                        aria-label="Increase quantity"
                    >
                        +
                    </button>
                </div>

                <button
                    onClick={handleAddToCart}
                    disabled={isOutOfStock}
                    className={`flex-1 px-8 h-14 font-semibold rounded-lg shadow-lg transition-all flex items-center justify-center gap-2 ${
                        isOutOfStock
                            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                            : 'bg-accent-earthy text-white hover:bg-accent-earthy/90 transform hover:-translate-y-0.5 cursor-pointer'
                    }`}
                >
                    <Towel size={24} weight="regular" />
                    {isOutOfStock ? 'Out of Stock' : t('product.add')}
                </button>
            </div>
        </>
    );
}

