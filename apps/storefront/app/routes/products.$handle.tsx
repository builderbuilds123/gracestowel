import type { Route } from "./+types/products.$handle";
import { useState, useEffect, useCallback, Suspense } from "react";
import { Await } from "react-router";
import { Sparkles } from "lucide-react";
import { Towel } from "@phosphor-icons/react";

// Legacy components (still used for some functionality)
import { type Review, type ReviewStats } from "../components/ReviewSection";
import { ReviewForm } from "../components/ReviewForm";
import { RelatedProducts } from "../components/RelatedProducts";
import { EmbroideryCustomizer } from "../components/EmbroideryCustomizer";

// New immersive experience components
import {
  HeroCanvas,
  ProductReveal,
  TextureDiscovery,
  ColorMorpher,
  JourneyCarousel,
  ReviewRiver,
  StickyPurchaseBar,
} from "../components/product-experience";

// Safe image component for XSS prevention
import { SafeImage } from "../components/SafeImage";

import { useCart } from "../context/CartContext";
import { getMedusaClient, castToMedusaProduct, type MedusaProduct, getBackendUrl, getStockStatus, validateMedusaProduct, getDefaultRegion } from "../lib/medusa";
import { transformToDetail, type ProductDetail } from "../lib/product-transformer";
import { monitoredFetch } from "../utils/monitored-fetch";
import { sanitizeDisplayText } from "../utils/sanitize-text";
import type { EmbroideryData } from "../types/product";

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
        { property: "product:price:currency", content: "CAD" },
    ];
}

