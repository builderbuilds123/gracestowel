import { useParams, Link } from "react-router";
import { ProductCard } from "../components/ProductCard";

export default function Collection() {
    const { handle } = useParams();
    const collectionTitle = handle ? handle.charAt(0).toUpperCase() + handle.slice(1).replace('-', ' ') : 'Collection';

    // Mock products
    const products = [
        {
            id: 1,
            title: "The Nuzzle",
            description: "Our signature washcloth. Gentle enough for a baby, durable enough for daily use.",
            price: "$18.00",
            image: "/washcloth-nuzzle.jpg",
            handle: "the-nuzzle",
            variantId: undefined,
            sku: undefined,
        },
        {
            id: 2,
            title: "The Cradle",
            description: "The perfect hand towel. Soft, absorbent, and ready to comfort your hands.",
            price: "$25.00",
            image: "/hand-towel-cradle.jpg",
            handle: "the-cradle",
            variantId: undefined,
            sku: undefined,
        },
        {
            id: 3,
            title: "The Bear Hug",
            description: "Wrap yourself in a warm embrace with our oversized, ultra-plush bath towel.",
            price: "$35.00",
            image: "/bath-towel-bearhug.jpg",
            handle: "the-bearhug",
            variantId: undefined,
            sku: undefined,
        },
    ];

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
