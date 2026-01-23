import { useParams, Link, useLoaderData } from "react-router";
import { ProductCard } from "../components/ProductCard";
import { getMedusaClient, getDefaultRegion } from "../lib/medusa";
import { transformToListItems, type ProductListItem } from "../lib/product-transformer";
import { createLogger } from "../lib/logger";
import type { Route } from "./+types/collections.$handle";

export async function loader({ params, context }: Route.LoaderArgs) {
    const { handle } = params;
    if (!handle) throw new Response("Not Found", { status: 404 });

    const medusa = getMedusaClient(context);
    
    // OPTIMIZATION (Issue #19): Fetch region and products in parallel using Promise.all()
    // Products can be fetched without region_id (Medusa uses default), then we use region for currency
    const [regionInfo, productResponse] = await Promise.all([
        getDefaultRegion(medusa),
        medusa.store.product.list({
            category_id: [handle], // Often handle matches category handle in my seed
            // Don't wait for region_id - Medusa will use default region
            // We'll use region info for currency display after both resolve
            fields: "+variants.calculated_price,+variants.prices,+images"
        })
    ]);
    
    const regionId = regionInfo?.region_id;
    const currencyCode = regionInfo?.currency_code || "cad";
    const { products } = productResponse;

    try {

        // If no products found by ID, try searching categories by handle first
        let collectionProducts = products;
        if (products.length === 0) {
            const { product_categories } = await medusa.store.category.list({
                handle: handle,
                limit: 1
            });
            if (product_categories.length > 0) {
                const res = await medusa.store.product.list({
                    category_id: [product_categories[0].id],
                    region_id: regionId,
                    fields: "+variants.calculated_price,+variants.prices,+images"
                });
                collectionProducts = res.products;
            }
        }

        return { 
            products: transformToListItems(collectionProducts as any, currencyCode),
            handle 
        };
    } catch (error) {
        console.error("Failed to fetch collection products:", error);
        return { products: [], handle };
    }
}

export default function Collection({ loaderData }: Route.ComponentProps) {
    const { products, handle } = loaderData;
    const collectionTitle = handle ? handle.charAt(0).toUpperCase() + handle.slice(1).replace('-', ' ') : 'Collection';


    return (
        <div className="min-h-screen flex flex-col">

            <main className="flex-grow">
                <div className="bg-card-earthy/30 py-16 mb-12">
                    <div className="container mx-auto px-4 text-center">
                        <h1 className="text-4xl md:text-5xl font-serif text-text-earthy mb-4">{collectionTitle}</h1>
                        <div className="flex justify-center gap-2 text-sm text-text-earthy/60">
                            <Link to="/" className="hover:text-accent-earthy">Home</Link>
                            <span>/</span>
                            <span>{collectionTitle}</span>
                        </div>
                    </div>
                </div>

                <div className="container mx-auto px-4 md:px-8 max-w-7xl mb-20">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-12">
                        {products.map((product) => (
                            <ProductCard
                                key={product.id}
                                id={product.id}
                                title={product.title}
                                description={product.description}
                                price={product.price}
                                image={product.image}
                                handle={product.handle}
                                variantId={product.variantId}
                                sku={product.sku}
                            />
                        ))}
                    </div>
                </div>
            </main>
        </div>
    );
}