// Fetch reviews from the backend
async function fetchReviews(productId: string, backendUrl: string, sort = "newest") {
    try {
        const response = await monitoredFetch(`${backendUrl}/store/products/${productId}/reviews?sort=${sort}&limit=10`, {
            method: "GET",
            label: "product-reviews",
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
    
    // Debug Logging for CI
    const medusaPk = context?.cloudflare?.env?.MEDUSA_PUBLISHABLE_KEY;
    console.log(`[DEBUG] Loader products.$handle: handle=${handle}`);
    console.log(`[DEBUG] MEDUSA_BACKEND_URL: ${context?.cloudflare?.env?.MEDUSA_BACKEND_URL}`);
    console.log(`[DEBUG] MEDUSA_PUBLISHABLE_KEY: ${medusaPk ? medusaPk.substring(0, 10) + '...' : 'UNDEFINED'}`);

    if (!handle) {
        throw new Response("Product not found", { status: 404 });
    }

    const medusa = getMedusaClient(context);
    const backendUrl = getBackendUrl(context);

    let medusaProduct: MedusaProduct | null = null;
    let dataSource: "hyperdrive" | "medusa" = "medusa";

    // Get default region for price calculation (CAD/Canada preferred)
    const regionInfo = await getDefaultRegion(medusa);
    const regionId = regionInfo?.region_id;
    const currencyCode = regionInfo?.currency_code || "cad";

    try {
        // Fetch product with region_id to get calculated prices
        const { products } = await medusa.store.product.list({ 
            handle, 
            limit: 1, 
            region_id: regionId,
            fields: "+variants,+variants.calculated_price,+variants.prices,*variants.inventory_quantity,+options,+options.values,+images,+categories,+metadata" 
        });
        medusaProduct = validateMedusaProduct(products[0]);
    } catch (error: any) {
        console.error("Failed to fetch product from Medusa:", error);
    }

    if (!medusaProduct) {
        throw new Response("Product not found", { status: 404 });
    }

    const product = transformToDetail(medusaProduct);

    // Fetch related products (Deferred)
    // We start the promise but don't await it
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

    // Fetch reviews (Blocking, to allow simpler state management in component)
    const reviewsData = (await fetchReviews(medusaProduct.id, backendUrl)) as { reviews: Review[]; stats: ReviewStats };

    return {
        product,
        relatedProducts: relatedProductsPromise,
        reviews: reviewsData.reviews,
        reviewStats: reviewsData.stats,
        backendUrl,
        _dataSource: dataSource,
    };
}

// Color mapping for swatches and ColorMorpher
const COLOR_MAP: Record<string, { hex: string; mood: string }> = {
    "Cloud White": { hex: "#F5F5F5", mood: "Pure and refreshing, like a crisp morning" },
    "Sage": { hex: "#9CAF88", mood: "Calm and grounding, inspired by morning gardens" },
    "Terra Cotta": { hex: "#E2725B", mood: "Warm and inviting, earthy elegance" },
    "Charcoal": { hex: "#36454F", mood: "Bold and sophisticated, modern luxury" },
    "Navy": { hex: "#202A44", mood: "Deep and serene, timeless classic" },
    "Sand": { hex: "#E6DCD0", mood: "Soft and natural, beach-house vibes" },
    "Stone": { hex: "#9EA3A8", mood: "Cool and contemporary, understated beauty" },
};

export default function ProductDetail({ loaderData }: Route.ComponentProps) {
    const { product, relatedProducts, reviews: initialReviews, reviewStats: initialStats, backendUrl } = loaderData;
    const { addToCart, items: cartItems, toggleCart } = useCart();

    // State
    const [isReviewFormOpen, setIsReviewFormOpen] = useState(false);
    const [reviews, setReviews] = useState<Review[]>(initialReviews || []);
    const [reviewStats, setReviewStats] = useState<ReviewStats>(initialStats || { average: 0, count: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } });
    const [reviewSort, setReviewSort] = useState("newest");
    const [isSubmittingReview, setIsSubmittingReview] = useState(false);
    const [selectedColor, setSelectedColor] = useState(product.colors?.[0] || "");
    const [quantity, setQuantity] = useState(1);
    const [isEmbroideryOpen, setIsEmbroideryOpen] = useState(false);
    const [embroideryData, setEmbroideryData] = useState<EmbroideryData | null>(null);

    // Find the actual variant for the selected color
    const selectedVariant = product.variants?.find(v =>
        v.options?.some(o => o.value === selectedColor)
    ) || product.variants?.[0];

    const stockStatus = getStockStatus(selectedVariant?.inventory_quantity);
    const isOutOfStock = stockStatus === "out_of_stock";

    // Calculate cart total for shipping progress (in dollars)
    const cartTotal = cartItems.reduce((sum, item) => {
        const priceNum = parseFloat(item.price.replace(/[^0-9.]/g, ''));
        return sum + (priceNum * item.quantity);
    }, 0);

    // Calculate total item count in cart
    const cartItemCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);

    // Track product view in PostHog
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

    // Review handlers
    const handleSortChange = useCallback(async (sort: string) => {
        setReviewSort(sort);
        try {
            const response = await monitoredFetch(`${backendUrl}/store/products/${product.id}/reviews?sort=${sort}&limit=10`, {
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
    }, [backendUrl, product.id]);

    const handleSubmitReview = async (reviewData: { rating: number; title: string; content: string; customer_name: string; customer_email?: string }) => {
        setIsSubmittingReview(true);
        try {
            const response = await monitoredFetch(`${backendUrl}/store/products/${product.id}/reviews`, {
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

    // Add to cart handler
    const handleAddToCart = useCallback(() => {
        const variantId = selectedVariant?.id;

        addToCart({
            id: product.id,
            variantId: variantId || "",
            sku: selectedVariant?.sku || undefined,
            title: product.title,
            price: product.formattedPrice,
            image: product.images[0],
            quantity,
            color: selectedColor,
            embroidery: embroideryData || undefined
        });

        // Track in PostHog
        if (typeof window !== 'undefined') {
            import('../utils/posthog').then(({ default: posthog }) => {
                posthog.capture('product_added_to_cart', {
                    product_id: product.id,
                    product_name: product.title,
                    product_price: product.formattedPrice,
                    quantity,
                    color: selectedColor,
                    has_embroidery: !!embroideryData,
                    variant_id: variantId,
                });
            });
        }
    }, [addToCart, product, selectedVariant, quantity, selectedColor, embroideryData]);

    // Embroidery handler
    const handleEmbroideryConfirm = (data: EmbroideryData | null) => {
        if (data) {
            setEmbroideryData(data);
        }
        setIsEmbroideryOpen(false);
    };

    // Transform colors for ColorMorpher
    const colorOptions = product.colors?.map(name => ({
        name,
        hex: COLOR_MAP[name]?.hex || "#ccc",
        mood: COLOR_MAP[name]?.mood || "A beautiful choice",
    })) || [];

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
            priceCurrency: "CAD",
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
        <div className="min-h-screen">
            {/* JSON-LD Structured Data */}
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
            />

            {/* ============================================
                SECTION 1: HERO CANVAS - "First Touch"
                Full-viewport texture immersion
               ============================================ */}
            <HeroCanvas
                image={product.images[0] || "/placeholder-towel.jpg"}
                title={product.title}
                subtitle="Feel the Difference"
            />

            {/* ============================================
                SECTION 2: PRODUCT REVEAL - "The Unfold"
                Theatrical product introduction
               ============================================ */}
            <ProductReveal
                images={product.images}
                title={product.title}
                price={product.price}
                currencySymbol="$"
            />

            {/* ============================================
                SECTION 3: TEXTURE DISCOVERY - "Touch Without Touching"
                Interactive zoom lens and hotspots
               ============================================ */}
            {product.images[1] && (
                <TextureDiscovery
                    image={product.images[1] || product.images[0]}
                />
            )}

            {/* ============================================
                SECTION 4: COLOR MORPHER - "Your Color, Your Vibe"
                Emotional color selection
               ============================================ */}
            {colorOptions.length > 0 && (
                <ColorMorpher
                    colors={colorOptions}
                    selectedColor={selectedColor}
                    onColorChange={setSelectedColor}
                    productImage={product.images[0]}
                />
            )}

            {/* ============================================
                SECTION 5: EMBROIDERY CUSTOMIZATION
                Make it personal
               ============================================ */}
            {!product.disableEmbroidery && (
                <section className="py-16 px-6 bg-gradient-to-b from-bg-earthy to-card-earthy/10">
                    <div className="max-w-4xl mx-auto text-center">
                        <h2 className="text-3xl md:text-4xl font-serif text-text-earthy mb-4">
                            Make It Yours
                        </h2>
                        <p className="text-text-earthy/60 mb-8 max-w-md mx-auto">
                            Add a personal touch with custom embroidery. Your initials, a name, or a special message.
                        </p>

                        <button
                            onClick={() => setIsEmbroideryOpen(true)}
                            className={`inline-flex items-center gap-3 px-8 py-4 rounded-full text-lg transition-all duration-300 ${
                                embroideryData
                                    ? 'bg-accent-earthy text-white shadow-soft hover:shadow-soft-lg'
                                    : 'border-2 border-accent-earthy text-accent-earthy hover:bg-accent-earthy hover:text-white'
                            }`}
                        >
                            <Sparkles className="w-6 h-6" />
                            {embroideryData ? 'Edit Embroidery' : 'Add Embroidery'}
                        </button>

                        {/* Embroidery Preview */}
                        {embroideryData && (
                            <div className="mt-8 p-6 bg-white rounded-3xl shadow-soft max-w-sm mx-auto">
                                <h4 className="text-sm font-medium text-text-earthy/60 mb-3 flex items-center justify-center gap-2">
                                    <Sparkles className="w-4 h-4 text-accent-earthy" />
                                    Your Custom Embroidery
                                </h4>
                                {embroideryData.type === 'text' ? (
                                    <div
                                        className="text-3xl py-4"
                                        style={{
                                            fontFamily: embroideryData.font,
                                            color: embroideryData.color,
                                        }}
                                    >
                                        {/* Sanitize user text input for defense-in-depth XSS protection */}
                                        {sanitizeDisplayText(embroideryData.data)}
                                    </div>
                                ) : (
                                    <SafeImage
                                        src={embroideryData.data}
                                        alt="Custom embroidery drawing"
                                        className="max-w-full h-24 mx-auto rounded"
                                        fallback={
                                            <span className="text-gray-500 text-sm">
                                                Drawing preview unavailable
                                            </span>
                                        }
                                    />
                                )}
                            </div>
                        )}
                    </div>
                </section>
            )}

            {/* ============================================
                SECTION 6: JOURNEY CAROUSEL - "From Field to Fold"
                Craftsmanship storytelling
               ============================================ */}
            <JourneyCarousel />

            {/* ============================================
                SECTION 7: PRODUCT DETAILS
                Features, dimensions, care
               ============================================ */}
            <section className="py-16 px-6">
                <div className="max-w-5xl mx-auto">
                    <h2 className="text-3xl md:text-4xl font-serif text-text-earthy text-center mb-12">
                        The Details
                    </h2>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        {/* Features */}
                        {product.features && product.features.length > 0 && (
                            <div className="p-6 bg-card-earthy/10 rounded-3xl">
                                <h3 className="font-serif text-xl text-text-earthy mb-4 flex items-center gap-2">
                                    <span className="text-2xl">✨</span>
                                    Features
                                </h3>
                                <ul className="space-y-2">
                                    {product.features.map((feature, i) => (
                                        <li key={i} className="text-text-earthy/70 flex items-start gap-2">
                                            <span className="text-accent-earthy mt-1">•</span>
                                            {feature}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {/* Dimensions */}
                        {product.dimensions && Object.keys(product.dimensions).length > 0 && (
                            <div className="p-6 bg-card-earthy/10 rounded-3xl">
                                <h3 className="font-serif text-xl text-text-earthy mb-4 flex items-center gap-2">
                                    <span className="text-2xl">📐</span>
                                    Dimensions
                                </h3>
                                <dl className="space-y-2">
                                    {Object.entries(product.dimensions).map(([key, value]) => (
                                        <div key={key} className="flex justify-between text-text-earthy/70">
                                            <dt className="capitalize">{key}:</dt>
                                            <dd className="font-medium">{value}</dd>
                                        </div>
                                    ))}
                                </dl>
                            </div>
                        )}

                        {/* Care Instructions */}
                        {product.careInstructions && product.careInstructions.length > 0 && (
                            <div className="p-6 bg-card-earthy/10 rounded-3xl">
                                <h3 className="font-serif text-xl text-text-earthy mb-4 flex items-center gap-2">
                                    <span className="text-2xl">🧺</span>
                                    Care
                                </h3>
                                <ul className="space-y-2">
                                    {product.careInstructions.map((instruction, i) => (
                                        <li key={i} className="text-text-earthy/70 flex items-start gap-2">
                                            <span className="text-accent-earthy mt-1">•</span>
                                            {instruction}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                </div>
            </section>

            {/* ============================================
                SECTION 8: REVIEW RIVER - "Happy Homes"
                Animated testimonials
               ============================================ */}
            <div id="reviews">
                <ReviewRiver
                    reviews={reviews}
                    stats={reviewStats}
                    onWriteReview={() => setIsReviewFormOpen(true)}
                />
            </div>

            {/* ============================================
                SECTION 9: RELATED PRODUCTS - "Complete the Set"
                Curated companions
               ============================================ */}
            <Suspense fallback={
                <section className="py-16 px-6">
                    <div className="max-w-6xl mx-auto">
                        <h2 className="text-3xl font-serif text-text-earthy text-center mb-12">
                            Complete Your Sanctuary
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                            {[1, 2, 3].map(i => (
                                <div key={i} className="aspect-[3/4] bg-card-earthy/20 rounded-3xl animate-pulse" />
                            ))}
                        </div>
                    </div>
                </section>
            }>
                <Await resolve={relatedProducts} errorElement={null}>
                    {(resolvedRelated) => (
                        <section className="py-16 px-6">
                            <div className="max-w-6xl mx-auto">
                                <h2 className="text-3xl md:text-4xl font-serif text-text-earthy text-center mb-4">
                                    Complete Your Sanctuary
                                </h2>
                                <p className="text-text-earthy/60 text-center mb-12">
                                    Curated pieces to elevate your bathroom experience
                                </p>
                                <RelatedProducts products={resolvedRelated} />
                            </div>
                        </section>
                    )}
                </Await>
            </Suspense>

            {/* ============================================
                STICKY PURCHASE BAR
                Always accessible, appears after scroll
               ============================================ */}
            <StickyPurchaseBar
                productTitle={product.title}
                price={product.price}
                currencySymbol="$"
                selectedColor={selectedColor}
                colorHex={COLOR_MAP[selectedColor]?.hex}
                quantity={quantity}
                onQuantityChange={setQuantity}
                onAddToCart={handleAddToCart}
                isOutOfStock={isOutOfStock}
                showAfterScroll={600}
                freeShippingThreshold={75}
                cartTotal={cartTotal}
                onViewCart={toggleCart}
                cartItemCount={cartItemCount}
            />

            {/* ============================================
                MODALS
               ============================================ */}

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

            {/* Embroidery Customizer Modal */}
            <EmbroideryCustomizer
                isOpen={isEmbroideryOpen}
                onClose={() => setIsEmbroideryOpen(false)}
                onConfirm={handleEmbroideryConfirm}
            />
        </div>
    );
}
