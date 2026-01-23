import type { Route } from "./+types/towels";
import { useState, useMemo } from "react";
import { ProductCard } from "../components/ProductCard";
import { ProductFilters } from "../components/ProductFilters";
import { getMedusaClient, castToMedusaProduct, type MedusaProduct, getDefaultRegion } from "../lib/medusa";
import { productList } from "../data/products";
import { SlidersHorizontal, X } from "../lib/icons";
import { transformToListItems, type ProductListItem } from "../lib/product-transformer";
import { createLogger } from "../lib/logger";

// SEO Meta tags
export function meta() {
    return [
        { title: "Premium Towels Collection | Grace Stowel" },
        { name: "description", content: "Shop our collection of premium organic cotton towels. Luxuriously soft, sustainably made, and designed to last." },
        // Open Graph
        { property: "og:title", content: "Premium Towels Collection | Grace Stowel" },
        { property: "og:description", content: "Shop our collection of premium organic cotton towels. Luxuriously soft, sustainably made, and designed to last." },
        { property: "og:type", content: "website" },
        { property: "og:url", content: "https://gracestowel.com/towels" },
        // Twitter Card
        { name: "twitter:card", content: "summary" },
        { name: "twitter:title", content: "Premium Towels Collection | Grace Stowel" },
        { name: "twitter:description", content: "Shop our collection of premium organic cotton towels. Luxuriously soft, sustainably made, and designed to last." },
    ];
}

// Loader to fetch products from Medusa
export async function loader({ context }: Route.LoaderArgs) {
    try {
        const medusa = getMedusaClient(context);
        
        // OPTIMIZATION (Issue #18): Fetch region and products in parallel using Promise.all()
        // Products can be fetched without region_id (Medusa uses default), then we use region for currency
        const [regionInfo, productResponse] = await Promise.all([
            getDefaultRegion(medusa),
            medusa.store.product.list({
                limit: 50,
                // Don't wait for region_id - Medusa will use default region
                // We'll use region info for currency display after both resolve
                fields: "+variants,+variants.calculated_price,+variants.prices,*variants.inventory_quantity,+options,+options.values,+images,+categories,+metadata"
            })
        ]);
        
        const regionId = regionInfo?.region_id;
        const currencyCode = regionInfo?.currency_code || "cad";
        const { products } = productResponse;

        // Transform Medusa products using centralized transformer
        // Use safe casting to ensure type safety matching our MedusaProduct interface
        const safeProducts = products.map(castToMedusaProduct);
        const transformedProducts = transformToListItems(safeProducts, currencyCode);

        // Extract all unique colors (Issue #20: Use .toSorted() for immutability)
        const allColors = [...new Set(transformedProducts.flatMap(p => p.colors))].toSorted();

        // Get price range (Issue #21: Use loop instead of Math.min/max with spread)
        let minPrice = 0;
        let maxPrice = 200;
        let hasValidPrice = false;
        
        for (const product of transformedProducts) {
            const price = product.priceAmount;
            if (price > 0) {
                if (!hasValidPrice) {
                    minPrice = price;
                    maxPrice = price;
                    hasValidPrice = true;
                } else {
                    if (price < minPrice) minPrice = price;
                    if (price > maxPrice) maxPrice = price;
                }
            }
        }
        
        const priceRange = {
            min: Math.floor(minPrice),
            max: Math.ceil(maxPrice),
        };

        return { products: transformedProducts, allColors, priceRange, error: null };
    } catch (error) {
        const logger = createLogger({ context: "towels-loader" });
        logger.error("Failed to fetch products from Medusa", error instanceof Error ? error : new Error(String(error)));
        throw new Response("Failed to load products from backend", { status: 500 });
    }
}

