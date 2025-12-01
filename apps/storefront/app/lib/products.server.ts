/**
 * Direct PostgreSQL product queries via Hyperdrive
 * 
 * This module provides direct database access for read-only product operations,
 * bypassing the Medusa backend to avoid cold starts and reduce latency.
 * 
 * IMPORTANT: This is for READ-ONLY operations only. All write operations
 * (cart, checkout, orders) must go through the Medusa API.
 * 
 * Schema based on Medusa v2 database structure.
 */

import { Client } from "pg";
import type { MedusaProduct, MedusaProductsResponse } from "./medusa";

interface CloudflareContext {
    cloudflare?: {
        env?: {
            HYPERDRIVE?: {
                connectionString: string;
            };
            DATABASE_URL?: string;
        };
    };
}

/**
 * Get a PostgreSQL client from Hyperdrive or direct connection
 */
async function getClient(context: CloudflareContext): Promise<Client> {
    const hyperdrive = context?.cloudflare?.env?.HYPERDRIVE;
    
    if (hyperdrive?.connectionString) {
        const client = new Client({ connectionString: hyperdrive.connectionString });
        await client.connect();
        return client;
    }

    const url = context?.cloudflare?.env?.DATABASE_URL || process.env.DATABASE_URL;
    if (!url) {
        throw new Error("No database connection available");
    }

    const client = new Client({ connectionString: url });
    await client.connect();
    return client;
}

/**
 * Product row from database query
 */
interface ProductRow {
    id: string;
    handle: string;
    title: string;
    description: string | null;
    thumbnail: string | null;
    created_at: Date;
    updated_at: Date;
    metadata: Record<string, unknown> | null;
}

/**
 * Variant row from database query
 */
interface VariantRow {
    id: string;
    product_id: string;
    title: string;
    sku: string | null;
    inventory_quantity: number | null;
}

/**
 * Price row from database query
 */
interface PriceRow {
    id: string;
    variant_id: string;
    amount: number;
    currency_code: string;
}

/**
 * Image row from database query
 */
interface ImageRow {
    id: string;
    product_id: string;
    url: string;
    rank: number;
}

/**
 * Option row from database query
 */
interface OptionRow {
    id: string;
    product_id: string;
    title: string;
}

/**
 * Option value row from database query
 */
interface OptionValueRow {
    id: string;
    option_id: string;
    value: string;
}

/**
 * Variant option row from database query
 */
interface VariantOptionRow {
    id: string;
    variant_id: string;
    option_value_id: string;
    option_id: string;
    value: string;
}

/**
 * Category row from database query
 */
interface CategoryRow {
    id: string;
    product_id: string;
    category_id: string;
    name: string;
    handle: string;
}

/**
 * Fetch products directly from PostgreSQL via Hyperdrive
 */
