import type { Route } from "./+types/products.$handle";
import { Link, useFetcher } from "react-router";
import { useState, useCallback } from "react";
import { useCart } from "../context/CartContext";
import { useLocale } from "../context/LocaleContext";
import { Star, Truck, ShieldCheck, Sparkles, MessageSquarePlus } from "lucide-react";
import { Towel } from "@phosphor-icons/react";
import { EmbroideryCustomizer } from "../components/EmbroideryCustomizer";
import { WishlistButton } from "../components/WishlistButton";
import { ReviewSection, type Review, type ReviewStats } from "../components/ReviewSection";
import { ReviewForm } from "../components/ReviewForm";
import { getMedusaClient } from "../lib/medusa.server";
import { getProductPrice, getStockStatus, getStockStatusDisplay, type MedusaProduct } from "../lib/medusa";
import { products as staticProducts } from "../data/products";
import { getProductByHandleFromDB, getProductsFromDB, isHyperdriveAvailable } from "../lib/products.server";

// SEO Meta tags for product pages
export function meta({ data }: Route.MetaArgs) {
    if (!data?.product) {
        return [
            { title: "Product Not Found | Grace Stowel" },
            { name: "description", content: "The requested product could not be found." },
        ];
    }

    const { product } = data;
    const title = `${product.title} | Grace Stowel - Premium Towels`;
    const description = product.description?.slice(0, 160) ||
        `Shop ${product.title} - premium quality towel from Grace Stowel. Made with 100% organic cotton.`;

    return [
        { title },
        { name: "description", content: description },
        // Open Graph
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "product" },
        { property: "og:image", content: product.images?.[0] || "" },
        { property: "og:url", content: `https://gracestowel.com/products/${product.handle}` },
        // Twitter Card
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
        { name: "twitter:image", content: product.images?.[0] || "" },
        // Product specific
        { property: "product:price:amount", content: String(product.price / 100) },
        { property: "product:price:currency", content: "USD" },
    ];
}

// Transform Medusa product to the format expected by the component
function transformMedusaProduct(product: MedusaProduct) {
    const priceData = getProductPrice(product, "usd");
    const metadata = product.metadata || {};

    // Parse features and care instructions from metadata
    let features: string[] = [];
    let careInstructions: string[] = [];

    try {
        if (metadata.features) {
            features = typeof metadata.features === 'string'
                ? JSON.parse(metadata.features)
                : metadata.features as string[];
        }
        if (metadata.care_instructions) {
            careInstructions = typeof metadata.care_instructions === 'string'
                ? JSON.parse(metadata.care_instructions)
                : metadata.care_instructions as string[];
        }
    } catch (e) {
        console.error("Error parsing product metadata:", e);
    }

    // Extract colors from variants
    const colors = product.variants
        ?.map(v => v.options?.find(o => o.value)?.value)
        .filter((c): c is string => !!c) || [];

    return {
        id: product.id,
        handle: product.handle,
        title: product.title,
        price: priceData?.amount || 0,
        formattedPrice: priceData?.formatted || "$0.00",
        description: product.description || "",
        images: product.images?.map(img => img.url) || [product.thumbnail || "/placeholder.jpg"],
        features,
        dimensions: (metadata.dimensions as string) || "",
        careInstructions,
        colors,
        disableEmbroidery: metadata.disable_embroidery === "true",
        variants: product.variants,
    };
}

// Fetch reviews from the backend
async function fetchReviews(productId: string, backendUrl: string, sort = "newest") {
    try {
        const response = await fetch(`${backendUrl}/store/products/${productId}/reviews?sort=${sort}&limit=10`);
        if (response.ok) {
            return await response.json();
        }
    } catch (error) {
        console.error("Failed to fetch reviews:", error);
    }
    return { reviews: [], stats: { average: 0, count: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } } };
}