export default function Collection({ loaderData }: Route.ComponentProps) {
    const { products, allColors, priceRange } = loaderData;
    const [selectedColors, setSelectedColors] = useState<string[]>([]);
    const [selectedPriceRange, setSelectedPriceRange] = useState(priceRange);
    const [showMobileFilters, setShowMobileFilters] = useState(false);

    // Filter products based on selected filters
    const filteredProducts = useMemo(() => {
        return products.filter((product) => {
            // Color filter
            if (selectedColors.length > 0) {
                const hasMatchingColor = product.colors.some(c =>
                    selectedColors.some(sc => c.toLowerCase().includes(sc.toLowerCase()))
                );
                if (!hasMatchingColor) return false;
            }

            // Price filter
            if (product.priceAmount < selectedPriceRange.min || product.priceAmount > selectedPriceRange.max) {
                return false;
            }

            return true;
        });
    }, [products, selectedColors, selectedPriceRange]);

    // Create color options with counts (Issue #23: Optimize with Map for O(1) lookups)
    const colorOptions = useMemo(() => {
        // Build color count map: O(n×k) where k is colors per product
        const colorCountMap = new Map<string, number>();
        
        for (const product of products) {
            for (const productColor of product.colors) {
                const normalizedColor = productColor.toLowerCase();
                // Check if this color matches any in allColors
                for (const allColor of allColors) {
                    if (normalizedColor.includes(allColor.toLowerCase())) {
                        colorCountMap.set(
                            allColor,
                            (colorCountMap.get(allColor) || 0) + 1
                        );
                        break; // Only count once per product
                    }
                }
            }
        }
        
        // Map colors with pre-calculated counts: O(m)
        return allColors.map(color => ({
            value: color,
            label: color,
            count: colorCountMap.get(color) || 0,
        }));
    }, [allColors, products]);

    const clearFilters = () => {
        setSelectedColors([]);
        setSelectedPriceRange(priceRange);
    };

    const hasActiveFilters = selectedColors.length > 0 ||
        selectedPriceRange.min > priceRange.min ||
        selectedPriceRange.max < priceRange.max;

    return (
        <div className="min-h-screen bg-background-earthy pt-24 pb-16">
            <div className="container mx-auto px-4 md:px-8">
                {/* Header */}
                <div className="text-center mb-12">
                    <h1 className="text-4xl md:text-5xl font-serif text-text-earthy mb-4">
                        Towels
                    </h1>
                    <p className="text-lg text-text-earthy/80 max-w-2xl mx-auto font-sans">
                        Discover our curated selection of premium bath essentials, designed for comfort, sustainability, and style.
                    </p>
                </div>

                {/* Mobile Filter Toggle */}
                <div className="md:hidden mb-4">
                    <button
                        onClick={() => setShowMobileFilters(!showMobileFilters)}
                        className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg border border-card-earthy/20 text-text-earthy"
                    >
                        <SlidersHorizontal className="w-4 h-4" />
                        Filters
                        {hasActiveFilters ? (
                            <span className="w-5 h-5 bg-accent-earthy text-white text-xs rounded-full flex items-center justify-center">
                                {selectedColors.length + (selectedPriceRange.min > priceRange.min || selectedPriceRange.max < priceRange.max ? 1 : 0)}
                            </span>
                        ) : null}
                    </button>
                </div>

                <div className="flex flex-col md:flex-row gap-8">
                    {/* Filters Sidebar */}
                    <div className={`${showMobileFilters ? 'block' : 'hidden'} md:block`}>
                        <ProductFilters
                            colors={colorOptions}
                            selectedColors={selectedColors}
                            onColorChange={setSelectedColors}
                            priceRange={priceRange}
                            selectedPriceRange={selectedPriceRange}
                            onPriceChange={setSelectedPriceRange}
                            onClearFilters={clearFilters}
                        />
                    </div>

                    {/* Product Grid */}
                    <div className="flex-1">
                        {/* Results count */}
                        <p className="text-sm text-text-earthy/60 mb-4">
                            {filteredProducts.length} product{filteredProducts.length !== 1 ? 's' : ''}
                        </p>

                        {filteredProducts.length > 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                                {filteredProducts.map((product) => (
                                    <ProductCard
                                        key={product.id}
                                        id={product.id}
                                        handle={product.handle}
                                        title={product.title}
                                        price={product.price}
                                        image={product.image}
                                        description={product.description}
                                        variantId={product.variantId}
                                        sku={product.sku}
                                    />
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-16 bg-white rounded-lg border border-card-earthy/20">
                                <p className="text-text-earthy/60 mb-4">No products match your filters.</p>
                                <button
                                    onClick={clearFilters}
                                    className="px-4 py-2 bg-accent-earthy text-white rounded-lg hover:bg-accent-earthy/90 transition-colors"
                                >
                                    Clear Filters
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
