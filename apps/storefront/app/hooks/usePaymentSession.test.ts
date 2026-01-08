// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { usePaymentSession } from './usePaymentSession';

// Mock monitored-fetch
const mockFetch = vi.fn();
vi.mock('../utils/monitored-fetch', () => ({
    monitoredFetch: (...args: unknown[]) => mockFetch(...args),
}));

const mockShippingOption = {
    id: 'so_123',
    name: 'Standard Shipping',
    amount: 1000,
    price_type: 'flat_rate' as const,
    displayName: 'Standard Shipping - $10.00'
};

const mockPaymentSessionResponse = {
    payment_collection: {
        payment_sessions: [
            {
                id: 'ps_123',
                provider_id: 'pp_stripe',
                data: {
                    client_secret: 'pi_test_secret_abc123',
                    id: 'pi_test123',
                },
            },
        ],
    },
};

describe('usePaymentSession', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Default success response
        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => mockPaymentSessionResponse,
        });
    });

    it('should initialize with default state', () => {
        const { result } = renderHook(() => 
            usePaymentSession(null, 0, null, 'usd')
        );
        
        expect(result.current.clientSecret).toBeNull();
        expect(result.current.paymentIntentId).toBeNull();
        expect(result.current.isLoading).toBe(false);
        expect(result.current.error).toBeNull();
    });

    it('should not create session if paymentCollectionId is null', async () => {
        renderHook(() => usePaymentSession(null, 5000, mockShippingOption, 'usd'));
        
        await new Promise(r => setTimeout(r, 500));

        expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should not create session if cart total is zero', async () => {
        renderHook(() => usePaymentSession('paycol_123', 0, mockShippingOption, 'usd'));
        
        await new Promise(r => setTimeout(r, 500));

        expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should create payment session when all params are valid', async () => {
        const { result } = renderHook(() => 
            usePaymentSession('paycol_123', 5000, mockShippingOption, 'usd')
        );

        await waitFor(() => {
            expect(mockFetch).toHaveBeenCalledWith(
                '/api/payment-collections/paycol_123/sessions',
                expect.objectContaining({
                    method: 'POST',
                    body: JSON.stringify({ provider_id: 'pp_stripe' }),
                })
            );
        });

        await waitFor(() => {
            expect(result.current.clientSecret).toBe('pi_test_secret_abc123');
            expect(result.current.paymentIntentId).toBe('pi_test123');
            expect(result.current.isLoading).toBe(false);
            expect(result.current.error).toBeNull();
        });
    });

    it('should handle API failure gracefully', async () => {
        mockFetch.mockResolvedValue({
            ok: false,
            json: async () => ({ error: 'Payment collection not found' }),
        });

        const { result } = renderHook(() => 
            usePaymentSession('paycol_invalid', 5000, mockShippingOption, 'usd')
        );

        await waitFor(() => {
            expect(result.current.clientSecret).toBeNull();
            expect(result.current.error).toBe('Payment collection not found');
        });
    });

    it('should handle missing stripe session in response', async () => {
        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({
                payment_collection: {
                    payment_sessions: [
                        { id: 'ps_other', provider_id: 'pp_paypal', data: {} },
                    ],
                },
            }),
        });

        const { result } = renderHook(() => 
            usePaymentSession('paycol_123', 5000, mockShippingOption, 'usd')
        );

        await waitFor(() => {
            expect(result.current.error).toBe('Stripe payment session not found in response');
        });
    });

    it('should handle missing client_secret in stripe session', async () => {
        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({
                payment_collection: {
                    payment_sessions: [
                        { id: 'ps_123', provider_id: 'pp_stripe', data: {} },
                    ],
                },
            }),
        });

        const { result } = renderHook(() => 
            usePaymentSession('paycol_123', 5000, mockShippingOption, 'usd')
        );

        await waitFor(() => {
            expect(result.current.error).toBe('Client secret not found in payment session data');
        });
    });

    it('should handle network errors', async () => {
        mockFetch.mockRejectedValue(new Error('Network error'));

        const { result } = renderHook(() => 
            usePaymentSession('paycol_123', 5000, mockShippingOption, 'usd')
        );

        await waitFor(() => {
            expect(result.current.error).toBe('Network error');
            expect(result.current.clientSecret).toBeNull();
        });
    });
});
