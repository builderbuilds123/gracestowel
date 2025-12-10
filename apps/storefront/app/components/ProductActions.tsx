/**
 * ProductActions Component
 * 
 * Handles color selection, embroidery customization, quantity, and add-to-cart.
 * Extracted from products.$handle.tsx for better component organization.
 */

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Towel } from "@phosphor-icons/react";
import { EmbroideryCustomizer } from "./EmbroideryCustomizer";
import { useCart } from "../context/CartContext";
import { useLocale } from "../context/LocaleContext";
import type { EmbroideryData } from "../types/product";

// Embroidery Preview Sub-component
function EmbroideryPreview({ data, onEdit }: { data: EmbroideryData; onEdit: () => void }) {
    return (
        <div className="mt-4 p-4 bg-accent-earthy/5 border-2 border-accent-earthy/20 rounded-lg">
            <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold text-text-earthy flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-accent-earthy" />
                    Your Custom Embroidery
                </h4>
                <button
                    onClick={onEdit}
                    className="text-xs text-accent-earthy hover:underline cursor-pointer"
                >
                    Edit
                </button>
            </div>
            {data.type === 'text' ? (
                <div
                    className="text-2xl text-center py-4"
                    style={{
                        fontFamily: data.font,
                        color: data.color,
                        textShadow: `
                            1px 1px 0 rgba(0,0,0,0.1),
                            2px 2px 0 rgba(0,0,0,0.05),
                            -1px -1px 0 rgba(255,255,255,0.3)
                        `
                    }}
                >
                    {data.data}
                </div>
            ) : (
                <div className="flex justify-center">
                    <img
                        src={data.data}
                        alt="Custom embroidery drawing"
                        className="max-w-full h-32 rounded border border-gray-200"
                    />
                </div>
            )}
        </div>
    );
}

// Color mapping for swatches
const COLOR_MAP: Record<string, string> = {
    "Cloud White": "#F5F5F5",
    "Sage": "#9CAF88",
    "Terra Cotta": "#E2725B",
    "Charcoal": "#36454F",
    "Navy": "#202A44",
    "Sand": "#E6DCD0",
    "Stone": "#9EA3A8"
};

interface ProductActionsProps {
    product: {
        id: string;
        title: string;
        formattedPrice: string;
        images: string[];
        colors: string[];
        disableEmbroidery: boolean;
    };
    selectedVariant?: {
        id: string;
        sku?: string | null;
    };
    isOutOfStock: boolean;
}

export function ProductActions({ product, selectedVariant, isOutOfStock }: ProductActionsProps) {
    const { addToCart } = useCart();
    const { t } = useLocale();
    
    const [quantity, setQuantity] = useState(1);
    const [selectedColor, setSelectedColor] = useState(product.colors[0] || "");
    const [isEmbroideryOpen, setIsEmbroideryOpen] = useState(false);
    const [embroideryData, setEmbroideryData] = useState<EmbroideryData | null>(null);

    const handleQuantityChange = (delta: number) => {
        setQuantity(prev => Math.max(1, prev + delta));
    };

    const handleEmbroideryConfirm = (data: EmbroideryData | null) => {
        if (data) {
            setEmbroideryData(data);
        }
        setIsEmbroideryOpen(false);
    };

    const handleAddToCart = () => {
        addToCart({
            id: product.id,
            variantId: selectedVariant?.id,
            sku: selectedVariant?.sku || undefined,
            title: product.title,
            price: product.formattedPrice,
            image: product.images[0],
            quantity,
            color: selectedColor,
            embroidery: embroideryData || undefined
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
                    has_embroidery: !!embroideryData,
                    variant_id: selectedVariant?.id,
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
                                onClick={() => setSelectedColor(color)}
                                className={`w-10 h-10 rounded-full border-2 transition-all cursor-pointer ${
                                    selectedColor === color
                                        ? "border-accent-earthy ring-2 ring-accent-earthy/20 ring-offset-2"
                                        : "border-transparent hover:scale-110"
                                }`}
                                style={{ backgroundColor: COLOR_MAP[color] || "#ccc" }}
                                aria-label={`Select color ${color}`}
                                title={color}
                            />
                        ))}
                    </div>
                </div>
            )}

            {/* Embroidery Customization Button */}
            {!product.disableEmbroidery && (
                <div className="mb-6">
                    <button
                        onClick={() => setIsEmbroideryOpen(true)}
                        className={`w-full sm:w-auto px-6 py-3 rounded-lg border-2 transition-all flex items-center justify-center gap-2 cursor-pointer ${
                            embroideryData
                                ? 'border-accent-earthy bg-accent-earthy/10 text-accent-earthy'
                                : 'border-gray-300 hover:border-accent-earthy text-text-earthy'
                        }`}
                    >
                        <Sparkles className="w-5 h-5" />
                        {embroideryData ? 'Edit Custom Embroidery' : 'Add Custom Embroidery'}
                    </button>

                    {/* Embroidery Preview */}
                    {embroideryData && (
                        <EmbroideryPreview 
                            data={embroideryData} 
                            onEdit={() => setIsEmbroideryOpen(true)} 
                        />
                    )}
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

            {/* Embroidery Customizer Modal */}
            <EmbroideryCustomizer
                isOpen={isEmbroideryOpen}
                onClose={() => setIsEmbroideryOpen(false)}
                onConfirm={handleEmbroideryConfirm}
            />
        </>
    );
}

