
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { action } from './api.payment-collections';
import { type ActionFunctionArgs } from 'react-router';

// Mock imports
vi.mock('../utils/monitored-fetch', () => ({
    monitoredFetch: vi.fn(),
}));

vi.mock('../lib/logger', () => ({
    createLogger: () => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    }),
    getTraceIdFromRequest: () => 'test-trace-id',
}));

import { monitoredFetch } from '../utils/monitored-fetch';

describe('Payment Collections API', () => {
    const fetchSpy = monitoredFetch as unknown as ReturnType<typeof vi.fn>;

    const mockContext = {
        cloudflare: {
            env: {
                MEDUSA_BACKEND_URL: 'http://localhost:9000',
                MEDUSA_PUBLISHABLE_KEY: 'pk_test_123',
            },
        },
    };

    const unwrap = async (response: Response | { status: number, json: () => Promise<any> }) => {
        if ('json' in response) {
            return {
                status: response.status,
                data: await response.json(),
            };
        }
        // Handle React Router "data" response
        return {
            status: (response as any).init?.status || 200,
            data: await (response as any).data,
        };
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should create payment collection for valid cartId', async () => {
        const cartId = 'cart_01HTEST1234567890';
        const paymentCollectionId = 'pay_col_123';

        // First call: Idempotency check GET (no existing collection)
        fetchSpy.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                payment_collections: []
            })
        });

        // Second call: POST to create new collection
        fetchSpy.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                payment_collection: {
                    id: paymentCollectionId,
                    cart_id: cartId,
                    amount: 5000,
                    payment_sessions: [
                        { id: 'ps_123', provider_id: 'pp_stripe' }
                    ]
                }
            })
        });

        const request = new Request('http://localhost:3000/api/payment-collections', {
            method: 'POST',
            body: JSON.stringify({ cartId }),
        });

        const response: any = await action({ request, context: mockContext, params: {} } as any);
        const { data, status } = await unwrap(response);

        expect(status).toBe(200);
        expect(data.payment_collection.id).toBe(paymentCollectionId);

        // Verify both calls were made (idempotency check GET, then POST)
        // Verify both calls were made (idempotency check GET, then POST)
        expect(fetchSpy).toHaveBeenCalledTimes(2);

        // 1st call inspection
        const [firstUrl, firstOptions] = fetchSpy.mock.calls[0];
        expect(firstUrl).toBe(`http://localhost:9000/store/payment-collections?cart_id=${cartId}`);
        expect(firstOptions.method).toBe('GET');
        // medusaFetch adds cloudflareEnv
        expect(firstOptions.cloudflareEnv).toEqual(mockContext.cloudflare.env);

        // 2nd call inspection
        const [secondUrl, secondOptions] = fetchSpy.mock.calls[1];
        expect(secondUrl).toBe('http://localhost:9000/store/payment-collections');
        expect(secondOptions.method).toBe('POST');
        expect(secondOptions.body).toBe(JSON.stringify({ cart_id: cartId }));
        expect(secondOptions.cloudflareEnv).toEqual(mockContext.cloudflare.env);

        // Verify headers (it's a Headers object now)
        const headers = secondOptions.headers as Headers;
        expect(headers).toBeInstanceOf(Headers);
        expect(headers.get('x-publishable-api-key')).toBe('pk_test_123');
    });

    it('should return 400 if cartId is missing', async () => {
        const request = new Request('http://localhost:3000/api/payment-collections', {
            method: 'POST',
            body: JSON.stringify({}),
        });

        const response: any = await action({ request, context: mockContext, params: {} } as any);
        const { data, status } = await unwrap(response);

        expect(status).toBe(400);
        expect(data.error).toContain('Cart ID is required');
    });

    it('should handle Medusa 404 errors (cart not found)', async () => {
        // First call: Idempotency check GET (no existing collection)
        fetchSpy.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                payment_collections: []
            })
        });

        // Second call: POST returns 404
        fetchSpy.mockResolvedValueOnce({
            ok: false,
            status: 404,
            statusText: 'Not Found',
            text: async () => 'Cart not found'
        });

        const request = new Request('http://localhost:3000/api/payment-collections', {
            method: 'POST',
            body: JSON.stringify({ cartId: 'cart_01HINVALID12345' }),
        });

        const response: any = await action({ request, context: mockContext, params: {} } as any);
        const { data, status } = await unwrap(response);

        expect(status).toBe(404);
        expect(data.error).toBe('Cart not found');
    });

    it('should handle payment collection already exists (409) by returning existing collection', async () => {
        const cartId = 'cart_01HTEST1234567890';
        const existingCollectionId = 'pay_col_EXISTING123';
        
        // First call: Idempotency check GET (no existing collection found initially)
        fetchSpy.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                payment_collections: []
            })
        });

        // Second call: POST returns 409 (conflict - race condition, another request created it)
        fetchSpy.mockResolvedValueOnce({
            ok: false,
            status: 409,
            statusText: 'Conflict',
            text: async () => 'Payment collection already exists'
        });
        
        // Third call: Fallback GET to fetch existing collection after 409
        fetchSpy.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                payment_collections: [{
                    id: existingCollectionId,
                    cart_id: cartId,
                    amount: 5000,
                    payment_sessions: [
                        { id: 'ps_existing', provider_id: 'pp_stripe' }
                    ]
                }]
            })
        });

        const request = new Request('http://localhost:3000/api/payment-collections', {
            method: 'POST',
            body: JSON.stringify({ cartId }),
        });

        const response: any = await action({ request, context: mockContext, params: {} } as any);
        const { data, status } = await unwrap(response);

        expect(status).toBe(200);
        expect(data.payment_collection.id).toBe(existingCollectionId);
        
        // Verify all three calls were made
        // Verify all three calls were made
        expect(fetchSpy).toHaveBeenCalledTimes(3);

        // 1. Initial GET
        const [url1, opt1] = fetchSpy.mock.calls[0];
        expect(url1).toBe(`http://localhost:9000/store/payment-collections?cart_id=${cartId}`);
        expect(opt1.method).toBe('GET');

        // 2. POST (failed with 409)
        const [url2, opt2] = fetchSpy.mock.calls[1];
        expect(url2).toBe('http://localhost:9000/store/payment-collections');
        expect(opt2.method).toBe('POST');
        const headers2 = opt2.headers as Headers;
        expect(headers2.get('x-publishable-api-key')).toBe('pk_test_123');

        // 3. Retry GET
        const [url3, opt3] = fetchSpy.mock.calls[2];
        expect(url3).toBe(`http://localhost:9000/store/payment-collections?cart_id=${cartId}`);
        expect(opt3.method).toBe('GET');
        // Check header on GET too (medusaFetch always adds it)
        const headers3 = opt3.headers as Headers;
        expect(headers3).toBeInstanceOf(Headers);
        expect(headers3.get('x-publishable-api-key')).toBe('pk_test_123');
    });

    it('should return 400 for invalid cartId format', async () => {
        const request = new Request('http://localhost:3000/api/payment-collections', {
            method: 'POST',
            body: JSON.stringify({ cartId: 'invalid_id' }),
        });

        const response: any = await action({ request, context: mockContext, params: {} } as any);
        const { data, status } = await unwrap(response);

        expect(status).toBe(400);
        expect(data.error).toBe('Invalid cart ID format');
    });

    it('should return 400 for non-string cartId', async () => {
        const request = new Request('http://localhost:3000/api/payment-collections', {
            method: 'POST',
            body: JSON.stringify({ cartId: 12345 }),
        });

        const response: any = await action({ request, context: mockContext, params: {} } as any);
        const { data, status } = await unwrap(response);

        expect(status).toBe(400);
        expect(data.error).toContain('Cart ID is required');
    });
});
