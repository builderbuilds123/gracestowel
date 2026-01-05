/**
 * Product Transformer Service
 * 
 * Unified transformation layer for converting Medusa products to the
 * storefront's internal product format. This consolidates duplicate
 * transformation logic from products.$handle.tsx and towels.tsx.
 */

import { getProductPrice, type MedusaProduct } from "./medusa";
import type { Product, ProductVariant } from "../types/product";
import { formatPriceCents } from "./price";
import { clampAvailability } from "./inventory";

/**
 * Product for listing pages (towels.tsx)
 * Lighter-weight representation for grid/list views
 */
export interface ProductListItem {
    id: string;
    handle: string;
    title: string;
    price: string;           // Formatted price string
    priceAmount: number;     // Price in cents for sorting/filtering
    image: string;
    description: string;
    colors: string[];
}

/**
 * Full product for detail pages (products.$handle.tsx)
 * Complete representation with all metadata
 */
export interface ProductDetail {
    id: string;
    handle: string;
    title: string;
    price: number;           // Price in cents
    formattedPrice: string;
    description: string;
    images: string[];
    features: string[];
    dimensions: string;
    careInstructions: string[];
    colors: string[];
    disableEmbroidery: boolean;
    variants: ProductVariant[];
}

/**
 * Parse JSON array from metadata field
 * Handles both string and array formats safely
 */
function parseMetadataArray(value: unknown): string[] {
    if (!value) return [];
    
    if (Array.isArray(value)) {
        return value.filter((v): v is string => typeof v === 'string');
    }
    
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            if (Array.isArray(parsed)) {
                return parsed.filter((v): v is string => typeof v === 'string');
            }
        } catch {
            // If it's not valid JSON, return empty array
        }
    }
    
    return [];
}

/**
 * Extract color options from product variants
 */
function extractColors(product: MedusaProduct): string[] {
    // Method 1: From variant options (for existing variants)
    const colorsFromVariants = product.variants
        ?.map(v => v.options?.find(o => o.value)?.value)
        .filter((c): c is string => !!c) || [];
    
    // Method 2: From product options (for all available colors)
    const colorOption = product.options?.find(o => o.title.toLowerCase() === 'color');
    const colorsFromOptions = colorOption?.values?.map(v => v.value) || [];
    
    // Prefer colors from options as it's the complete list
    // Fall back to variant colors if options not available
    const colors = colorsFromOptions.length > 0 ? colorsFromOptions : colorsFromVariants;
    
    // Remove duplicates
    return [...new Set(colors)];
}

/**
 * Transform Medusa product to list item format
 * Used for product grids on collection pages
 */
export function transformToListItem(
    product: MedusaProduct,
    currency: string = "usd"
): ProductListItem {
    const priceData = getProductPrice(product, currency);
    const colors = extractColors(product);
    
    return {
        id: product.id,
        handle: product.handle,
        title: product.title,
        price: priceData?.formatted || "$0.00",
        priceAmount: priceData?.amount || 0,
        image: product.images?.[0]?.url || product.thumbnail || "/placeholder.jpg",
        description: product.description || "",
        colors,
    };
}

/**
 * Transform Medusa product to detail format
 * Used for product detail pages
 */
export function transformToDetail(
    product: MedusaProduct,
    currency: string = "usd"
): ProductDetail {
    const priceData = getProductPrice(product, currency);
    const metadata = product.metadata || {};
    const colors = extractColors(product);
    
    // Parse metadata arrays
    const features = parseMetadataArray(metadata.features);
    const careInstructions = parseMetadataArray(metadata.care_instructions);
    
    return {
        id: product.id,
        handle: product.handle,
        title: product.title,
        price: priceData?.amount || 0,
        formattedPrice: priceData?.formatted || "$0.00",
        description: product.description || "",
        images: product.images?.map(img => img.url) || [product.thumbnail || "/placeholder.jpg"],
        features,
        dimensions: (metadata.dimensions as string) || "",
        careInstructions,
        colors,
        disableEmbroidery: metadata.disable_embroidery === "true",
        variants: product.variants?.map(v => ({
            id: v.id,
            title: v.title,
            sku: v.sku || undefined,
            // AC4 (INV-02): Clamp negative inventory to 0 for storefront display
            inventory_quantity: clampAvailability(v.inventory_quantity),
            options: v.options,
            prices: v.prices,
        })) || [],
    };
}

/**
 * Transform multiple Medusa products to list items
 */
export function transformToListItems(
    products: MedusaProduct[],
    currency: string = "usd"
): ProductListItem[] {
    return products.map(p => transformToListItem(p, currency));
}

