import { useCart } from "../context/CartContext";
import { useLocale } from "../context/LocaleContext";
import { Link } from "react-router";
import { Towel } from "@phosphor-icons/react";
import { WishlistButton } from "./WishlistButton";

interface ProductCardProps {
    id: string | number;
    image: string;
    title: string;
    description: string;
    price: string;
    handle: string;
}

export function ProductCard({ id, image, title, description, price, handle }: ProductCardProps) {
    const { addToCart } = useCart();

    const { formatPrice } = useLocale();

    const handleAddToCart = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        addToCart({ id, title, price, image });
    };

    return (
        <div className="group">
            <div className="relative overflow-hidden rounded mb-3 bg-card-earthy/20">
                <Link to={`/products/${handle}`}>
                    <img
                        src={image}
                        alt={title}
                        width="400"
                        height="300"
                        loading="lazy"
                        className="w-full h-48 object-cover transform group-hover:scale-105 transition-transform duration-500 ease-out"
                    />
                </Link>
                {/* Wishlist Button */}
                <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-20">
                    <div className="p-2 bg-white/90 backdrop-blur-sm rounded-full shadow-lg">
                        <WishlistButton
                            product={{ id: String(id), handle, title, price, image }}
                            size="sm"
                        />
                    </div>
                </div>
                {/* Add to Cart Button */}
                <button
                    onClick={handleAddToCart}
                    className="absolute bottom-3 right-3 p-2.5 bg-white/90 backdrop-blur-sm text-text-earthy rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-2 group-hover:translate-y-0 hover:bg-accent-earthy hover:text-white z-20 cursor-pointer"
                    aria-label="Hang it Up"
                >
                    <Towel size={20} weight="regular" />
                </button>
            </div>
            <div>
                <Link to={`/products/${handle}`}>
                    <h4 className="text-base font-medium text-text-earthy mb-1 hover:text-accent-earthy transition-colors">{title}</h4>
                </Link>
                <span className="text-sm font-semibold text-accent-earthy">{formatPrice(price)}</span>
            </div>
        </div>
    );
}