export async function loader({ params, context }: Route.LoaderArgs) {
    const { handle } = params;

    if (!handle) {
        throw new Response("Product not found", { status: 404 });
    }

    const backendUrl = (context as { cloudflare?: { env?: { MEDUSA_BACKEND_URL?: string } } })?.cloudflare?.env?.MEDUSA_BACKEND_URL || "http://localhost:9000";

    // Strategy: Try Hyperdrive (direct DB) first for fastest response,
    // then fall back to Medusa API, then to static products
    let medusaProduct: MedusaProduct | null = null;
    let allProducts: { products: MedusaProduct[] } = { products: [] };
    let dataSource: "hyperdrive" | "medusa" | "static" = "static";

    // 1. Try Hyperdrive (direct PostgreSQL via connection pooling)
    if (isHyperdriveAvailable(context)) {
        try {
            const startTime = Date.now();
            const [productResult, productsResult] = await Promise.all([
                getProductByHandleFromDB(context, handle),
                getProductsFromDB(context, { limit: 10 }),
            ]);

            if (productResult) {
                medusaProduct = productResult;
                allProducts = productsResult;
                dataSource = "hyperdrive";
                console.log(`✅ Hyperdrive: Fetched product in ${Date.now() - startTime}ms`);
            }
        } catch (error) {
            console.warn("⚠️ Hyperdrive failed, falling back to Medusa API:", error);
        }
    }

    // 2. Fall back to Medusa API if Hyperdrive didn't work
    if (!medusaProduct) {
        try {
            const startTime = Date.now();
            const medusa = getMedusaClient(context);
            medusaProduct = await medusa.getProductByHandle(handle);

            if (medusaProduct) {
                allProducts = await medusa.getProducts({ limit: 10 });
                dataSource = "medusa";
                console.log(`✅ Medusa API: Fetched product in ${Date.now() - startTime}ms`);
            }
        } catch (error) {
            console.error("Failed to fetch product from Medusa:", error);
        }
    }

    // 3. Return Medusa/Hyperdrive product if found
    if (medusaProduct) {
        const product = transformMedusaProduct(medusaProduct);

        // Fetch reviews from Medusa backend (reviews require API, not direct DB)
        const reviewData = await fetchReviews(medusaProduct.id, backendUrl);

        const relatedProducts = allProducts.products
            .filter(p => p.handle !== handle)
            .slice(0, 3)
            .map(transformMedusaProduct);

        return {
            product,
            relatedProducts,
            reviews: reviewData.reviews,
            reviewStats: reviewData.stats,
            backendUrl,
            error: null,
            _dataSource: dataSource, // For debugging
        };
    }

    // 4. Final fallback to static products
    const staticProduct = staticProducts[handle];
    if (!staticProduct) {
        throw new Response("Product not found", { status: 404 });
    }

    const relatedProducts = Object.values(staticProducts)
        .filter(p => p.handle !== handle)
        .slice(0, 3);

    return {
        product: { ...staticProduct, variants: [] },
        relatedProducts: relatedProducts.map(p => ({ ...p, variants: [] })),
        reviews: [] as Review[],
        reviewStats: { average: 0, count: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } } as ReviewStats,
        backendUrl,
        error: "Using cached product",
        _dataSource: "static" as const,
    };
}

