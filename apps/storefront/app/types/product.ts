/**
 * Unified product types for the Grace Stowel storefront
 * 
 * This module provides type definitions that bridge:
 * - Legacy static products (numeric IDs)
 * - Medusa v2 products (string IDs like "prod_01HXY...")
 */

/**
 * Product ID type - supports both legacy numeric IDs and Medusa string IDs
 * 
 * Legacy products use numbers (1, 2, 3, 4)
 * Medusa products use strings ("prod_01HXY...")
 * 
 * Eventually, we should migrate fully to string IDs (handles)
 */
export type ProductId = string | number;

/**
 * Embroidery customization data
 */
export interface EmbroideryData {
    type: 'text' | 'drawing';
    data: string;
    font?: string;
    color: string;
}

/**
 * Unified product interface used across the storefront
 */
export interface Product {
    id: ProductId;
    handle: string;
    title: string;
    price: number;           // Price in smallest currency unit (cents)
    formattedPrice: string;  // Display price (e.g., "$35.00")
    description: string;
    images: string[];
    features: string[];
    dimensions: { label: string; value: string }[];
    careInstructions: string[];
    colors: string[];
    disableEmbroidery?: boolean;
    variants?: ProductVariant[];
}

/**
 * Product variant (from Medusa)
 */
export interface ProductVariant {
    id: string;
    title: string;
    sku?: string;
    inventory_quantity?: number;
    options?: Array<{
        id: string;
        value: string;
        option_id: string;
    }>;
    prices?: Array<{
        id: string;
        amount: number;
        currency_code: string;
    }>;
    images?: string[];
}

/**
 * Cart item interface
 */
export interface CartItem {
    id: ProductId;
    variantId?: string;      // Medusa variant ID for order creation
    title: string;
    price: string;           // Formatted price string (e.g., "$35.00")
    originalPrice?: string;  // Original price if discounted
    image: string;
    quantity: number;
    color?: string;
    sku?: string;
    embroidery?: EmbroideryData;
}

/**
 * Type guard to check if an ID is a legacy numeric ID
 */
export function isLegacyId(id: ProductId): id is number {
    return typeof id === 'number';
}

/**
 * Type guard to check if an ID is a Medusa string ID
 * Accepts product IDs (prod_xxx) and variant IDs (variant_xxx)
 */
export function isMedusaId(id: ProductId): id is string {
    return typeof id === 'string' && (id.startsWith('prod_') || id.startsWith('variant_'));
}

/**
 * Type guard to check if an ID is a product handle
 */
export function isProductHandle(id: ProductId): id is string {
    return typeof id === 'string' && !id.startsWith('prod_');
}

/**
 * Normalize a product ID to a string for comparison
 */
export function normalizeProductId(id: ProductId): string {
    return String(id);
}

/**
 * Compare two product IDs for equality
 * Handles both numeric and string IDs
 */
export function productIdsEqual(a: ProductId, b: ProductId): boolean {
    // If both are the same type, compare directly
    if (typeof a === typeof b) {
        return a === b;
    }
    // Otherwise, compare as strings
    return String(a) === String(b);
}

