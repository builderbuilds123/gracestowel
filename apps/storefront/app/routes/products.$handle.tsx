import type { Route } from "./+types/products.$handle";
import { useState, useCallback } from "react";
import { MessageSquarePlus } from "lucide-react";
import { ReviewSection, type Review, type ReviewStats } from "../components/ReviewSection";
import { ReviewForm } from "../components/ReviewForm";
import { ProductImageGallery } from "../components/ProductImageGallery";
import { ProductInfo } from "../components/ProductInfo";
import { ProductActions } from "../components/ProductActions";
import { ProductDetails } from "../components/ProductDetails";
import { RelatedProducts } from "../components/RelatedProducts";
import { getMedusaClient, getBackendUrl } from "../lib/medusa";
import { getStockStatus, validateMedusaProduct, type MedusaProduct } from "../lib/medusa";
import { transformToDetail, type ProductDetail } from "../lib/product-transformer";

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

// Transform Medusa product using centralized transformer
// (transformToDetail is imported from ../lib/product-transformer)

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

    const medusa = getMedusaClient(context);
    // Use centralized backend URL resolution for consistency
    const backendUrl = getBackendUrl(context);

    let medusaProduct: MedusaProduct | null = null;
    let allProducts: { products: MedusaProduct[] } = { products: [] };
    let dataSource: "hyperdrive" | "medusa" = "medusa"; // Defaulting to medusa api

    try {
        const startTime = Date.now();
        // Use the Medusa SDK v2 methods
        const { products } = await medusa.store.product.list({ handle, limit: 1, fields: "+variants,+variants.prices,+variants.inventory_quantity,+options,+options.values,+images,+categories,+metadata" });
        medusaProduct = validateMedusaProduct(products[0]);

        if (medusaProduct) {
            // Fetch related products
            const response = await medusa.store.product.list({ limit: 10, fields: "+variants.prices,+images" });
            allProducts = { products: (response.products as unknown as MedusaProduct[]) };
            console.log(`✅ Medusa API: Fetched product in ${Date.now() - startTime}ms`);
        }
    } catch (error: any) {
        console.error("Failed to fetch product from Medusa:", error);
    }

    if (!medusaProduct) {
        throw new Response("Product not found", { status: 404 });
    }

    const product = transformToDetail(medusaProduct);

    // Fetch reviews from Medusa backend
    const reviewData = (await fetchReviews(medusaProduct.id, backendUrl)) as { reviews: Review[]; stats: ReviewStats };

    const relatedProducts = allProducts.products
        .filter(p => p.handle !== handle)
        .slice(0, 3)
        .map(p => transformToDetail(p));

    return {
        product,
        relatedProducts,
        reviews: reviewData.reviews,
        reviewStats: reviewData.stats,
        backendUrl,
        error: null,
        _dataSource: dataSource,
    };
}

export default function ProductDetail({ loaderData }: Route.ComponentProps) {
    const { product, relatedProducts, reviews: initialReviews, reviewStats: initialStats, backendUrl } = loaderData;

    // Review state
    const [isReviewFormOpen, setIsReviewFormOpen] = useState(false);
    const [reviews, setReviews] = useState<Review[]>(initialReviews || []);
    const [reviewStats, setReviewStats] = useState<ReviewStats>(initialStats || { average: 0, count: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } });
    const [reviewSort, setReviewSort] = useState("newest");
    const [isSubmittingReview, setIsSubmittingReview] = useState(false);

    // Get stock status for the first variant
    const selectedVariant = product.variants?.[0];
    const stockStatus = getStockStatus(selectedVariant?.inventory_quantity);
    const isOutOfStock = stockStatus === "out_of_stock";

    // Track product view in PostHog
    useState(() => {
        if (typeof window !== 'undefined') {
            import('../utils/posthog').then(({ default: posthog }) => {
                posthog.capture('product_viewed', {
                    product_id: product.id,
                    product_name: product.title,
                    product_price: product.price,
                    product_handle: product.handle,
                    stock_status: stockStatus,
                });
            });
        }
    });

    const handleSortChange = useCallback(async (sort: string) => {
        setReviewSort(sort);
        try {
            const response = await fetch(`${backendUrl}/store/products/${product.id}/reviews?sort=${sort}&limit=10`);
            if (response.ok) {
                const data = (await response.json()) as { reviews: Review[] };
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
                const error = (await response.json()) as { message?: string };
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
                    <ProductImageGallery
                        images={product.images}
                        title={product.title}
                    />

                    {/* Product Info */}
                    <div className="flex flex-col justify-center">
                        <div>
                            <ProductInfo
                                product={product}
                                reviewStats={reviewStats}
                                stockStatus={stockStatus}
                            />

                            <ProductActions
                                product={product}
                                selectedVariant={selectedVariant}
                                isOutOfStock={isOutOfStock}
                            />

                            <ProductDetails
                                features={product.features}
                                dimensions={product.dimensions}
                                careInstructions={product.careInstructions}
                            />
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

                {/* Related Products */}
                <RelatedProducts products={relatedProducts} />
            </main>

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
