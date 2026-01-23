import { Link } from "react-router";
import { Heart, ShoppingBag, Trash2 } from "../lib/icons";
import { useWishlist } from "../context/WishlistContext";
import { useCart } from "../context/CartContext";
import { useLocale } from "../context/LocaleContext";
import { Image } from "../components/ui/Image";

export default function WishlistPage() {
    const { items, removeItem, clearWishlist } = useWishlist();
    const { addToCart } = useCart();
    const { formatPrice } = useLocale();

    const handleAddToCart = (item: typeof items[0]) => {
        addToCart({
            id: item.id,
            title: item.title,
            price: item.price,
            image: item.image,
        });
    };

    const handleAddAllToCart = () => {
        items.forEach(item => handleAddToCart(item));
    };

    if (items.length === 0) {
        return (
            <div className="min-h-screen bg-background-earthy pt-24 pb-16">
                <div className="container mx-auto px-4 md:px-8">
                    <div className="text-center max-w-md mx-auto py-16">
                        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-card-earthy/30 flex items-center justify-center">
                            <Heart className="w-10 h-10 text-text-earthy/40" />
                        </div>
                        <h1 className="text-3xl font-serif text-text-earthy mb-4">Your Wishlist is Empty</h1>
                        <p className="text-text-earthy/60 mb-8">
                            Save items you love by clicking the heart icon on any product.
                        </p>
                        <Link
                            to="/towels"
                            className="inline-block px-6 py-3 bg-accent-earthy text-white rounded-lg hover:bg-accent-earthy/90 transition-colors"
                        >
                            Browse Products
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background-earthy pt-24 pb-16">
            <div className="container mx-auto px-4 md:px-8">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
                    <div>
                        <h1 className="text-3xl md:text-4xl font-serif text-text-earthy mb-2">
                            My Wishlist
                        </h1>
                        <p className="text-text-earthy/60">
                            {items.length} item{items.length !== 1 ? 's' : ''} saved
                        </p>
                    </div>
                    <div className="flex gap-3 mt-4 md:mt-0">
                        <button
                            onClick={handleAddAllToCart}
                            className="flex items-center gap-2 px-4 py-2 bg-accent-earthy text-white rounded-lg hover:bg-accent-earthy/90 transition-colors"
                        >
                            <ShoppingBag className="w-4 h-4" />
                            Add All to Cart
                        </button>
                        <button
                            onClick={clearWishlist}
                            className="flex items-center gap-2 px-4 py-2 border border-card-earthy/30 text-text-earthy rounded-lg hover:bg-card-earthy/10 transition-colors"
                        >
                            Clear All
                        </button>
                    </div>
                </div>

                {/* Wishlist Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {items.map((item) => (
                        <div key={item.id} className="bg-white rounded-lg border border-card-earthy/20 overflow-hidden group">
                            <Link to={`/products/${item.handle}`} className="block">
                                <div className="relative aspect-square bg-card-earthy/10">
                                    <Image
                                        src={item.image}
                                        alt={item.title}
                                        width={400}
                                        height={400}
                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                    />
                                </div>
                            </Link>
                            <div className="p-4">
                                <Link to={`/products/${item.handle}`}>
                                    <h3 className="font-medium text-text-earthy mb-1 hover:text-accent-earthy transition-colors">
                                        {item.title}
                                    </h3>
                                </Link>
                                <p className="text-accent-earthy font-semibold mb-4">
                                    {formatPrice(item.price)}
                                </p>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => handleAddToCart(item)}
                                        className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-accent-earthy text-white text-sm rounded-lg hover:bg-accent-earthy/90 transition-colors"
                                    >
                                        <ShoppingBag className="w-4 h-4" />
                                        Add to Cart
                                    </button>
                                    <button
                                        onClick={() => removeItem(item.id)}
                                        className="p-2 border border-card-earthy/30 text-text-earthy/60 rounded-lg hover:bg-red-50 hover:border-red-200 hover:text-red-500 transition-colors"
                                        aria-label="Remove from wishlist"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Continue Shopping */}
                <div className="mt-12 text-center">
                    <Link
                        to="/towels"
                        className="inline-flex items-center gap-2 text-accent-earthy hover:underline"
                    >
                        Continue Shopping
                    </Link>
                </div>
            </div>
        </div>
    );
}

