/**
 * Medusa API Fetch Utility
 * 
 * A dedicated fetch wrapper for Medusa Store API endpoints that automatically
 * includes the required `x-publishable-api-key` header.
 * 
 * Use this instead of raw `monitoredFetch` for any custom Medusa endpoints
 * that are not covered by the official @medusajs/js-sdk.
 * 
 * @example
 * // Server-side (in a loader)
 * const response = await medusaFetch('/store/products/abc/reviews', { context });
 * 
 * // Client-side
 * const response = await medusaFetch('/store/products/abc/reviews');
 */

import { monitoredFetch, type MonitoredFetchOptions } from '../utils/monitored-fetch';

interface MedusaFetchContext {
    cloudflare?: {
        env?: {
            MEDUSA_BACKEND_URL?: string;
            MEDUSA_PUBLISHABLE_KEY?: string;
        };
    };
}

interface MedusaFetchOptions extends Omit<MonitoredFetchOptions, 'cloudflareEnv'> {
    /** Pass the route context for server-side calls */
    context?: MedusaFetchContext;
}

/**
 * Gets the Medusa backend URL from the available sources
 */
function getBackendUrl(context?: MedusaFetchContext): string {
    // 1. Cloudflare context (server-side)
    if (context?.cloudflare?.env?.MEDUSA_BACKEND_URL) {
        return context.cloudflare.env.MEDUSA_BACKEND_URL;
    }

    // 2. Browser window.ENV (client-side hydration)
    if (typeof window !== 'undefined') {
        const envUrl = (window as any).ENV?.MEDUSA_BACKEND_URL;
        if (envUrl) return envUrl;
    }

    // 3. Build-time fallback
    return process.env.VITE_MEDUSA_BACKEND_URL || 'http://localhost:9000';
}

/**
 * Gets the Medusa publishable key from the available sources
 */
function getPublishableKey(context?: MedusaFetchContext): string | undefined {
    // 1. Cloudflare context (server-side)
    if (context?.cloudflare?.env?.MEDUSA_PUBLISHABLE_KEY) {
        return context.cloudflare.env.MEDUSA_PUBLISHABLE_KEY;
    }

    // 2. Browser window.ENV (client-side hydration)
    if (typeof window !== 'undefined') {
        const envKey = (window as any).ENV?.MEDUSA_PUBLISHABLE_KEY;
        if (envKey) return envKey;
    }

    // 3. Build-time fallback
    return process.env.MEDUSA_PUBLISHABLE_KEY;
}

/**
 * Fetch wrapper for Medusa Store API endpoints.
 * 
 * Automatically:
 * - Resolves the Medusa backend URL
 * - Injects the `x-publishable-api-key` header
 * - Passes through to `monitoredFetch` for analytics
 * 
 * @param path - The API path (e.g., '/store/products/abc/reviews')
 * @param options - Fetch options including optional context
 * @returns The fetch Response
 */
export async function medusaFetch(
    path: string,
    options: MedusaFetchOptions = {}
): Promise<Response> {
    const { context, ...fetchOptions } = options;
    
    const backendUrl = getBackendUrl(context);
    const publishableKey = getPublishableKey(context);
    
    // Construct full URL
    const url = path.startsWith('http') ? path : `${backendUrl}${path}`;
    
    // Build headers with publishable key
    const headers = new Headers(fetchOptions.headers || {});
    
    if (publishableKey && !headers.has('x-publishable-api-key')) {
        headers.set('x-publishable-api-key', publishableKey);
    }
    
    // Pass through to monitoredFetch
    return monitoredFetch(url, {
        ...fetchOptions,
        headers,
        cloudflareEnv: context?.cloudflare?.env,
    });
}

/**
 * GET request helper for Medusa API
 */
export async function medusaGet(
    path: string,
    options: Omit<MedusaFetchOptions, 'method'> = {}
): Promise<Response> {
    return medusaFetch(path, { ...options, method: 'GET' });
}

/**
 * POST request helper for Medusa API
 */
export async function medusaPost(
    path: string,
    body: unknown,
    options: Omit<MedusaFetchOptions, 'method' | 'body'> = {}
): Promise<Response> {
    const headers = new Headers(options.headers || {});
    if (!headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
    }
    
    return medusaFetch(path, {
        ...options,
        method: 'POST',
        headers,
        body: JSON.stringify(body),
    });
}

export default medusaFetch;
