import type { Route } from "./+types/products.$handle";
import { useState, useEffect, useCallback, Suspense, useMemo } from "react";
import { Await } from "react-router";

import { type Review, type ReviewStats } from "../components/ReviewSection";
import { ReviewForm } from "../components/ReviewForm";
import { RelatedProducts } from "../components/RelatedProducts";
import { ProductGallery, ProductInfo } from "../components/product";
import { ReviewRiver, StickyPurchaseBar } from "../components/product-experience";

import { useCart } from "../context/CartContext";
import { getMedusaClient, castToMedusaProduct, type MedusaProduct, getBackendUrl, getStockStatus, validateMedusaProduct, getDefaultRegion } from "../lib/medusa";
import { medusaFetch } from "../lib/medusa-fetch";
import { transformToDetail, type ProductDetail } from "../lib/product-transformer";

import { PRODUCT_COLOR_MAP } from "../lib/colors";


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
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "product" },
        { property: "og:image", content: product.images?.[0] || "" },
        { property: "og:url", content: `https://gracestowel.com/products/${product.handle}` },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
        { name: "twitter:image", content: product.images?.[0] || "" },
        { property: "product:price:amount", content: String(product.price) },
        { property: "product:price:currency", content: "CAD" },
    ];
}

async function fetchReviews(productId: string, context: any, sort = "newest") {
    try {
        const response = await medusaFetch(`/store/products/${productId}/reviews?sort=${sort}&limit=10`, {
            method: "GET",
            label: "product-reviews",
            context,
        });
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
    const backendUrl = getBackendUrl(context);

    let medusaProduct: MedusaProduct | null = null;

    const regionInfo = await getDefaultRegion(medusa);
    const regionId = regionInfo?.region_id;
    const currencyCode = regionInfo?.currency_code || "cad";

    try {
        const { products } = await medusa.store.product.list({
            handle,
            limit: 1,
            region_id: regionId,
            fields: "+variants,+variants.calculated_price,+variants.prices,*variants.inventory_quantity,+variants.images,+options,+options.values,+images,+categories,+metadata"
        });
        medusaProduct = validateMedusaProduct(products[0]);
    } catch (error: unknown) {
        console.error("Failed to fetch product from Medusa:", error);
    }

    if (!medusaProduct) {
        throw new Response("Product not found", { status: 404 });
    }

    const product = transformToDetail(medusaProduct);

    const relatedProductsPromise = (async () => {
        try {
            const res = await medusa.store.product.list({
                limit: 4,
                region_id: regionId,
                fields: "+variants.calculated_price,+variants.prices,*variants.inventory_quantity,+images"
            });
            return (res.products as unknown[]).map(castToMedusaProduct)
                .filter(p => p.id !== medusaProduct!.id)
                .slice(0, 3)
                .map(p => transformToDetail(p, currencyCode));
        } catch (e) {
            console.error("Failed to fetch related products", e);
            return [] as ProductDetail[];
        }
    })();

    const reviewsData = (await fetchReviews(medusaProduct.id, context)) as { reviews: Review[]; stats: ReviewStats };

    return {
        product,
        relatedProducts: relatedProductsPromise,
        reviews: reviewsData.reviews,
        reviewStats: reviewsData.stats,
    };
}

export default function ProductDetailPage({ loaderData }: Route.ComponentProps) {
    const { product, relatedProducts, reviews: initialReviews, reviewStats: initialStats } = loaderData;
    const { addToCart, items: cartItems, toggleCart } = useCart();

    const [isReviewFormOpen, setIsReviewFormOpen] = useState(false);
    const [reviews, setReviews] = useState<Review[]>(initialReviews || []);
    const [reviewStats, setReviewStats] = useState<ReviewStats>(initialStats || { average: 0, count: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } });
    const [reviewSort, setReviewSort] = useState("newest");
    const [isSubmittingReview, setIsSubmittingReview] = useState(false);
    const [selectedColor, setSelectedColor] = useState(product.colors?.[0] || "");
    const [quantity, setQuantity] = useState(1);

    const selectedVariant = product.variants?.find(v =>
        v.options?.some(o => o.value === selectedColor)
    ) || product.variants?.[0];

    const stockStatus = getStockStatus(selectedVariant?.inventory_quantity);
    const isOutOfStock = stockStatus === "out_of_stock";

    const cartTotal = cartItems.reduce((sum, item) => {
        const priceNum = parseFloat(item.price.replace(/[^0-9.]/g, ''));
        return sum + (priceNum * item.quantity);
    }, 0);

    const cartItemCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);

    useEffect(() => {
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
    }, [product.id, product.handle, product.title, product.price, stockStatus]);

    const handleSortChange = useCallback(async (sort: string) => {
        setReviewSort(sort);
        try {
            // Client-side: medusaFetch will use window.ENV for publishable key
            const response = await medusaFetch(`/store/products/${product.id}/reviews?sort=${sort}&limit=10`, {
                method: "GET",
                label: "product-reviews",
            });
            if (response.ok) {
                const data = (await response.json()) as { reviews: Review[] };
                setReviews(data.reviews);
            }
        } catch (error) {
            console.error("Failed to fetch reviews:", error);
        }
    }, [product.id]);

    const handleSubmitReview = async (reviewData: { rating: number; title: string; content: string; customer_name: string; customer_email?: string }) => {
        setIsSubmittingReview(true);
        try {
            // Client-side: medusaFetch will use window.ENV for publishable key
            const response = await medusaFetch(`/store/products/${product.id}/reviews`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(reviewData),
                label: "product-review-submit",
            });
            if (!response.ok) {
                const error = (await response.json()) as { message?: string };
                throw new Error(error.message || "Failed to submit review");
            }
            setIsReviewFormOpen(false);
            handleSortChange(reviewSort);
        } finally {
            setIsSubmittingReview(false);
        }
    };

    // Filter images based on selected color - Using Medusa's native variant images
    const filteredImages = useMemo(() => {
        // If we have a selected variant and it has native images, use them
        if (selectedVariant?.images && selectedVariant.images.length > 0) {
            return selectedVariant.images;
        }

        // Fallback: If no variant-specific images, use the general product images
        return product.images || [];
    }, [product.images, selectedVariant]);

    const handleAddToCart = useCallback(() => {
        const variantId = selectedVariant?.id;

        addToCart({
            id: product.id,
            variantId: variantId || "",
            sku: selectedVariant?.sku || undefined,
            title: product.title,
            price: product.formattedPrice,
            image: filteredImages[0] || product.images[0],
            quantity,
            color: selectedColor,
        });

        if (typeof window !== 'undefined') {
            import('../utils/posthog').then(({ default: posthog }) => {
                posthog.capture('product_added_to_cart', {
                    product_id: product.id,
                    product_name: product.title,
                    product_price: product.formattedPrice,
                    quantity,
                    color: selectedColor,
                    variant_id: variantId,
                });
            });
        }
    }, [addToCart, product, selectedVariant, quantity, selectedColor, filteredImages]);

    const colorOptions = product.colors?.map(name => ({
        name,
        hex: PRODUCT_COLOR_MAP[name] || "#ccc",
    })) || [];

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
            priceCurrency: "CAD",
            price: product.price.toFixed(2),
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
        <div className="min-h-screen bg-bg-earthy">
            {/* JSON-LD */}
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
            />

            {/* Main Product Section */}
            <section className="py-8 md:py-12 px-6">
                <div className="max-w-6xl mx-auto">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
                        {/* Left: Image Gallery */}
                        <ProductGallery
                            key={`${product.id}-${selectedColor}`}
                            images={filteredImages}
                            title={product.title}
                        />

                        {/* Right: Product Info */}
                        <ProductInfo
                            product={product}
                            colors={colorOptions}
                            selectedColor={selectedColor}
                            onColorChange={setSelectedColor}
                            quantity={quantity}
                            onQuantityChange={setQuantity}
                            onAddToCart={handleAddToCart}
                            isOutOfStock={isOutOfStock}
                        />
                    </div>
                </div>
            </section>

            {/* Product Details */}


            {/* Reviews */}
            <div id="reviews">
                <ReviewRiver
                    reviews={reviews}
                    stats={reviewStats}
                    onWriteReview={() => setIsReviewFormOpen(true)}
                />
            </div>

            {/* Related Products */}
            <Suspense fallback={
                <section className="py-12 px-6">
                    <div className="max-w-6xl mx-auto">
                        <h2 className="text-2xl font-serif text-text-earthy text-center mb-8">
                            You May Also Like
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {[1, 2, 3].map(i => (
                                <div key={i} className="aspect-[3/4] bg-card-earthy/20 rounded-2xl animate-pulse" />
                            ))}
                        </div>
                    </div>
                </section>
            }>
                <Await resolve={relatedProducts} errorElement={null}>
                    {(resolvedRelated) => resolvedRelated.length > 0 && (
                        <section className="py-12 px-6 border-t border-card-earthy/20">
                            <div className="max-w-6xl mx-auto">
                                <h2 className="text-2xl md:text-3xl font-serif text-text-earthy text-center mb-8">
                                    You May Also Like
                                </h2>
                                <RelatedProducts products={resolvedRelated} />
                            </div>
                        </section>
                    )}
                </Await>
            </Suspense>

            {/* Sticky Purchase Bar */}
            <StickyPurchaseBar
                productTitle={product.title}
                price={product.price}
                currencySymbol="$"
                selectedColor={selectedColor}
                colorHex={PRODUCT_COLOR_MAP[selectedColor]}
                quantity={quantity}
                onQuantityChange={setQuantity}
                onAddToCart={handleAddToCart}
                isOutOfStock={isOutOfStock}
                showAfterScroll={400}
                freeShippingThreshold={75}
                cartTotal={cartTotal}
                onViewCart={toggleCart}
                cartItemCount={cartItemCount}
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
