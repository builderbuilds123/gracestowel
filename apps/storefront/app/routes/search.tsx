import type { Route } from "./+types/search";
import { ProductCard } from "../components/ProductCard";
import { getMedusaClient, castToMedusaProduct, type MedusaProduct } from "../lib/medusa";
import { getProductPrice } from "../lib/medusa";
import { Search } from "../lib/icons";
import { useSearchParams, Form } from "react-router";
import { createLogger } from "../lib/logger";

export async function loader({ context, request }: Route.LoaderArgs) {
    const url = new URL(request.url);
    const query = url.searchParams.get("q")?.trim() || "";

    if (!query) {
        return { products: [], query: "", count: 0 };
    }

    try {
        const medusa = getMedusaClient(context);
        const { products: rawProducts } = await medusa.store.product.list({ 
            limit: 50, 
            fields: "+variants,+variants.prices,+variants.inventory_quantity,+options,+options.values,+images,+categories,+metadata" 
        });

        // OPTIMIZATION (Issue #22): Combine filter and transform into single loop
        const searchLower = query.toLowerCase();
        const products: Array<{
            id: string;
            handle: string;
            title: string;
            price: string;
            image: string;
            description: string;
            variantId?: string;
            sku?: string;
        }> = [];

        for (const rawProduct of rawProducts) {
            const product = castToMedusaProduct(rawProduct);
            
            // Filter check
            const matches = 
                product.title.toLowerCase().includes(searchLower) ||
                product.handle.toLowerCase().includes(searchLower) ||
                (product.description?.toLowerCase().includes(searchLower) ?? false);
            
            if (!matches) continue;
            
            // Transform during same iteration
            const priceData = getProductPrice(product, "usd");
            products.push({
                id: product.id,
                handle: product.handle,
                title: product.title,
                price: priceData?.formatted || "$0.00",
                image: product.images?.[0]?.url || product.thumbnail || "/placeholder.jpg",
                description: product.description || "",
                variantId: product.variants?.[0]?.id,
                sku: product.variants?.[0]?.sku || undefined,
            });
        }

        return { products, query, count: products.length };
    } catch (error) {
        const logger = createLogger({ context: "search-loader" });
        logger.error("Search failed", error instanceof Error ? error : new Error(String(error)));
        return { products: [], query, count: 0, error: "Search failed" };
    }
}

export default function SearchPage({ loaderData }: Route.ComponentProps) {
    const { products, query, count } = loaderData;
    const [searchParams] = useSearchParams();

    return (
        <div className="min-h-screen bg-background-earthy pt-24 pb-16">
            <div className="container mx-auto px-4 md:px-8">
                {/* Search Header */}
                <div className="text-center mb-12">
                    <h1 className="text-4xl md:text-5xl font-serif text-text-earthy mb-6">
                        Search
                    </h1>
                    
                    {/* Search Form */}
                    <Form method="get" className="max-w-md mx-auto">
                        <div className="relative">
                            <input
                                type="text"
                                name="q"
                                defaultValue={query}
                                placeholder="Search for products..."
                                className="w-full px-4 py-3 pr-12 text-lg rounded-lg border border-card-earthy/30 
                                    bg-white text-text-earthy placeholder:text-text-earthy/50
                                    focus:outline-none focus:ring-2 focus:ring-accent-earthy/20 focus:border-accent-earthy"
                            />
                            <button
                                type="submit"
                                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-text-earthy/60 hover:text-accent-earthy transition-colors"
                            >
                                <Search className="w-5 h-5" />
                            </button>
                        </div>
                    </Form>
                </div>

                {/* Results */}
                {query ? (
                    <div className="mb-8">
                        <p className="text-text-earthy/80 text-center">
                            {count === 0 
                                ? `No products found for "${query}"` 
                                : `Found ${count} product${count !== 1 ? 's' : ''} for "${query}"`
                            }
                        </p>
                    </div>
                ) : null}

                {/* Product Grid */}
                {products.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {products.map((product) => (
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
                ) : query ? (
                    <div className="text-center py-16">
                        <p className="text-text-earthy/60 mb-4">
                            Try searching for something else or browse our collections.
                        </p>
                        <a 
                            href="/towels" 
                            className="inline-block px-6 py-3 bg-accent-earthy text-white rounded-lg hover:bg-accent-earthy/90 transition-colors"
                        >
                            Browse All Towels
                        </a>
                    </div>
                ) : (
                    <div className="text-center py-16">
                        <p className="text-text-earthy/60">
                            Enter a search term to find products.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}

