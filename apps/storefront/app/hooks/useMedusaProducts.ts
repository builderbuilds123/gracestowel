import { useState, useEffect, useCallback } from "react";
import { monitoredFetch } from "../utils/monitored-fetch";

// Check if in development mode
const isDevelopment = import.meta.env.MODE === 'development';

/**
 * Medusa API configuration
 * Uses global ENV injected by server or falls back to localhost
 */
const MEDUSA_API_URL = typeof window !== 'undefined'
    ? (window as unknown as { ENV?: { MEDUSA_BACKEND_URL?: string } }).ENV?.MEDUSA_BACKEND_URL || "http://localhost:9000"
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

interface UseMedusaProductsOptions {
    /** Region ID to fetch region-specific pricing */
    regionId?: string | null;
    /** Limit number of products */
    limit?: number;
    /** Offset for pagination */
    offset?: number;
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
 * @param options - Optional configuration including regionId for pricing
 */
export function useMedusaProducts(options: UseMedusaProductsOptions = {}): UseMedusaProductsResult {
    const { regionId, limit, offset } = options;
    const [products, setProducts] = useState<MedusaProduct[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    const fetchProducts = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        
        try {
            // Build query params
            const params = new URLSearchParams();
            if (regionId) {
                params.append('region_id', regionId);
                if (isDevelopment) {
                    console.log('[useMedusaProducts] Fetching with region_id:', regionId);
                }
            }
            if (limit) params.append('limit', limit.toString());
            if (offset) params.append('offset', offset.toString());
            
            const queryString = params.toString();
            const url = `${MEDUSA_API_URL}/store/products${queryString ? `?${queryString}` : ''}`;

            const response = await monitoredFetch(url, {
                headers: {
                    "Content-Type": "application/json",
                },
                credentials: "include",
                label: "medusa-products",
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch products: ${response.status}`);
            }

            const data = (await response.json()) as { products: MedusaProduct[] };
            setProducts(data.products || []);
        } catch (err) {
            setError(err instanceof Error ? err : new Error("Unknown error"));
            console.error("Error fetching products from Medusa:", err);
        } finally {
            setIsLoading(false);
        }
    }, [regionId, limit, offset]);

    useEffect(() => {
        fetchProducts();
    }, [fetchProducts]);

    return { products, isLoading, error, refetch: fetchProducts };
}

interface UseMedusaProductOptions {
    /** Region ID to fetch region-specific pricing */
    regionId?: string | null;
}

/**
 * Fetch a single product by handle from Medusa Store API
 * @param handle - Product handle to fetch
 * @param options - Optional configuration including regionId for pricing
 */
export function useMedusaProduct(handle: string, options: UseMedusaProductOptions = {}): UseMedusaProductResult {
    const { regionId } = options;
    const [product, setProduct] = useState<MedusaProduct | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    const fetchProduct = useCallback(async () => {
        if (!handle) {
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            // Build query params
            const params = new URLSearchParams();
            params.append('handle', handle);
            if (regionId) {
                params.append('region_id', regionId);
                if (isDevelopment) {
                    console.log('[useMedusaProduct] Fetching with region_id:', regionId);
                }
            }

            const url = `${MEDUSA_API_URL}/store/products?${params.toString()}`;

            const response = await monitoredFetch(url, {
                headers: {
                    "Content-Type": "application/json",
                },
                credentials: "include",
                label: "medusa-product-by-handle",
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch product: ${response.status}`);
            }

            const data = (await response.json()) as { products: MedusaProduct[] };
            setProduct(data.products?.[0] || null);
        } catch (err) {
            setError(err instanceof Error ? err : new Error("Unknown error"));
            console.error("Error fetching product from Medusa:", err);
        } finally {
            setIsLoading(false);
        }
    }, [handle, regionId]);

    useEffect(() => {
        fetchProduct();
    }, [fetchProduct]);

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
    
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: currencyCode.toUpperCase(),
    }).format(price.amount);
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

    return price ? price.amount : 0;
}
