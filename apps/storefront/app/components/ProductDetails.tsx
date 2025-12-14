/**
 * ProductDetails Component
 * 
 * Displays product features, dimensions, care instructions, and shipping info.
 * Extracted from products.$handle.tsx for better component organization.
 */

import { Truck, ShieldCheck } from "lucide-react";
import { useLocale } from "../context/LocaleContext";

interface ProductDetailsProps {
    features: string[];
    dimensions: string;
    careInstructions: string[];
}

export function ProductDetails({ features, dimensions, careInstructions }: ProductDetailsProps) {
    const { t } = useLocale();

    return (
        <>
            {/* Features List */}
            {features.length > 0 && (
                <div className="space-y-4 mb-8">
                    {features.map((feature, idx) => (
                        <div key={idx} className="flex items-center text-text-earthy/80">
                            <div className="w-1.5 h-1.5 rounded-full bg-accent-earthy mr-3" />
                            {feature}
                        </div>
                    ))}
                </div>
            )}

            {/* Product Details Card */}
            <div className="mb-8 p-6 bg-card-earthy/20 rounded-lg">
                <h3 className="font-serif text-lg text-text-earthy mb-3">
                    {t('product.details')}
                </h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                    {dimensions && (
                        <div>
                            <span className="block font-semibold text-text-earthy/70 mb-1">
                                {t('product.dimensions')}
                            </span>
                            <span className="text-text-earthy">{dimensions}</span>
                        </div>
                    )}
                    {careInstructions.length > 0 && (
                        <div>
                            <span className="block font-semibold text-text-earthy/70 mb-1">
                                {t('product.care')}
                            </span>
                            <ul className="list-disc list-inside text-text-earthy/80">
                                {careInstructions.slice(0, 2).map((inst, i) => (
                                    <li key={i}>{inst}</li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            </div>

            {/* Shipping & Guarantee */}
            <div className="grid grid-cols-2 gap-6 pt-8 border-t border-gray-100">
<div className="flex items-center gap-2 text-text-earthy/60">
    <Truck className="w-5 h-5" />
    <span className="text-sm">Fast, tracked shipping</span>
</div>
                <div className="flex items-center gap-3 text-text-earthy/70">
                    <ShieldCheck className="w-6 h-6 text-accent-earthy" />
                    <span className="text-sm">30-day satisfaction guarantee</span>
                </div>
            </div>
        </>
    );
}

