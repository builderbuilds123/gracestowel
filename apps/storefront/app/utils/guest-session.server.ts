/**
 * Guest Session Cookie Utilities
 * 
 * Cloudflare Workers-compatible cookie management for guest order access.
 * Uses react-router's createCookie (Web API only, no Node.js crypto).
 * 
 * Cookie Pattern: `guest_order_{orderId}` - scoped per order for multi-order support.
 * 
 * @see Story 4-3: Session Persistence
 */

import { createCookie } from "react-router";

/**
 * Decode JWT payload without verification (for reading exp claim only).
 * JWTs are base64url encoded: header.payload.signature
 */
function decodeJwtPayload(token: string): { exp?: number; order_id?: string } | null {
    try {
        const parts = token.split('.');
        if (parts.length !== 3) return null;
        
        // Decode payload (second part)
        const payload = parts[1];
        // Convert base64url to base64
        const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
        // Decode
        const jsonString = atob(base64);
        return JSON.parse(jsonString);
    } catch {
        return null;
    }
}

/**
 * Calculate remaining TTL from JWT exp claim
 */
function calculateMaxAge(token: string): number {
    const payload = decodeJwtPayload(token);
    if (!payload?.exp) {
        // Fallback: 1 hour if no exp claim
        return 3600;
    }
    
    const now = Math.floor(Date.now() / 1000);
    const remaining = payload.exp - now;
    
    // Return at least 0 (don't set negative maxAge)
    return Math.max(0, remaining);
}

/**
 * Create a cookie instance for a specific order.
 * Cookie is scoped to all order-related routes (status, edit).
 *
 * Path changed from `/order/status/${orderId}` to `/order` to support:
 * - /order/status/{id} - Order status page
 * - /order/{id}/edit - Order edit page (new dedicated route)
 */
function createGuestCookie(orderId: string, maxAge: number) {
    return createCookie(`guest_order_${orderId}`, {
        httpOnly: true,
        secure: import.meta.env.PROD,
        sameSite: "strict",
        maxAge,
        path: `/order`,
    });
}

/**
 * Get guest token from request.
 * Checks cookie FIRST, falls back to URL query param.
 * 
 * @param request - The incoming request
 * @param orderId - The order ID to scope the cookie
 * @returns The token string or null if not found
 */
export async function getGuestToken(
    request: Request,
    orderId: string
): Promise<{ token: string | null; source: 'cookie' | 'url' | null }> {
    // 1. Check cookie FIRST
    const cookie = createGuestCookie(orderId, 3600); // maxAge placeholder for parsing
    const cookieHeader = request.headers.get("Cookie");
    const cookieToken = await cookie.parse(cookieHeader);
    
    if (cookieToken) {
        const payload = decodeJwtPayload(cookieToken);
        if (payload?.order_id === orderId) {
            return { token: cookieToken, source: 'cookie' };
        }
        // Mismatched token in cookie - ignore it
    }
    
    // 2. Fallback to URL query param
    const url = new URL(request.url);
    const urlToken = url.searchParams.get("token");
    
    if (urlToken) {
        const payload = decodeJwtPayload(urlToken);
        if (payload?.order_id === orderId) {
            return { token: urlToken, source: 'url' };
        }
        // Mismatched token in URL - ignore it
    }
    
    return { token: null, source: null };
}

/**
 * Create Set-Cookie header string for storing guest token.
 * Calculates maxAge dynamically from JWT exp claim.
 * 
 * @param token - The JWT token to store
 * @param orderId - The order ID to scope the cookie
 * @returns Set-Cookie header string
 */
export async function setGuestToken(
    token: string,
    orderId: string
): Promise<string> {
    const maxAge = calculateMaxAge(token);
    const cookie = createGuestCookie(orderId, maxAge);
    return await cookie.serialize(token);
}

/**
 * Create Clear-Cookie header string to remove guest token.
 * Used when token is invalid/expired (401/403 from backend).
 * 
 * @param orderId - The order ID to clear
 * @returns Set-Cookie header string with maxAge=0
 */
export async function clearGuestToken(orderId: string): Promise<string> {
    const cookie = createGuestCookie(orderId, 0);
    return await cookie.serialize("", { maxAge: 0 });
}

// Export for testing
export { decodeJwtPayload, calculateMaxAge };
