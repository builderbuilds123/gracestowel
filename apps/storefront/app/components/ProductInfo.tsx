/**
 * ProductInfo Component
 * 
 * Displays product header information: rating, title, price, stock status, and description.
 * Extracted from products.$handle.tsx for better component organization.
 */

import { Star } from "../lib/icons";
import { WishlistButton } from "./WishlistButton";
import { useLocale } from "../context/LocaleContext";
import type { StockStatus } from "../lib/medusa";
import { getStockStatusDisplay } from "../lib/medusa";

interface ProductInfoProps {
    product: {
        id: string;
        handle: string;
        title: string;
        price: number;
        formattedPrice: string;
        description: string;
        images: string[];
    };
    reviewStats: {
        average: number;
        count: number;
    };
    stockStatus: StockStatus;
}

export function ProductInfo({ product, reviewStats, stockStatus }: ProductInfoProps) {
    const { formatPrice } = useLocale();
    const stockDisplay = getStockStatusDisplay(stockStatus);

    return (
        <>
            {/* Rating */}
            <div className="flex items-center gap-2 mb-4 text-accent-earthy">
                <div className="flex">
                    {[...Array(5)].map((_, i) => (
                        <Star 
                            key={i} 
                            className={`w-4 h-4 ${
                                i < Math.round(reviewStats.average) 
                                    ? "fill-current" 
                                    : "fill-gray-200 text-gray-200"
                            }`} 
                        />
                    ))}
                </div>
                <a 
                    href="#reviews" 
                    className="text-sm text-text-earthy/60 hover:text-accent-earthy transition-colors"
                >
                    ({reviewStats.count} review{reviewStats.count !== 1 ? "s" : ""})
                </a>
            </div>

            {/* Title & Wishlist */}
            <div className="flex items-start justify-between gap-4 mb-4">
                <h1 className="text-4xl md:text-5xl font-serif text-text-earthy">
                    {product.title}
                </h1>
                <WishlistButton
                    product={{
                        id: product.id,
                        handle: product.handle,
                        title: product.title,
                        price: product.formattedPrice,
                        image: product.images[0]
                    }}
                    size="lg"
                    showLabel
                    className="mt-2"
                />
            </div>

            {/* Price & Stock */}
            <div className="flex items-center gap-4 mb-8">
                <p className="text-2xl text-accent-earthy font-medium">
                    {formatPrice(product.price)}
                </p>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${stockDisplay.bgColor} ${stockDisplay.color}`}>
                    {stockDisplay.label}
                </span>
            </div>

            {/* Description */}
            <p className="text-lg text-text-earthy/80 leading-relaxed mb-8">
                {product.description}
            </p>
        </>
    );
}

