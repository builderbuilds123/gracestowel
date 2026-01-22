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
    variantId?: string;      // First variant ID for cart operations
    sku?: string;            // First variant SKU for cart operations
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
    originalPrice?: number;  // Original price in cents (optional, for discounts)
    formattedPrice: string;
    description: string;
    images: string[];
    features: string[];
    dimensions: { label: string; value: string }[];
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
    
    // Handle comma-separated strings (new format)
    if (typeof value === 'string') {
        // Try parsing as JSON first
        try {
            const parsed = JSON.parse(value);
            if (Array.isArray(parsed)) {
                return parsed.filter((v): v is string => typeof v === 'string');
            }
        } catch {
            // Not JSON, treat as comma-separated string
            return value.split(',').map(s => s.trim()).filter(Boolean);
        }
    }
    
    if (Array.isArray(value)) {
        return value.filter((v): v is string => typeof v === 'string');
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
    
    // Method 2: From product options (for all available colors/patterns)
    const colorOption = product.options?.find(o => 
        ['color', 'pattern'].includes(o.title.toLowerCase())
    );
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
    const firstVariant = product.variants?.[0];

    return {
        id: product.id,
        handle: product.handle,
        title: product.title,
        price: priceData?.formatted || "$0.00",
        priceAmount: priceData?.amount || 0,
        image: product.images?.[0]?.url || product.thumbnail || "/placeholder.jpg",
        description: product.description || "",
        colors,
        variantId: firstVariant?.id,
        sku: firstVariant?.sku || undefined,
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
    const firstVariant = product.variants?.[0];
    const originalPriceCandidate = firstVariant?.calculated_price?.original_amount
        ?? firstVariant?.compare_at_price
        ?? firstVariant?.original_price;
    const originalPrice = typeof originalPriceCandidate === "number" && originalPriceCandidate > 0
        ? originalPriceCandidate
        : undefined;
    
    // Parse metadata arrays
    const features = parseMetadataArray(metadata.features);
    const careInstructions = parseMetadataArray(metadata.care_instructions);

    // Construct dimensions string from physical attributes
    // Prefer Product-level attributes, fallback to first Variant
    const height = product.height || firstVariant?.height;
    const width = product.width || firstVariant?.width;
    const length = product.length || firstVariant?.length;
    const weight = product.weight || firstVariant?.weight;

    let dimensions: { label: string; value: string }[] = [];
    
    // Check if metadata.dimensions is a legacy object (unlikely now) or string, 
    // but primarily we build from attributes.
    // If metadata.dimensions IS still present and we can't parse attributes, we might want to respect it,
    // but the requirement is to "use height width length etc in product attributes".
    
    if (height) dimensions.push({ label: "Height", value: `${height}cm` });
    if (width) dimensions.push({ label: "Width", value: `${width}cm` });
    if (length) dimensions.push({ label: "Length", value: `${length}cm` });
    if (weight) dimensions.push({ label: "Weight", value: `${weight}g` });

    // Fallback: If no attributes but metadata.dimensions string exists (legacy), 
    // try to use it as a generic "Dimensions" entry? 
    // The user explicitly asked to "list the attributes as is".

    
    return {
        id: product.id,
        handle: product.handle,
        title: product.title,
        price: priceData?.amount || 0,
        originalPrice,
        formattedPrice: priceData?.formatted || "$0.00",
        description: product.description || "",
        images: product.images?.map(img => img.url) || [product.thumbnail || "/placeholder.jpg"],
        features,
        dimensions,
        careInstructions,
        colors,
        disableEmbroidery: metadata.disable_embroidery === "true",
        variants: product.variants?.map(v => ({
            id: v.id,
            title: v.title,
            sku: v.sku || undefined,
            // AC4 (INV-02): Clamp negative inventory to 0, but preserve null/undefined
            // (null/undefined means inventory is not managed = always in stock)
            inventory_quantity: v.inventory_quantity != null 
                ? clampAvailability(v.inventory_quantity) 
                : undefined,
            options: v.options,
            prices: v.prices,
            images: v.images?.map(img => img.url) || [],
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
