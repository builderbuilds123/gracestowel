import { Heart } from "../lib/icons";
import { useWishlist, type WishlistItem } from "../context/WishlistContext";

interface WishlistButtonProps {
    product: Omit<WishlistItem, "addedAt">;
    size?: "sm" | "md" | "lg";
    showLabel?: boolean;
    className?: string;
}

export function WishlistButton({ 
    product, 
    size = "md", 
    showLabel = false,
    className = "" 
}: WishlistButtonProps) {
    const { isInWishlist, toggleItem } = useWishlist();
    const isWishlisted = isInWishlist(product.id);

    const sizeClasses = {
        sm: "w-4 h-4",
        md: "w-5 h-5",
        lg: "w-6 h-6",
    };

    const handleClick = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        toggleItem(product);
    };

    return (
        <button
            onClick={handleClick}
            className={`group flex items-center gap-2 transition-all ${className}`}
            aria-label={isWishlisted ? "Remove from wishlist" : "Add to wishlist"}
            title={isWishlisted ? "Remove from wishlist" : "Add to wishlist"}
        >
            <Heart
                className={`${sizeClasses[size]} transition-all ${
                    isWishlisted
                        ? "fill-red-500 text-red-500"
                        : "text-text-earthy/60 group-hover:text-red-400"
                }`}
            />
            {showLabel ? (
                <span className={`text-sm ${isWishlisted ? "text-red-500" : "text-text-earthy/60 group-hover:text-text-earthy"}`}>
                    {isWishlisted ? "Saved" : "Save"}
                </span>
            ) : null}
        </button>
    );
}

