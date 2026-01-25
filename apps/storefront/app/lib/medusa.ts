import Medusa from "@medusajs/js-sdk"
import { clampAvailability } from "./inventory"
import { createLogger } from "./logger"

const logger = createLogger({ context: "medusa-lib" })

export const createMedusaClient = (backendUrl: string, publishableKey: string) => {
  return new Medusa({
    baseUrl: backendUrl,
    debug: true, // Enable SDK debug logging for request/response visibility
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
        compare_at_price?: number;
        original_price?: number;
        calculated_price?: {
            calculated_amount: number;
            original_amount?: number;
            currency_code?: string;
        };
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
        // Physical attributes
        weight?: number;
        length?: number;
        height?: number;
        width?: number;
        hs_code?: string;
        origin_country?: string;
        material?: string;
        images: Array<{ id: string; url: string }>;
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
    // Physical attributes (Medusa v2)
    weight?: number;
    length?: number;
    height?: number;
    width?: number;
    hs_code?: string;
    origin_country?: string;
    material?: string;
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
        logger.warn('Invalid product data: missing id or handle', { item: p });
        return null;
    }

    // Checking for v2 Store API shape compatibility
    // We trust the API to return the correct shape for nested objects if ID/Handle match
    return item as MedusaProduct;
}

/**
 * Safely casts a generic item to MedusaProduct, ensuring types match.
 * Useful for mapping lists from the SDK.
 */
export function castToMedusaProduct(item: unknown): MedusaProduct {
    const validated = validateMedusaProduct(item);
    if (!validated) {
        throw new Error(`Invalid product data encountered: ${JSON.stringify(item)}`);
    }
    return validated;
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
 * Get the default region ID for Canada (CAD)
 * @param medusa - Medusa client instance
 * @returns Object with region_id and currency_code for use in product queries
 */
export async function getDefaultRegion(
    medusa: ReturnType<typeof createMedusaClient>
): Promise<{ region_id: string; currency_code: string } | null> {
    try {
        // Fetch Canada region by default (or fallback to first region)
        const { regions } = await medusa.store.region.list({ limit: 10 });
        
        // Prefer Canada region for CAD
        const canadaRegion = regions.find(r => r.currency_code === "cad");
        if (canadaRegion) {
            return { region_id: canadaRegion.id, currency_code: "cad" };
        }
        
        // Fallback to first region
        if (regions.length > 0) {
            return { region_id: regions[0].id, currency_code: regions[0].currency_code };
        }
        
        return null;
    } catch (error) {
        logger.error("Failed to fetch default region:", error as Error);
        return null;
    }
}

/**
 * Get the price for a specific currency from a product's first variant
 * Supports both Medusa v2 calculated_price (when region_id passed) and legacy prices array
 */
export function getProductPrice(
    product: MedusaProduct,
    currencyCode: string = "cad"
): { amount: number; formatted: string } | null {
    const variant = product.variants?.[0] as any;
    
    // Method 1: Check for calculated_price (Medusa v2 with region_id)
    if (variant?.calculated_price) {
        const calculatedAmount = variant.calculated_price.calculated_amount;
        if (typeof calculatedAmount === 'number') {
            return {
                amount: calculatedAmount,
                formatted: formatPrice(calculatedAmount, variant.calculated_price.currency_code || currencyCode),
            };
        }
    }
    
    // Method 2: Fallback to prices array
    const price = variant?.prices?.find(
        (p: any) => p.currency_code?.toLowerCase() === currencyCode.toLowerCase()
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

    // AC4 (INV-02): Clamp negative values to 0 for storefront display
    const clampedQuantity = clampAvailability(inventoryQuantity);

    if (clampedQuantity <= 0) {
        return "out_of_stock";
    }

    if (clampedQuantity <= lowStockThreshold) {
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

// Add global type for window.ENV
declare global {
  interface Window {
    ENV?: {
      MEDUSA_BACKEND_URL?: string;
      MEDUSA_PUBLISHABLE_KEY?: string;
    };
  }
}

// Singleton to store Cloudflare env on the server for utility access without context
let serverEnv: { MEDUSA_BACKEND_URL?: string, MEDUSA_PUBLISHABLE_KEY?: string } | null = null;

/**
 * Sets the global server environment. Called from the worker entry point.
 */
export function setServerEnv(env: any) {
    if (env && typeof env === 'object') {
        serverEnv = env;
    }
}

/**
 * Get the backend URL from context or environment variables
 * Centralizes the backend URL resolution logic
 */
export function getBackendUrl(context?: { cloudflare?: { env?: { MEDUSA_BACKEND_URL?: string } } }): string {
    // 1. Check Cloudflare context (server-side explicit)
    if (context?.cloudflare?.env?.MEDUSA_BACKEND_URL) {
        return context.cloudflare.env.MEDUSA_BACKEND_URL;
    }

    // 2. Check globally stored server env (server-side implicit fallback)
    if (serverEnv?.MEDUSA_BACKEND_URL) {
        return serverEnv.MEDUSA_BACKEND_URL;
    }

    // 3. Check window.ENV (client-side hydration)
    if (typeof window !== "undefined" && window.ENV?.MEDUSA_BACKEND_URL) {
        return window.ENV.MEDUSA_BACKEND_URL;
    }

    // 4. Check import.meta.env (Vite build-time)
    return import.meta.env.VITE_MEDUSA_BACKEND_URL || "http://localhost:9000";
}

/**
 * Create a Medusa client instance using environment variables from context or process
 * Uses a WeakMap to cache instances per context object to prevent multiple instantiations
 * during a single request flow (e.g. loader + helpers).
 */
const clientCache = new WeakMap<object, Medusa>();

// Singleton for client-side usage to avoid recreating client on every render
let clientSideInstance: Medusa | null = null;

export function getMedusaClient(context?: { cloudflare?: { env?: { MEDUSA_BACKEND_URL?: string, MEDUSA_PUBLISHABLE_KEY?: string } } }) {
    // If context is provided, try to use it for caching
    if (context && typeof context === 'object') {
        if (clientCache.has(context)) {
            return clientCache.get(context)!;
        }
    }

    // Return singleton on client-side if no context or strictly client-side
    if (!context && typeof window !== "undefined" && clientSideInstance) {
        return clientSideInstance;
    }

    const backendUrl = getBackendUrl(context);

    // Prioritize context key, then globally stored server env, then window.ENV, finally process.env (for tests)
    let publishableKey = context?.cloudflare?.env?.MEDUSA_PUBLISHABLE_KEY;
    
    if (!publishableKey && serverEnv?.MEDUSA_PUBLISHABLE_KEY) {
        publishableKey = serverEnv.MEDUSA_PUBLISHABLE_KEY;
    }

    if (!publishableKey && typeof window !== "undefined") {
        publishableKey = window.ENV?.MEDUSA_PUBLISHABLE_KEY;
    }

    if (!publishableKey && typeof process !== "undefined" && process.env.MEDUSA_PUBLISHABLE_KEY) {
        publishableKey = process.env.MEDUSA_PUBLISHABLE_KEY;
    }

    if (!publishableKey) {
        throw new Error("Medusa publishable key is not configured. Set MEDUSA_PUBLISHABLE_KEY environment variable.");
    }

    const client = createMedusaClient(backendUrl, publishableKey);

    // Cache the client if we have a context object
    if (context && typeof context === 'object') {
        clientCache.set(context, client);
    } else if (typeof window !== "undefined") {
        clientSideInstance = client;
    }

    return client;
}
