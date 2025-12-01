/**
 * RelatedProducts Component
 * 
 * Displays a "Complete the Set" section with related products.
 * Extracted from products.$handle.tsx for better component organization.
 */

import { Link } from "react-router";
import { useLocale } from "../context/LocaleContext";

interface RelatedProduct {
    id: string;
    handle: string;
    title: string;
    price: number;
    images: string[];
}

interface RelatedProductsProps {
    products: RelatedProduct[];
    title?: string;
}

export function RelatedProducts({ 
    products, 
    title = "Complete the Set" 
}: RelatedProductsProps) {
    const { formatPrice } = useLocale();
    
    if (products.length === 0) {
        return null;
    }

    return (
        <section className="mt-24 mb-12">
            <h2 className="text-3xl font-serif text-text-earthy mb-8 text-center">
                {title}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
                {products.map((product) => (
                    <div key={product.id} className="group">
                        <div className="relative overflow-hidden rounded mb-3 bg-card-earthy/20 aspect-[4/5]">
                            <Link to={`/products/${product.handle}`}>
                                <img
                                    src={product.images[0]}
                                    alt={product.title}
                                    className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-500 ease-out"
                                    loading="lazy"
                                    width="400"
                                    height="500"
                                />
                            </Link>
                        </div>
                        <h4 className="text-lg font-medium text-text-earthy mb-1">
                            {product.title}
                        </h4>
                        <span className="text-accent-earthy font-medium">
                            {formatPrice(product.price)}
                        </span>
                    </div>
                ))}
            </div>
        </section>
    );
}

