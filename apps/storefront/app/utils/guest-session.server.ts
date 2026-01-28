/**
 * Guest Session Cookie Utilities
 *
 * Cloudflare Workers-compatible cookie management for guest order access.
 * Uses raw cookie strings (not react-router's createCookie which JSON-encodes).
 *
 * Cookie Pattern: `guest_order_{orderId}` - scoped per order for multi-order support.
 *
 * IMPORTANT: We don't use react-router's createCookie because it JSON-serializes
 * the value, which corrupts JWT tokens by wrapping them in quotes.
 *
 * @see Story 4-3: Session Persistence
 */

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
 * Get cookie name for an order
 */
function getCookieName(orderId: string): string {
    return `guest_order_${orderId}`;
}

/**
 * Parse cookies from Cookie header string
 */
function parseCookies(cookieHeader: string | null): Record<string, string> {
    if (!cookieHeader) return {};

    const cookies: Record<string, string> = {};
    for (const pair of cookieHeader.split(';')) {
        const [name, ...valueParts] = pair.trim().split('=');
        if (name) {
            cookies[name] = valueParts.join('='); // Handle values with = in them
        }
    }
    return cookies;
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
    const cookieName = getCookieName(orderId);

    // 1. Check cookie FIRST (try both "Cookie" and "cookie" for compatibility)
    const cookieHeader = request.headers.get("Cookie") || request.headers.get("cookie");
    const cookies = parseCookies(cookieHeader);
    const cookieToken = cookies[cookieName];

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
 * Cookie is scoped to all order-related routes (status, edit).
 * Path is `/order` to support:
 * - /order/status/{id} - Order status page
 * - /order/{id}/edit - Order edit page
 *
 * SEC-06: SameSite=Lax is required for cross-site redirect flow.
 * When Stripe redirects back to our site after payment, browsers treat this as a
 * cross-site navigation. SameSite=Strict would prevent the cookie from being sent
 * on the subsequent redirect to the order status page. SameSite=Lax allows the
 * cookie to be sent on top-level navigations, which is safe for this use case.
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
    const cookieName = getCookieName(orderId);
    const isSecure = typeof import.meta !== 'undefined' && import.meta.env?.PROD;

    const parts = [
        `${cookieName}=${token}`,
        `Path=/order`,
        `Max-Age=${maxAge}`,
        `SameSite=Lax`,
        `HttpOnly`,
    ];

    if (isSecure) {
        parts.push('Secure');
    }

    return parts.join('; ');
}

/**
 * Create Clear-Cookie header string to remove guest token.
 * Used when token is invalid/expired (401/403 from backend).
 *
 * @param orderId - The order ID to clear
 * @returns Set-Cookie header string with maxAge=0
 */
export async function clearGuestToken(orderId: string): Promise<string> {
    const cookieName = getCookieName(orderId);

    return [
        `${cookieName}=`,
        `Path=/order`,
        `Max-Age=0`,
        `SameSite=Lax`,
        `HttpOnly`,
    ].join('; ');
}

// Export for testing
export { decodeJwtPayload, calculateMaxAge };