export async function getProductsFromDB(
    context: CloudflareContext,
    options: {
        limit?: number;
        offset?: number;
        handle?: string;
        search?: string;
    } = {}
): Promise<MedusaProductsResponse> {
    const { limit = 20, offset = 0, handle, search } = options;
    
    let client: Client | null = null;
    
    try {
        client = await getClient(context);
        
        // Build product query with optional filters
        let productQuery = `
            SELECT 
                id, handle, title, description, thumbnail,
                created_at, updated_at, metadata
            FROM product
            WHERE deleted_at IS NULL
        `;
        const params: (string | number)[] = [];
        let paramIndex = 1;
        
        if (handle) {
            productQuery += ` AND handle = $${paramIndex}`;
            params.push(handle);
            paramIndex++;
        }
        
        if (search) {
            productQuery += ` AND (title ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`;
            params.push(`%${search}%`);
            paramIndex++;
        }
        
        productQuery += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(limit, offset);
        
        // Execute product query
        const productResult = await client.query<ProductRow>(productQuery, params);
        const products = productResult.rows;
        
        if (products.length === 0) {
            return { products: [], count: 0, offset, limit };
        }
        
        const productIds = products.map(p => p.id);
        
        // Fetch all related data in parallel for efficiency
        const [variants, images, options, categories] = await Promise.all([
            fetchVariantsWithPrices(client, productIds),
            fetchImages(client, productIds),
            fetchOptionsWithValues(client, productIds),
            fetchCategories(client, productIds),
        ]);
        
        // Get count for pagination
        let countQuery = `SELECT COUNT(*) as count FROM product WHERE deleted_at IS NULL`;
        const countParams: string[] = [];
        let countParamIndex = 1;
        
        if (handle) {
            countQuery += ` AND handle = $${countParamIndex}`;
            countParams.push(handle);
            countParamIndex++;
        }
        if (search) {
            countQuery += ` AND (title ILIKE $${countParamIndex} OR description ILIKE $${countParamIndex})`;
            countParams.push(`%${search}%`);
        }
        
        const countResult = await client.query<{ count: string }>(countQuery, countParams);
        const count = parseInt(countResult.rows[0]?.count || "0", 10);
        
        // Transform to MedusaProduct format
        const transformedProducts: MedusaProduct[] = products.map(product => ({
            id: product.id,
            handle: product.handle,
            title: product.title,
            description: product.description,
            thumbnail: product.thumbnail,
            created_at: product.created_at.toISOString(),
            updated_at: product.updated_at.toISOString(),
            metadata: product.metadata || undefined,
            images: images
                .filter(img => img.product_id === product.id)
                .sort((a, b) => a.rank - b.rank)
                .map(img => ({ id: img.id, url: img.url })),
            variants: variants
                .filter(v => v.product_id === product.id)
                .map(v => ({
                    id: v.id,
                    title: v.title,
                    sku: v.sku,
                    inventory_quantity: v.inventory_quantity ?? undefined,
                    prices: v.prices.map(p => ({
                        id: p.id,
                        amount: p.amount,
                        currency_code: p.currency_code,
                    })),
                    options: v.options.map(o => ({
                        id: o.id,
                        value: o.value,
                        option_id: o.option_id,
                    })),
                })),
            options: options
                .filter(opt => opt.product_id === product.id)
                .map(opt => ({
                    id: opt.id,
                    title: opt.title,
                    values: opt.values.map(val => ({ id: val.id, value: val.value })),
                })),
            categories: categories
                .filter(cat => cat.product_id === product.id)
                .map(cat => ({ id: cat.category_id, name: cat.name, handle: cat.handle })),
        }));
        
        return { products: transformedProducts, count, offset, limit };
        
    } finally {
        if (client) {
            await client.end();
        }
    }
}

/**
 * Fetch a single product by handle
 */
export async function getProductByHandleFromDB(
    context: CloudflareContext,
    handle: string
): Promise<MedusaProduct | null> {
    const result = await getProductsFromDB(context, { handle, limit: 1 });
    return result.products[0] || null;
}

/**
 * Fetch a single product by ID
 */
export async function getProductByIdFromDB(
    context: CloudflareContext,
    id: string
): Promise<MedusaProduct | null> {
    let client: Client | null = null;
    
    try {
        client = await getClient(context);
        
        const productResult = await client.query<ProductRow>(
            `SELECT id, handle, title, description, thumbnail, created_at, updated_at, metadata
             FROM product WHERE id = $1 AND deleted_at IS NULL`,
            [id]
        );
        
        if (productResult.rows.length === 0) {
            return null;
        }
        
        const product = productResult.rows[0];
        const productIds = [product.id];
        
        const [variants, images, options, categories] = await Promise.all([
            fetchVariantsWithPrices(client, productIds),
            fetchImages(client, productIds),
            fetchOptionsWithValues(client, productIds),
            fetchCategories(client, productIds),
        ]);
        
        return {
            id: product.id,
            handle: product.handle,
            title: product.title,
            description: product.description,
            thumbnail: product.thumbnail,
            created_at: product.created_at.toISOString(),
            updated_at: product.updated_at.toISOString(),
            metadata: product.metadata || undefined,
            images: images.sort((a, b) => a.rank - b.rank).map(img => ({ id: img.id, url: img.url })),
            variants: variants.map(v => ({
                id: v.id,
                title: v.title,
                sku: v.sku,
                inventory_quantity: v.inventory_quantity ?? undefined,
                prices: v.prices.map(p => ({ id: p.id, amount: p.amount, currency_code: p.currency_code })),
                options: v.options.map(o => ({ id: o.id, value: o.value, option_id: o.option_id })),
            })),
            options: options.map(opt => ({
                id: opt.id,
                title: opt.title,
                values: opt.values.map(val => ({ id: val.id, value: val.value })),
            })),
            categories: categories.map(cat => ({ id: cat.category_id, name: cat.name, handle: cat.handle })),
        };
        
    } finally {
        if (client) {
            await client.end();
        }
    }
}

// Helper functions for fetching related data

