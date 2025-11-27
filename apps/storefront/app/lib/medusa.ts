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

