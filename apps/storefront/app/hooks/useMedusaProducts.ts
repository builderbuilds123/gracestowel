import { useState, useEffect } from "react";

/**
 * Medusa API configuration
 * Uses environment variable or falls back to localhost for development
 */
const MEDUSA_API_URL = typeof process !== 'undefined' 
    ? (process.env.MEDUSA_BACKEND_URL || "http://localhost:9000")
    : "http://localhost:9000";

/**
 * Product type matching Medusa's store API response
 */
export interface MedusaProduct {
    id: string;
    handle: string;
    title: string;
    description: string | null;
    thumbnail: string | null;
    images: Array<{ id: string; url: string }>;
    variants: Array<{
        id: string;
        title: string;
        prices: Array<{
            amount: number;
            currency_code: string;
        }>;
    }>;
    options: Array<{
        id: string;
        title: string;
        values: Array<{ id: string; value: string }>;
    }>;
    metadata?: Record<string, unknown>;
}

interface UseMedusaProductsResult {
    products: MedusaProduct[];
    isLoading: boolean;
    error: Error | null;
    refetch: () => Promise<void>;
}

interface UseMedusaProductResult {
    product: MedusaProduct | null;
    isLoading: boolean;
    error: Error | null;
    refetch: () => Promise<void>;
}

/**
 * Fetch all products from Medusa Store API
 */
export function useMedusaProducts(): UseMedusaProductsResult {
    const [products, setProducts] = useState<MedusaProduct[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    const fetchProducts = async () => {
        setIsLoading(true);
        setError(null);
        
        try {
            const response = await fetch(`${MEDUSA_API_URL}/store/products`, {
                headers: {
                    "Content-Type": "application/json",
                },
                credentials: "include",
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch products: ${response.status}`);
            }

            const data = await response.json();
            setProducts(data.products || []);
        } catch (err) {
            setError(err instanceof Error ? err : new Error("Unknown error"));
            console.error("Error fetching products from Medusa:", err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchProducts();
    }, []);

    return { products, isLoading, error, refetch: fetchProducts };
}

/**
 * Fetch a single product by handle from Medusa Store API
 */
export function useMedusaProduct(handle: string): UseMedusaProductResult {
    const [product, setProduct] = useState<MedusaProduct | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    const fetchProduct = async () => {
        if (!handle) {
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            const response = await fetch(
                `${MEDUSA_API_URL}/store/products?handle=${encodeURIComponent(handle)}`,
                {
                    headers: {
                        "Content-Type": "application/json",
                    },
                    credentials: "include",
                }
            );

            if (!response.ok) {
                throw new Error(`Failed to fetch product: ${response.status}`);
            }

            const data = await response.json();
            setProduct(data.products?.[0] || null);
        } catch (err) {
            setError(err instanceof Error ? err : new Error("Unknown error"));
            console.error("Error fetching product from Medusa:", err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchProduct();
    }, [handle]);

    return { product, isLoading, error, refetch: fetchProduct };
}

/**
 * Helper to get the formatted price from a Medusa product variant
 */
export function getFormattedPrice(
    product: MedusaProduct,
    currencyCode: string = "usd"
): string {
    const variant = product.variants?.[0];
    const price = variant?.prices?.find(
        (p) => p.currency_code.toLowerCase() === currencyCode.toLowerCase()
    );

    if (!price) return "$0.00";

    // Medusa stores prices in cents
    const amount = price.amount / 100;
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: currencyCode.toUpperCase(),
    }).format(amount);
}

/**
 * Helper to get price as a number from a Medusa product variant
 */
export function getPriceAmount(
    product: MedusaProduct,
    currencyCode: string = "usd"
): number {
    const variant = product.variants?.[0];
    const price = variant?.prices?.find(
        (p) => p.currency_code.toLowerCase() === currencyCode.toLowerCase()
    );

    return price ? price.amount / 100 : 0;
}

