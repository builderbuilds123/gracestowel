import { useCart } from "../context/CartContext";
import { useLocale } from "../context/LocaleContext";
import { Link } from "react-router";
import { Star, Truck, ShieldCheck } from "lucide-react";
import { Towel } from "@phosphor-icons/react";

interface Product {
    id: number;
    title: string;
    price: string;
    description: string;
    images: string[];
    features: string[];
    dimensions: string;
    careInstructions: string[];
}

interface ProductDetailSkeletonProps {
    product: Product;
    relatedProducts: Product[];
}

export default function ProductDetailSkeleton({ product, relatedProducts }: ProductDetailSkeletonProps) {
    const { addToCart } = useCart();
    const { formatPrice, t } = useLocale();

    return (
        <div className="min-h-screen flex flex-col">

            <main className="flex-grow container mx-auto px-4 py-12 max-w-7xl">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-12 lg:gap-20">

                    {/* Image Gallery */}
                    <div className="space-y-4">
                        <div
                            className="aspect-square bg-card-earthy/20 rounded-lg overflow-hidden"
                        >
                            <img src={product.images[0]} alt={product.title} className="w-full h-full object-cover" />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            {product.images.slice(1).map((img, idx) => (
                                <div
                                    key={idx}
                                    className="aspect-square bg-card-earthy/20 rounded-lg overflow-hidden"
                                >
                                    <img src={img} alt="Detail" className="w-full h-full object-cover" />
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Product Info */}
                    <div className="flex flex-col justify-center">
                        <div>
                            <div className="flex items-center gap-2 mb-4 text-accent-earthy">
                                <div className="flex">
                                    {[...Array(5)].map((_, i) => (
                                        <Star key={i} className="w-4 h-4 fill-current" />
                                    ))}
                                </div>
                                <span className="text-sm text-text-earthy/60">(128 reviews)</span>
                            </div>

                            <h1 className="text-4xl md:text-5xl font-serif text-text-earthy mb-4">{product.title}</h1>
                            <p className="text-2xl text-accent-earthy font-medium mb-8">{formatPrice(product.price)}</p>

                            <p className="text-lg text-text-earthy/80 leading-relaxed mb-8">
                                {product.description}
                            </p>

                            <div className="space-y-4 mb-8">
                                {product.features.map((feature, idx) => (
                                    <div key={idx} className="flex items-center text-text-earthy/80">
                                        <div className="w-1.5 h-1.5 rounded-full bg-accent-earthy mr-3" />
                                        {feature}
                                    </div>
                                ))}
                            </div>

                            <div className="mb-8 p-6 bg-card-earthy/20 rounded-lg">
                                <h3 className="font-serif text-lg text-text-earthy mb-3">{t('product.details')}</h3>
                                <div className="grid grid-cols-2 gap-4 text-sm">
                                    <div>
                                        <span className="block font-semibold text-text-earthy/70 mb-1">{t('product.dimensions')}</span>
                                        <span className="text-text-earthy">{product.dimensions}</span>
                                    </div>
                                    <div>
                                        <span className="block font-semibold text-text-earthy/70 mb-1">{t('product.care')}</span>
                                        <ul className="list-disc list-inside text-text-earthy/80">
                                            {product.careInstructions.slice(0, 2).map((inst, i) => (
                                                <li key={i}>{inst}</li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>
                            </div>

                            <button
                                onClick={() => addToCart({ id: product.id, title: product.title, price: product.price, image: product.images[0] })}
                                className="w-full md:w-auto px-12 py-4 bg-accent-earthy text-white font-semibold rounded shadow-lg hover:bg-accent-earthy/90 transition-all transform hover:-translate-y-1 flex items-center justify-center gap-2 mb-8"
                            >
                                <Towel size={24} weight="regular" />
                                {t('product.add')}
                            </button>

                            <div className="grid grid-cols-2 gap-6 pt-8 border-t border-gray-100">
                                <div className="flex items-center gap-3 text-text-earthy/70">
                                    <Truck className="w-6 h-6 text-accent-earthy" />
                                    <span className="text-sm">Free shipping over $100</span>
                                </div>
                                <div className="flex items-center gap-3 text-text-earthy/70">
                                    <ShieldCheck className="w-6 h-6 text-accent-earthy" />
                                    <span className="text-sm">30-day satisfaction guarantee</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Complete the Set Section */}
                <section className="mt-24 mb-12">
                    <h2 className="text-3xl font-serif text-text-earthy mb-8 text-center">Complete the Set</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
                        {relatedProducts.map((relatedProduct) => (
                            <div key={relatedProduct.id} className="group">
                                <div className="relative overflow-hidden rounded mb-3 bg-card-earthy/20 aspect-[4/5]">
                                    <Link to={`/products/${relatedProduct.title.toLowerCase().replace(/ /g, "-")}`}>
                                        <img
                                            src={relatedProduct.images[0]}
                                            alt={relatedProduct.title}
                                            className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-500 ease-out"
                                        />
                                    </Link>
                                </div>
                                <h4 className="text-lg font-medium text-text-earthy mb-1">{relatedProduct.title}</h4>
                                <span className="text-accent-earthy font-medium">{formatPrice(relatedProduct.price)}</span>
                            </div>
                        ))}
                    </div>
                </section>
            </main>
        </div>
    );
}
