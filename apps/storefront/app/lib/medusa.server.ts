/**
 * Server-side Medusa API client for use in route loaders
 * This module provides typed functions to fetch data from Medusa v2 Store API
 */

// Re-export client-safe types and helpers
export * from "./medusa";

import type { MedusaProduct, MedusaProductsResponse, MedusaProductResponse } from "./medusa";

interface MedusaClientConfig {
    baseUrl: string;
}

/**
 * Create a Medusa client for server-side use
 */
export function createMedusaClient(config: MedusaClientConfig) {
    const { baseUrl } = config;

    async function fetchFromMedusa<T>(
        endpoint: string,
        options: RequestInit = {}
    ): Promise<T> {
        const url = `${baseUrl}${endpoint}`;
        
        const response = await fetch(url, {
            ...options,
            headers: {
                "Content-Type": "application/json",
                "x-publishable-api-key": "", // Add if using publishable API keys
                ...options.headers,
            },
        });

        if (!response.ok) {
            throw new Error(
                `Medusa API error: ${response.status} ${response.statusText}`
            );
        }

        return response.json();
    }

    return {
        /**
         * Fetch all products with optional filters
         */
        async getProducts(params?: {
            limit?: number;
            offset?: number;
            category_id?: string[];
            handle?: string;
            q?: string; // Search query
        }): Promise<MedusaProductsResponse> {
            const searchParams = new URLSearchParams();

            if (params?.limit) searchParams.set("limit", String(params.limit));
            if (params?.offset) searchParams.set("offset", String(params.offset));
            if (params?.handle) searchParams.set("handle", params.handle);
            if (params?.q) searchParams.set("q", params.q);
            if (params?.category_id) {
                params.category_id.forEach((id) =>
                    searchParams.append("category_id[]", id)
                );
            }

            // Request expanded fields for full product data including inventory
            searchParams.set("fields", "+variants,+variants.prices,+variants.inventory_quantity,+options,+options.values,+images,+categories,+metadata");

            const query = searchParams.toString();
            const endpoint = `/store/products${query ? `?${query}` : ""}`;

            return fetchFromMedusa<MedusaProductsResponse>(endpoint);
        },

        /**
         * Fetch a single product by handle
         */
        async getProductByHandle(handle: string): Promise<MedusaProduct | null> {
            const response = await this.getProducts({ handle, limit: 1 });
            return response.products[0] || null;
        },

        /**
         * Fetch a single product by ID
         */
        async getProductById(id: string): Promise<MedusaProduct> {
            const searchParams = new URLSearchParams();
            searchParams.set("fields", "+variants,+variants.prices,+variants.inventory_quantity,+options,+options.values,+images,+categories,+metadata");
            
            return fetchFromMedusa<MedusaProductResponse>(
                `/store/products/${id}?${searchParams.toString()}`
            ).then((res) => res.product);
        },
    };
}

/**
 * Get Medusa client with URL from environment/context
 * Supports both Cloudflare Workers context and Node.js environment
 */
export function getMedusaClient(context?: { cloudflare?: { env?: { MEDUSA_BACKEND_URL?: string } } }) {
    const baseUrl = context?.cloudflare?.env?.MEDUSA_BACKEND_URL ||
                    process.env.MEDUSA_BACKEND_URL ||
                    "http://localhost:9000";

    return createMedusaClient({ baseUrl });
}