interface VariantWithRelations extends VariantRow {
    prices: PriceRow[];
    options: VariantOptionRow[];
}

async function fetchVariantsWithPrices(
    client: Client,
    productIds: string[]
): Promise<VariantWithRelations[]> {
    if (productIds.length === 0) return [];
    
    const placeholders = productIds.map((_, i) => `$${i + 1}`).join(", ");
    
    // Fetch variants
    const variantResult = await client.query<VariantRow>(
        `SELECT id, product_id, title, sku, inventory_quantity
         FROM product_variant
         WHERE product_id IN (${placeholders}) AND deleted_at IS NULL`,
        productIds
    );
    
    if (variantResult.rows.length === 0) return [];
    
    const variantIds = variantResult.rows.map(v => v.id);
    const variantPlaceholders = variantIds.map((_, i) => `$${i + 1}`).join(", ");
    
    // Fetch prices and variant options in parallel
    const [priceResult, variantOptionResult] = await Promise.all([
        client.query<PriceRow>(
            `SELECT id, variant_id, amount, currency_code
             FROM product_variant_price
             WHERE variant_id IN (${variantPlaceholders}) AND deleted_at IS NULL`,
            variantIds
        ),
        client.query<VariantOptionRow>(
            `SELECT pvo.id, pvo.variant_id, pvo.option_value_id, 
                    pov.option_id, pov.value
             FROM product_variant_option pvo
             JOIN product_option_value pov ON pvo.option_value_id = pov.id
             WHERE pvo.variant_id IN (${variantPlaceholders})`,
            variantIds
        ),
    ]);
    
    // Group prices and options by variant
    return variantResult.rows.map(variant => ({
        ...variant,
        prices: priceResult.rows.filter(p => p.variant_id === variant.id),
        options: variantOptionResult.rows.filter(o => o.variant_id === variant.id),
    }));
}

async function fetchImages(client: Client, productIds: string[]): Promise<ImageRow[]> {
    if (productIds.length === 0) return [];
    
    const placeholders = productIds.map((_, i) => `$${i + 1}`).join(", ");
    const result = await client.query<ImageRow>(
        `SELECT id, product_id, url, rank
         FROM product_image
         WHERE product_id IN (${placeholders}) AND deleted_at IS NULL
         ORDER BY rank ASC`,
        productIds
    );
    
    return result.rows;
}

interface OptionWithValues extends OptionRow {
    values: OptionValueRow[];
}

async function fetchOptionsWithValues(
    client: Client,
    productIds: string[]
): Promise<OptionWithValues[]> {
    if (productIds.length === 0) return [];
    
    const placeholders = productIds.map((_, i) => `$${i + 1}`).join(", ");
    
    const optionResult = await client.query<OptionRow>(
        `SELECT id, product_id, title
         FROM product_option
         WHERE product_id IN (${placeholders}) AND deleted_at IS NULL`,
        productIds
    );
    
    if (optionResult.rows.length === 0) return [];
    
    const optionIds = optionResult.rows.map(o => o.id);
    const optionPlaceholders = optionIds.map((_, i) => `$${i + 1}`).join(", ");
    
    const valueResult = await client.query<OptionValueRow>(
        `SELECT id, option_id, value
         FROM product_option_value
         WHERE option_id IN (${optionPlaceholders}) AND deleted_at IS NULL`,
        optionIds
    );
    
    return optionResult.rows.map(option => ({
        ...option,
        values: valueResult.rows.filter(v => v.option_id === option.id),
    }));
}

async function fetchCategories(client: Client, productIds: string[]): Promise<CategoryRow[]> {
    if (productIds.length === 0) return [];
    
    const placeholders = productIds.map((_, i) => `$${i + 1}`).join(", ");
    
    const result = await client.query<CategoryRow>(
        `SELECT pc.product_id, pc.product_category_id as category_id,
                c.name, c.handle
         FROM product_category_product pc
         JOIN product_category c ON pc.product_category_id = c.id
         WHERE pc.product_id IN (${placeholders}) AND c.deleted_at IS NULL`,
        productIds
    );
    
    return result.rows;
}

/**
 * Check if Hyperdrive is available in the current context
 */
export function isHyperdriveAvailable(context: CloudflareContext): boolean {
    return !!(
        context?.cloudflare?.env?.HYPERDRIVE?.connectionString ||
        context?.cloudflare?.env?.DATABASE_URL ||
        process.env.DATABASE_URL
    );
}