export default function ProductDetail({ loaderData }: Route.ComponentProps) {
    const { product, relatedProducts, reviews: initialReviews, reviewStats: initialStats, backendUrl } = loaderData;
    const { addToCart } = useCart();
    const { formatPrice, t } = useLocale();

    const [quantity, setQuantity] = useState(1);
    const [selectedColor, setSelectedColor] = useState(product.colors[0] || "");
    const [isEmbroideryOpen, setIsEmbroideryOpen] = useState(false);
    const [isReviewFormOpen, setIsReviewFormOpen] = useState(false);
    const [reviews, setReviews] = useState<Review[]>(initialReviews || []);
    const [reviewStats, setReviewStats] = useState<ReviewStats>(initialStats || { average: 0, count: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } });
    const [reviewSort, setReviewSort] = useState("newest");
    const [isSubmittingReview, setIsSubmittingReview] = useState(false);
    const [embroideryData, setEmbroideryData] = useState<{
        type: 'text' | 'drawing';
        data: string;
        font?: string;
        color: string;
    } | null>(null);

    // Find the selected variant based on color
    const selectedVariant = product.variants?.find(
        (v: { title: string; id: string; sku?: string; inventory_quantity?: number }) => v.title === selectedColor
    ) || product.variants?.[0];

    // Get stock status for the selected variant
    const stockStatus = getStockStatus(selectedVariant?.inventory_quantity);
    const stockDisplay = getStockStatusDisplay(stockStatus);
    const isOutOfStock = stockStatus === "out_of_stock";

    const handleQuantityChange = (delta: number) => {
        setQuantity(prev => Math.max(1, prev + delta));
    };

    const handleEmbroideryConfirm = (data: typeof embroideryData) => {
        setEmbroideryData(data);
        setIsEmbroideryOpen(false);
    };

    const handleSortChange = useCallback(async (sort: string) => {
        setReviewSort(sort);
        try {
            const response = await fetch(`${backendUrl}/store/products/${product.id}/reviews?sort=${sort}&limit=10`);
            if (response.ok) {
                const data = await response.json();
                setReviews(data.reviews);
            }
        } catch (error) {
            console.error("Failed to fetch reviews:", error);
        }
    }, [backendUrl, product.id]);

    const handleSubmitReview = async (reviewData: { rating: number; title: string; content: string; customer_name: string; customer_email?: string }) => {
        setIsSubmittingReview(true);
        try {
            const response = await fetch(`${backendUrl}/store/products/${product.id}/reviews`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(reviewData),
            });
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || "Failed to submit review");
            }
            setIsReviewFormOpen(false);
            // Refresh reviews
            handleSortChange(reviewSort);
        } finally {
            setIsSubmittingReview(false);
        }
    };

    // JSON-LD structured data for SEO
    const jsonLd = {
        "@context": "https://schema.org",
        "@type": "Product",
        name: product.title,
        description: product.description,
        image: product.images,
        sku: product.variants?.[0]?.sku || product.id,
        brand: {
            "@type": "Brand",
            name: "Grace Stowel"
        },
        offers: {
            "@type": "Offer",
            url: `https://gracestowel.com/products/${product.handle}`,
            priceCurrency: "USD",
            price: (product.price / 100).toFixed(2),
            availability: isOutOfStock
                ? "https://schema.org/OutOfStock"
                : "https://schema.org/InStock",
            seller: {
                "@type": "Organization",
                name: "Grace Stowel"
            }
        },
        ...(reviewStats.count > 0 ? {
            aggregateRating: {
                "@type": "AggregateRating",
                ratingValue: reviewStats.average.toFixed(1),
                reviewCount: String(reviewStats.count)
            }
        } : {})
    };

    return (
        <div className="min-h-screen flex flex-col">
            {/* JSON-LD Structured Data */}
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
            />

            <main className="flex-grow container mx-auto px-4 py-12 max-w-7xl">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-12 lg:gap-20">

                    {/* Image Gallery */}
                    <div className="space-y-4">
                        <div
                            className="aspect-square bg-card-earthy/20 rounded-lg overflow-hidden"
                        >
                            <img
                                src={product.images[0]}
                                alt={product.title}
                                className="w-full h-full object-cover"
                                fetchPriority="high"
                                width="600"
                                height="600"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            {product.images.slice(1).map((img, idx) => (
                                <div
                                    key={idx}
                                    className="aspect-square bg-card-earthy/20 rounded-lg overflow-hidden"
                                >
                                    <img
                                        src={img}
                                        alt="Detail"
                                        className="w-full h-full object-cover"
                                        loading="lazy"
                                        width="300"
                                        height="300"
                                    />
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
                                        <Star key={i} className={`w-4 h-4 ${i < Math.round(reviewStats.average) ? "fill-current" : "fill-gray-200 text-gray-200"}`} />
                                    ))}
                                </div>
                                <a href="#reviews" className="text-sm text-text-earthy/60 hover:text-accent-earthy transition-colors">
                                    ({reviewStats.count} review{reviewStats.count !== 1 ? "s" : ""})
                                </a>
                            </div>

                            <div className="flex items-start justify-between gap-4 mb-4">
                                <h1 className="text-4xl md:text-5xl font-serif text-text-earthy">{product.title}</h1>
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
                            <div className="flex items-center gap-4 mb-8">
                                <p className="text-2xl text-accent-earthy font-medium">{formatPrice(product.price)}</p>
                                <span className={`px-3 py-1 rounded-full text-sm font-medium ${stockDisplay.bgColor} ${stockDisplay.color}`}>
                                    {stockDisplay.label}
                                </span>
                            </div>

                            <p className="text-lg text-text-earthy/80 leading-relaxed mb-8">
                                {product.description}
                            </p>

                            {/* Color Selector */}
                            {product.colors.length > 0 && (
                                <div className="mb-8">
                                    <span className="block text-sm font-medium text-text-earthy mb-3">Color: <span className="text-text-earthy/60">{selectedColor}</span></span>
                                    <div className="flex gap-3">
                                        {product.colors.map((color) => {
                                            const colorMap: Record<string, string> = {
                                                "Cloud White": "#F5F5F5",
                                                "Sage": "#9CAF88",
                                                "Terra Cotta": "#E2725B",
                                                "Charcoal": "#36454F",
                                                "Navy": "#202A44",
                                                "Sand": "#E6DCD0",
                                                "Stone": "#9EA3A8"
                                            };
                                            return (
                                                <button
                                                    key={color}
                                                    onClick={() => setSelectedColor(color)}
                                                    className={`w-10 h-10 rounded-full border-2 transition-all cursor-pointer ${selectedColor === color
                                                        ? "border-accent-earthy ring-2 ring-accent-earthy/20 ring-offset-2"
                                                        : "border-transparent hover:scale-110"
                                                        }`}
                                                    style={{ backgroundColor: colorMap[color] || "#ccc" }}
                                                    aria-label={`Select color ${color}`}
                                                    title={color}
                                                />
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Embroidery Customization Button */}
                            {!product.disableEmbroidery && (
                                <div className="mb-6">
                                    <button
                                        onClick={() => setIsEmbroideryOpen(true)}
                                        className={`w-full sm:w-auto px-6 py-3 rounded-lg border-2 transition-all flex items-center justify-center gap-2 cursor-pointer ${embroideryData
                                            ? 'border-accent-earthy bg-accent-earthy/10 text-accent-earthy'
                                            : 'border-gray-300 hover:border-accent-earthy text-text-earthy'
                                            }`}
                                    >
                                        <Sparkles className="w-5 h-5" />
                                        {embroideryData ? 'Edit Custom Embroidery' : 'Add Custom Embroidery'}
                                    </button>

                                    {/* Embroidery Preview */}
                                    {embroideryData && (
                                        <div className="mt-4 p-4 bg-accent-earthy/5 border-2 border-accent-earthy/20 rounded-lg">
                                            <div className="flex items-center justify-between mb-3">
                                                <h4 className="text-sm font-semibold text-text-earthy flex items-center gap-2">
                                                    <Sparkles className="w-4 h-4 text-accent-earthy" />
                                                    Your Custom Embroidery
                                                </h4>
                                                <button
                                                    onClick={() => setIsEmbroideryOpen(true)}
                                                    className="text-xs text-accent-earthy hover:underline cursor-pointer"
                                                >
                                                    Edit
                                                </button>
                                            </div>
                                            {embroideryData.type === 'text' ? (
                                                <div
                                                    className="text-2xl text-center py-4"
                                                    style={{
                                                        fontFamily: embroideryData.font,
                                                        color: embroideryData.color,
                                                        textShadow: `
                                                            1px 1px 0 rgba(0,0,0,0.1),
                                                            2px 2px 0 rgba(0,0,0,0.05),
                                                            -1px -1px 0 rgba(255,255,255,0.3)
                                                        `
                                                    }}
                                                >
                                                    {embroideryData.data}
                                                </div>
                                            ) : (
                                                <div className="flex justify-center">
                                                    <img
                                                        src={embroideryData.data}
                                                        alt="Custom embroidery drawing"
                                                        className="max-w-full h-32 rounded border border-gray-200"
                                                    />
                                                </div>
                                            )}
                                        </div>
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
                                    <span className="px-4 text-text-earthy font-medium min-w-[3rem] text-center">{quantity}</span>
                                    <button
                                        onClick={() => handleQuantityChange(1)}
                                        className="px-4 h-full hover:bg-card-earthy/20 text-text-earthy transition-colors rounded-r-lg cursor-pointer"
                                        aria-label="Increase quantity"
                                    >
                                        +
                                    </button>
                                </div>

                                <button
                                    onClick={() => addToCart({
                                        id: product.id,
                                        variantId: selectedVariant?.id,
                                        sku: selectedVariant?.sku,
                                        title: product.title,
                                        price: product.formattedPrice,
                                        image: product.images[0],
                                        quantity: quantity,
                                        color: selectedColor,
                                        embroidery: embroideryData || undefined
                                    })}
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

                {/* Reviews Section */}
                <div id="reviews">
                    <div className="flex items-center justify-between mt-16 pt-16 border-t border-gray-200 mb-8">
                        <h2 className="text-2xl font-serif text-text-earthy">Customer Reviews</h2>
                        <button
                            onClick={() => setIsReviewFormOpen(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-accent-earthy text-white rounded-lg hover:bg-accent-earthy/90 transition-colors"
                        >
                            <MessageSquarePlus className="w-5 h-5" />
                            Write a Review
                        </button>
                    </div>
                    <ReviewSection
                        reviews={reviews}
                        stats={reviewStats}
                        productId={product.id}
                        onSortChange={handleSortChange}
                        currentSort={reviewSort}
                    />
                </div>

                {/* Complete the Set Section */}
                <section className="mt-24 mb-12">
                    <h2 className="text-3xl font-serif text-text-earthy mb-8 text-center">Complete the Set</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
                        {relatedProducts.map((relatedProduct) => (
                            <div key={relatedProduct.id} className="group">
                                <div className="relative overflow-hidden rounded mb-3 bg-card-earthy/20 aspect-[4/5]">
                                    <Link to={`/products/${relatedProduct.handle}`}>
                                        <img
                                            src={relatedProduct.images[0]}
                                            alt={relatedProduct.title}
                                            className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-500 ease-out"
                                            loading="lazy"
                                            width="400"
                                            height="500"
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

            {/* Embroidery Customizer Modal */}
            <EmbroideryCustomizer
                isOpen={isEmbroideryOpen}
                onClose={() => setIsEmbroideryOpen(false)}
                onConfirm={handleEmbroideryConfirm}
            />

            {/* Review Form Modal */}
            {isReviewFormOpen && (
                <ReviewForm
                    productId={product.id}
                    productTitle={product.title}
                    onSubmit={handleSubmitReview}
                    onClose={() => setIsReviewFormOpen(false)}
                    isSubmitting={isSubmittingReview}
                />
            )}
        </div>
    );
}
