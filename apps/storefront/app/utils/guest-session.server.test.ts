/**
 * Unit tests for guest session cookie utilities
 * @see Story 4-3: Session Persistence
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
    getGuestToken, 
    setGuestToken, 
    clearGuestToken,
    decodeJwtPayload,
    calculateMaxAge 
} from './guest-session.server';

// Mock react-router's createCookie
vi.mock('react-router', () => ({
    createCookie: vi.fn((name: string, options: any) => ({
        parse: vi.fn(async (cookieHeader: string | null) => {
            if (!cookieHeader) return null;
            // Simple mock: extract value for our cookie name
            const match = cookieHeader.match(new RegExp(`${name}=([^;]+)`));
            return match ? match[1] : null;
        }),
        serialize: vi.fn(async (value: string, serializeOptions?: any) => {
            const maxAge = serializeOptions?.maxAge ?? options.maxAge;
            return `${name}=${value}; Path=${options.path}; Max-Age=${maxAge}; HttpOnly; SameSite=Strict`;
        }),
    })),
}));

describe('Guest Session Cookie Utilities', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('decodeJwtPayload', () => {
        it('should decode valid JWT payload', () => {
            // JWT with payload: {"order_id":"order_123","exp":1702166400}
            // Header: {"alg":"HS256","typ":"JWT"}
            const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
            const payload = btoa(JSON.stringify({ order_id: 'order_123', exp: 1702166400 }));
            const token = `${header}.${payload}.fake_signature`;
            
            const result = decodeJwtPayload(token);
            
            expect(result).toEqual({ order_id: 'order_123', exp: 1702166400 });
        });

        it('should return null for invalid JWT format', () => {
            expect(decodeJwtPayload('invalid')).toBeNull();
            expect(decodeJwtPayload('only.two')).toBeNull();
            expect(decodeJwtPayload('')).toBeNull();
        });

        it('should handle base64url encoding (- and _)', () => {
            // Create payload with base64url characters
            const payload = { order_id: 'order_123', exp: 1702166400 };
            const base64 = btoa(JSON.stringify(payload));
            // Convert to base64url
            const base64url = base64.replace(/\+/g, '-').replace(/\//g, '_');
            const token = `header.${base64url}.signature`;
            
            const result = decodeJwtPayload(token);
            
            expect(result?.order_id).toBe('order_123');
        });
    });

    describe('calculateMaxAge', () => {
        it('should calculate remaining TTL from exp claim', () => {
            const futureExp = Math.floor(Date.now() / 1000) + 1800; // 30 minutes from now
            const payload = btoa(JSON.stringify({ exp: futureExp }));
            const token = `header.${payload}.signature`;
            
            const maxAge = calculateMaxAge(token);
            
            // Should be approximately 1800 seconds (allow 1 second tolerance)
            expect(maxAge).toBeGreaterThanOrEqual(1799);
            expect(maxAge).toBeLessThanOrEqual(1801);
        });

        it('should return 0 for expired token', () => {
            const pastExp = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
            const payload = btoa(JSON.stringify({ exp: pastExp }));
            const token = `header.${payload}.signature`;
            
            const maxAge = calculateMaxAge(token);
            
            expect(maxAge).toBe(0);
        });

        it('should return 3600 fallback if no exp claim', () => {
            const payload = btoa(JSON.stringify({ order_id: 'order_123' })); // No exp
            const token = `header.${payload}.signature`;
            
            const maxAge = calculateMaxAge(token);
            
            expect(maxAge).toBe(3600);
        });

        it('should return 3600 fallback for invalid token', () => {
            const maxAge = calculateMaxAge('invalid_token');
            
            expect(maxAge).toBe(3600);
        });
    });

    describe('getGuestToken', () => {
        it('should read token from cookie FIRST before URL', async () => {
            const cookieToken = createTestToken('order_123', 3600);
            const urlToken = createTestToken('order_123', 3600);
            const request = new Request(`https://example.com/order/status/order_123?token=${urlToken}`, {
                headers: { 'Cookie': `guest_order_order_123=${cookieToken}` }
            });
            
            const { token, source } = await getGuestToken(request, 'order_123');
            
            expect(token).toBe(cookieToken);
            expect(source).toBe('cookie');
        });

        it('should fallback to URL param if cookie missing', async () => {
            const urlToken = createTestToken('order_123', 3600);
            const request = new Request(`https://example.com/order/status/order_123?token=${urlToken}`, {
                headers: {} // No cookie
            });
            
            const { token, source } = await getGuestToken(request, 'order_123');
            
            expect(token).toBe(urlToken);
            expect(source).toBe('url');
        });

        it('should return null if no token in cookie or URL', async () => {
            const request = new Request('https://example.com/order/status/order_123', {
                headers: {}
            });
            
            const { token, source } = await getGuestToken(request, 'order_123');
            
            expect(token).toBeNull();
            expect(source).toBeNull();
        });
    });

    describe('setGuestToken', () => {
        it('should create cookie with correct name pattern', async () => {
            const token = createTestToken('order_456', 3600); // 1 hour from now
            
            const cookieHeader = await setGuestToken(token, 'order_456');
            
            expect(cookieHeader).toContain('guest_order_order_456=');
        });

        it('should scope cookie path to order status route', async () => {
            const token = createTestToken('order_789', 3600);
            
            const cookieHeader = await setGuestToken(token, 'order_789');
            
            expect(cookieHeader).toContain('Path=/order/status/order_789');
        });

        it('should set HttpOnly and SameSite=Strict', async () => {
            const token = createTestToken('order_123', 3600);
            
            const cookieHeader = await setGuestToken(token, 'order_123');
            
            expect(cookieHeader).toContain('HttpOnly');
            expect(cookieHeader).toContain('SameSite=Strict');
        });
    });

    describe('clearGuestToken', () => {
        it('should set Max-Age=0 to clear cookie', async () => {
            const cookieHeader = await clearGuestToken('order_123');
            
            expect(cookieHeader).toContain('Max-Age=0');
        });

        it('should use correct cookie name', async () => {
            const cookieHeader = await clearGuestToken('order_456');
            
            expect(cookieHeader).toContain('guest_order_order_456=');
        });
    });
});

// Helper to create test JWT tokens
function createTestToken(orderId: string, secondsFromNow: number): string {
    const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payload = btoa(JSON.stringify({ 
        order_id: orderId, 
        exp: Math.floor(Date.now() / 1000) + secondsFromNow 
    }));
    return `${header}.${payload}.fake_signature`;
}
