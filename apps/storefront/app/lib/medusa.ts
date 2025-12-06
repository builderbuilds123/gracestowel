import Medusa from "@medusajs/js-sdk"

export const createMedusaClient = (backendUrl: string, publishableKey: string) => {
  return new Medusa({
    baseUrl: backendUrl,
    debug: process.env.NODE_ENV === "development",
    publishableKey
  })
}

/**
 * Client-safe Medusa types and helper functions
 * These can be used in both server and client code
 */

// Types matching Medusa v2 Store API responses
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
        sku: string | null;
        prices: Array<{
            id: string;
            amount: number;
            currency_code: string;
        }>;
        options: Array<{
            id: string;
            value: string;
            option_id: string;
        }>;
        inventory_quantity?: number;
    }>;
    options: Array<{
        id: string;
        title: string;
        values: Array<{ id: string; value: string }>;
    }>;
    categories?: Array<{ id: string; name: string; handle: string }>;
    metadata?: Record<string, unknown>;
    created_at: string;
    updated_at: string;
}

export interface MedusaProductsResponse {
    products: MedusaProduct[];
    count: number;
    offset: number;
    limit: number;
}

export interface MedusaProductResponse {
    product: MedusaProduct;
}

/**
 * Validates and casts an API response item to MedusaProduct
 * Ensures critical fields exist before casting to prevent runtime errors
 */
export function validateMedusaProduct(item: unknown): MedusaProduct | null {
    if (!item || typeof item !== 'object') return null;
    
    // Check for critical identifying fields
    const p = item as any;
    if (typeof p.id !== 'string' || typeof p.handle !== 'string') {
        console.warn('Invalid product data: missing id or handle', p);
        return null;
    }

    // Checking for v2 Store API shape compatibility
    // We trust the API to return the correct shape for nested objects if ID/Handle match
    return item as MedusaProduct;
}

/**
 * Helper to format price from Medusa (prices are in cents)
 */
export function formatPrice(amount: number, currencyCode: string = "usd"): string {
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: currencyCode.toUpperCase(),
    }).format(amount);
}

/**
 * Get the price for a specific currency from a product's first variant
 */
export function getProductPrice(
    product: MedusaProduct,
    currencyCode: string = "usd"
): { amount: number; formatted: string } | null {
    const variant = product.variants?.[0];
    const price = variant?.prices?.find(
        (p) => p.currency_code.toLowerCase() === currencyCode.toLowerCase()
    );

    if (!price) return null;

    return {
        amount: price.amount,
        formatted: formatPrice(price.amount, currencyCode),
    };
}

/**
 * Stock status types
 */
export type StockStatus = "in_stock" | "low_stock" | "out_of_stock";

/**
 * Get stock status for a variant
 * @param inventoryQuantity - The inventory quantity of the variant
 * @param lowStockThreshold - Threshold below which to show "Low Stock" (default: 10)
 */
export function getStockStatus(
    inventoryQuantity: number | undefined,
    lowStockThreshold: number = 10
): StockStatus {
    if (inventoryQuantity === undefined || inventoryQuantity === null) {
        // If no inventory tracking, assume in stock
        return "in_stock";
    }

    if (inventoryQuantity <= 0) {
        return "out_of_stock";
    }

    if (inventoryQuantity <= lowStockThreshold) {
        return "low_stock";
    }

    return "in_stock";
}

/**
 * Get stock status display info
 */
export function getStockStatusDisplay(status: StockStatus): {
    label: string;
    color: string;
    bgColor: string;
} {
    switch (status) {
        case "in_stock":
            return {
                label: "In Stock",
                color: "text-green-700",
                bgColor: "bg-green-100",
            };
        case "low_stock":
            return {
                label: "Low Stock",
                color: "text-amber-700",
                bgColor: "bg-amber-100",
            };
        case "out_of_stock":
            return {
                label: "Out of Stock",
                color: "text-red-700",
                bgColor: "bg-red-100",
            };
    }
}

/**
 * Get the backend URL from context or environment variables
 * Centralizes the backend URL resolution logic
 */
export function getBackendUrl(context?: { cloudflare?: { env?: { MEDUSA_BACKEND_URL?: string } } }): string {
    return context?.cloudflare?.env?.MEDUSA_BACKEND_URL ||
           process.env.VITE_MEDUSA_BACKEND_URL ||
           "http://localhost:9000";
}

/**
 * Create a Medusa client instance using environment variables from context or process
 * Uses a WeakMap to cache instances per context object to prevent multiple instantiations
 * during a single request flow (e.g. loader + helpers).
 */
const clientCache = new WeakMap<object, Medusa>();

export function getMedusaClient(context?: { cloudflare?: { env?: { MEDUSA_BACKEND_URL?: string, MEDUSA_PUBLISHABLE_KEY?: string } } }) {
    // If context is provided, try to use it for caching
    if (context && typeof context === 'object') {
        if (clientCache.has(context)) {
            return clientCache.get(context)!;
        }
    }

    const backendUrl = getBackendUrl(context);

    // Prioritize context key, then process env
    const publishableKey = context?.cloudflare?.env?.MEDUSA_PUBLISHABLE_KEY ||
                          process.env.MEDUSA_PUBLISHABLE_KEY;

    if (!publishableKey) {
        throw new Error("Medusa publishable key is not configured. Set MEDUSA_PUBLISHABLE_KEY environment variable.");
    }

    const client = createMedusaClient(backendUrl, publishableKey);

    // Cache the client if we have a context object
    if (context && typeof context === 'object') {
        clientCache.set(context, client);
    }

    return client;
}
