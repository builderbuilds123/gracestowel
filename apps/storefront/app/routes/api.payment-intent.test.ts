
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { action } from './api.payment-intent';
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

describe('Payment Intent API (SEC-01)', () => {
    const fetchSpy = monitoredFetch as unknown as ReturnType<typeof vi.fn>;

    const mockContext = {
        cloudflare: {
            env: {
                STRIPE_SECRET_KEY: 'sk_test_123',
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

    it('should ignore client-provided amount and use Medusa cart total (SEC-01)', async () => {
        const cartId = 'cart_123';
        const clientAmount = 10; // $10.00 provided by client (malicious)
        
        fetchSpy.mockImplementation((url: string) => {
             // 1. Fetch Cart (SEC-01)
            if (url.includes(`/store/carts/${cartId}`)) {
                return Promise.resolve({
                    ok: true,
                    json: async () => ({
                        cart: {
                            id: cartId,
                            total: 5000, // Cents (Medusa standard)
                            summary: {
                                current_order_total: 5000 // Cents
                            }
                        }
                    })
                });
            }
             // 2. Stripe call
            if (url.includes('api.stripe.com')) {
                return Promise.resolve({
                    ok: true,
                    json: async () => ({
                        id: 'pi_123',
                        client_secret: 'secret_123'
                    })
                });
            }
            return Promise.resolve({ ok: true, json: async () => ({}) });
        });

        const request = new Request('http://localhost:3000/api/payment-intent', {
            method: 'POST',
            body: JSON.stringify({
                amount: clientAmount,
                currency: 'usd',
                cartId: cartId,
                cartItems: []
            }),
        });

        await action({ request, context: mockContext as any, params: {} });

        // Verify Stripe call used correct amount (5000 cents)
        const stripeCall = fetchSpy.mock.calls.find((call: any[]) => call[0].includes('api.stripe.com'));
        expect(stripeCall).toBeDefined();

        if (stripeCall && stripeCall[1]) {
            const body = new URLSearchParams(stripeCall[1].body);
            expect(body.get('amount')).toBe('5000'); // 50.00 * 100
        }
    });

    it('should fail if cartId is missing (SEC-01 enforcement)', async () => {
        const request = new Request('http://localhost:3000/api/payment-intent', {
            method: 'POST',
            body: JSON.stringify({
                amount: 10,
                currency: 'usd',
                // No cartId
                cartItems: []
            }),
        });

        const response: any = await action({ request, context: mockContext as any, params: {} });
        const { data, status } = await unwrap(response);

        expect(status).toBe(400);
        expect(data.message).toContain('Cart ID is required');
    });
});
