// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { usePaymentCollection } from './usePaymentCollection';

// Mock monitored-fetch
const mockFetch = vi.fn();
vi.mock('../utils/monitored-fetch', () => ({
    monitoredFetch: (...args: unknown[]) => mockFetch(...args),
}));

describe('usePaymentCollection', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Default success response
        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({ payment_collection: { id: 'pay_col_123' } }),
        });
    });

    it('should initialize with default state', () => {
        const { result } = renderHook(() => usePaymentCollection(undefined, false));
        
        expect(result.current.paymentCollectionId).toBeNull();
        expect(result.current.isCreating).toBe(false);
        expect(result.current.error).toBeNull();
    });

    it('should not create collection if cartId is undefined', async () => {
        renderHook(() => usePaymentCollection(undefined, true));
        
        // Wait a bit to ensure no calls are made
        await new Promise(r => setTimeout(r, 200));

        expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should not create collection if cart is not synced', async () => {
        renderHook(() => usePaymentCollection('cart_123', false));
        
        await new Promise(r => setTimeout(r, 200));

        expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should create payment collection when cartId and sync are valid', async () => {
        const { result } = renderHook(() => usePaymentCollection('cart_123', true));

        await waitFor(() => {
            expect(mockFetch).toHaveBeenCalledWith(
                '/api/payment-collections',
                expect.objectContaining({
                    method: 'POST',
                    body: JSON.stringify({ cartId: 'cart_123' }),
                })
            );
        });

        await waitFor(() => {
            expect(result.current.paymentCollectionId).toBe('pay_col_123');
            expect(result.current.isCreating).toBe(false);
            expect(result.current.error).toBeNull();
        });
    });

    it('should handle API failure gracefully', async () => {
        mockFetch.mockResolvedValue({
            ok: false,
            headers: { get: () => 'application/json' },
            json: async () => ({ error: 'Cart not found' }),
        });

        const { result } = renderHook(() => usePaymentCollection('cart_123', true));

        await waitFor(() => {
            expect(result.current.paymentCollectionId).toBeNull();
            expect(result.current.error).toBe('Cart not found');
        });
    });

    it('should not create duplicate collections for same cart', async () => {
        const { result, rerender } = renderHook(
            ({ cartId, synced }) => usePaymentCollection(cartId, synced),
            { initialProps: { cartId: 'cart_123', synced: true } }
        );

        await waitFor(() => {
            expect(result.current.paymentCollectionId).toBe('pay_col_123');
        });

        expect(mockFetch).toHaveBeenCalledTimes(1);

        // Re-render with same cartId - should not create again
        rerender({ cartId: 'cart_123', synced: true });
        
        await new Promise(r => setTimeout(r, 200));

        expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should reset state when cartId changes to a new cart', async () => {
        const { result, rerender } = renderHook(
            ({ cartId, synced }) => usePaymentCollection(cartId, synced),
            { initialProps: { cartId: 'cart_123', synced: true } }
        );

        await waitFor(() => {
            expect(result.current.paymentCollectionId).toBe('pay_col_123');
        });

        // Change to different cart
        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({ payment_collection: { id: 'pay_col_456' } }),
        });

        rerender({ cartId: 'cart_456', synced: true });

        // Should eventually get new collection
        await waitFor(() => {
            expect(result.current.paymentCollectionId).toBe('pay_col_456');
        });
    });

    it('should handle network errors', async () => {
        mockFetch.mockRejectedValue(new Error('Network error'));

        const { result } = renderHook(() => usePaymentCollection('cart_123', true));

        await waitFor(() => {
            expect(result.current.error).toBe('Network error');
            expect(result.current.paymentCollectionId).toBeNull();
        });
    });
});
