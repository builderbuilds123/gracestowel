import { useLocale } from '../context/LocaleContext';
import { isFreePrice } from '../lib/price';

interface ProductPriceProps {
    price: string | number;
    originalPrice?: string | number;
    className?: string;
}

export function ProductPrice({ price, originalPrice, className = '' }: ProductPriceProps) {
    const { formatPrice } = useLocale();

    const currentPrice = typeof price === 'string' ? price : formatPrice(price);
    const hasDiscount = originalPrice && originalPrice !== price;
    const isFree = typeof currentPrice === 'string' ? isFreePrice(currentPrice) : false;

    return (
        <div className={`flex items-center gap-2 ${className}`}>
            {hasDiscount && (
                <span className="text-text-earthy/40 line-through text-sm">
                    {typeof originalPrice === 'string' ? originalPrice : formatPrice(originalPrice)}
                </span>
            )}
            <span className={`font-medium ${isFree ? 'text-green-600' : 'text-accent-earthy'}`}>
                {currentPrice}
            </span>
        </div>
    );
}
