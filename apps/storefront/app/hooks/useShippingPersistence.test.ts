// @vitest-environment jsdom
import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useShippingPersistence } from './useShippingPersistence';

// Mock monitored-fetch
const mockFetch = vi.fn();
vi.mock('../utils/monitored-fetch', () => ({
    monitoredFetch: (...args: any[]) => mockFetch(...args),
}));

// Mock logger
vi.mock('../lib/logger', () => ({
    createLogger: () => ({
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
    }),
}));

const mockOption = {
    id: 'so_123',
    name: 'Standard Shipping',
    amount: 1000,
    price_type: 'flat_rate',
    displayName: 'Standard Shipping - $10.00'
};

describe('useShippingPersistence', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Default success response
        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({ cart: { id: 'cart_123', shipping_methods: [mockOption] } }),
        });
    });

    it('should initialize with default state', () => {
        const { result } = renderHook(() => useShippingPersistence({ cartId: 'cart_123' }));
        
        expect(result.current.isShippingPersisted).toBe(false);
        expect(result.current.shippingPersistError).toBeNull();
    });

    it('should successfully persist shipping option', async () => {
        const { result } = renderHook(() => useShippingPersistence({ cartId: 'cart_123', traceId: 'trace_abc' }));
        
        await act(async () => {
            await result.current.persistShippingOption(mockOption);
        });

        expect(mockFetch).toHaveBeenCalledWith(
            '/api/carts/cart_123/shipping-methods',
            expect.objectContaining({
                method: 'POST',
                body: JSON.stringify({ option_id: 'so_123' }),
            })
        );
        
        expect(result.current.isShippingPersisted).toBe(true);
        expect(result.current.shippingPersistError).toBeNull();
    });

    it('should handle API failure', async () => {
        mockFetch.mockResolvedValue({
            ok: false,
            json: async () => ({ error: 'Failed' }),
        });

        const { result } = renderHook(() => useShippingPersistence({ cartId: 'cart_123' }));
        
        await act(async () => {
            await result.current.persistShippingOption(mockOption);
        });

        expect(result.current.isShippingPersisted).toBe(false);
        expect(result.current.shippingPersistError).toContain('Shipping selection failed');
    });

    it('should handle CART_EXPIRED error specifically', async () => {
        mockFetch.mockResolvedValue({
            ok: false,
            json: async () => ({ error: 'Cart not found', code: 'CART_EXPIRED' }),
        });

        const { result } = renderHook(() => useShippingPersistence({ cartId: 'cart_123' }));
        
        await act(async () => {
            await result.current.persistShippingOption(mockOption);
        });

        expect(result.current.isShippingPersisted).toBe(false);
        expect(result.current.shippingPersistError).toContain('expired');
    });

    it('should skip persistence if already persisted (race condition check)', async () => {
        const { result } = renderHook(() => useShippingPersistence({ cartId: 'cart_123' }));
        
        // First call - success
        await act(async () => {
            await result.current.persistShippingOption(mockOption);
        });

        expect(mockFetch).toHaveBeenCalledTimes(1);

        // Second call with same option - should skip
        await act(async () => {
            await result.current.persistShippingOption(mockOption);
        });

        expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should skip if cartId is missing', async () => {
        const { result } = renderHook(() => useShippingPersistence({ cartId: undefined }));
        
        await act(async () => {
            await result.current.persistShippingOption(mockOption);
        });

        expect(mockFetch).not.toHaveBeenCalled();
    });
});
