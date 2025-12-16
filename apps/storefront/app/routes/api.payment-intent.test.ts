import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { action } from './api.payment-intent';

// Mock Cloudflare context
const mockContext = {
    cloudflare: {
        env: {
            STRIPE_SECRET_KEY: 'sk_test_mock',
            MEDUSA_BACKEND_URL: 'http://localhost:9000',
            MEDUSA_PUBLISHABLE_KEY: 'pk_test_mock',
        },
    },
};

// Helper to unwrap response (handles plain objects and DataWithResponseInit from react-router data())
async function unwrap(response: any) {
    if (response instanceof Response || typeof response.json === 'function') {
        return { data: await response.json(), status: response.status };
    }
    // Check for DataWithResponseInit-like structure (has .data and possibly .init)
    if (response && typeof response === 'object' && 'data' in response && 'init' in response) {
        return { 
            data: response.data, 
            status: response.init?.status || 200 
        };
    }
    // Default to plain object
    return { data: response, status: 200 };
}

describe('api.payment-intent action', () => {
    let fetchSpy: any;

    beforeEach(() => {
        fetchSpy = vi.spyOn(global, 'fetch');
        // Console error mock to keep output clean during expected error tests
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('creates a payment intent with capture_method: manual (Auth-Only)', async () => {
        // Mock successful stock check (variant found)
        fetchSpy.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                variant: { id: 'variant_123', inventory_quantity: 10 }
            }),
        });

        // Mock successful Stripe PaymentIntent creation
        fetchSpy.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ id: 'pi_123', client_secret: 'pi_123_secret_456' }),
        });

        const request = new Request('http://localhost:3000/api/payment-intent', {
            method: 'POST',
            body: JSON.stringify({
                amount: 10, // $10.00 in dollars (frontend sends dollars)
                currency: 'usd',
                cartItems: [{
                    id: 'item_1',
                    variantId: 'variant_123',
                    title: 'Test Towel',
                    price: '20.00',
                    quantity: 1
                }]
            }),
        });

        const response: any = await action({ request, context: mockContext as any, params: {} });
        const { data } = await unwrap(response);

        expect(data.clientSecret).toBe('pi_123_secret_456');
        expect(data.paymentIntentId).toBe('pi_123');
        expect(data.traceId).toBeDefined();

        // Verify Stripe call payload
        const stripeCall = fetchSpy.mock.calls[1];
        expect(stripeCall[0]).toBe('https://api.stripe.com/v1/payment_intents');

        const body = new URLSearchParams(stripeCall[1].body);
        expect(body.get('capture_method')).toBe('manual');
        // Stripe receives cents: $10.00 -> 1000 cents
        expect(body.get('amount')).toBe('1000');
    });

    it('returns 400 when items are out of stock', async () => {
        // Mock stock check returning low inventory
        fetchSpy.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                variant: { id: 'variant_123', inventory_quantity: 0 }
            }),
        });

        const request = new Request('http://localhost:3000/api/payment-intent', {
            method: 'POST',
            body: JSON.stringify({
                amount: 10, // $10.00 in dollars
                currency: 'usd',
                cartItems: [{
                    id: 'item_1',
                    variantId: 'variant_123',
                    title: 'Test Towel',
                    price: '20.00',
                    quantity: 1
                }]
            }),
        });

        const response: any = await action({ request, context: mockContext as any, params: {} });
        const { data, status } = await unwrap(response);

        expect(status).toBe(400);
        expect(data.message.toLowerCase()).toContain('out of stock');
        expect(data.traceId).toBeDefined();
        
        // Ensure Stripe was NOT called
        expect(fetchSpy).toHaveBeenCalledTimes(1); // Only stock check
    });

    it('returns 400 when variant is not found (404 from Medusa)', async () => {
        // Mock stock check returning 404 (variant deleted/not found)
        fetchSpy.mockResolvedValueOnce({
            ok: false,
            status: 404,
        });

        const request = new Request('http://localhost:3000/api/payment-intent', {
            method: 'POST',
            body: JSON.stringify({
                amount: 10, // $10.00 in dollars
                currency: 'usd',
                cartItems: [{
                    id: 'item_1',
                    variantId: 'variant_deleted',
                    title: 'Deleted Towel',
                    price: '20.00',
                    quantity: 1
                }]
            }),
        });

        const response: any = await action({ request, context: mockContext as any, params: {} });
        const { data, status } = await unwrap(response);

        expect(status).toBe(400);
        expect(data.message.toLowerCase()).toContain('out of stock');
        expect(data.traceId).toBeDefined();
        expect(data.outOfStockItems).toEqual([{
            title: 'Deleted Towel',
            requested: 1,
            available: 0,
        }]);

        // Ensure Stripe was NOT called
        expect(fetchSpy).toHaveBeenCalledTimes(1); // Only stock check
    });

    it('returns 405 for non-POST requests', async () => {
        const request = new Request('http://localhost:3000/api/payment-intent', {
            method: 'GET',
        });
        const response: any = await action({ request, context: mockContext as any, params: {} });
        const { status } = await unwrap(response);
        expect(status).toBe(405);
    });

    it('returns 500 when STRIPE_SECRET_KEY is not configured', async () => {
        const request = new Request('http://localhost:3000/api/payment-intent', {
            method: 'POST',
            body: JSON.stringify({ amount: 10, currency: 'usd' }), // $10.00 in dollars
        });
        const contextWithoutKey = { cloudflare: { env: {} } };
        const response: any = await action({ request, context: contextWithoutKey as any, params: {} });
        const { status } = await unwrap(response);
        expect(status).toBe(500);
    });

    it('returns 400 for invalid amount (zero or negative)', async () => {
        const request = new Request('http://localhost:3000/api/payment-intent', {
            method: 'POST',
            body: JSON.stringify({ amount: 0, currency: 'usd' }),
        });
        const response: any = await action({ request, context: mockContext as any, params: {} });
        const { data, status } = await unwrap(response);
        expect(status).toBe(400);
        expect(data.message).toContain('Invalid amount');
        expect(data.traceId).toBeDefined();
    });

    it('returns 400 for invalid currency code', async () => {
        const request = new Request('http://localhost:3000/api/payment-intent', {
            method: 'POST',
            body: JSON.stringify({ amount: 10, currency: 'INVALID' }),
        });
        const response: any = await action({ request, context: mockContext as any, params: {} });
        const { data, status } = await unwrap(response);
        expect(status).toBe(400);
        expect(data.message).toContain('Invalid currency');
        expect(data.traceId).toBeDefined();
    });

    it('returns detailed error info when Stripe API fails', async () => {
        // Mock successful stock check
        fetchSpy.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                variant: { id: 'variant_123', inventory_quantity: 10 }
            }),
        });

        // Mock Stripe API failure with detailed error
        fetchSpy.mockResolvedValueOnce({
            ok: false,
            status: 400,
            statusText: 'Bad Request',
            text: async () => JSON.stringify({
                error: {
                    type: 'invalid_request_error',
                    code: 'amount_too_small',
                    message: 'Amount must be at least $0.50 usd',
                    param: 'amount'
                }
            }),
        });

        const request = new Request('http://localhost:3000/api/payment-intent', {
            method: 'POST',
            body: JSON.stringify({
                amount: 10,
                currency: 'usd',
                cartItems: [{
                    id: 'item_1',
                    variantId: 'variant_123',
                    title: 'Test Towel',
                    price: '20.00',
                    quantity: 1
                }]
            }),
        });

        const response: any = await action({ request, context: mockContext as any, params: {} });
        const { data, status } = await unwrap(response);

        expect(status).toBe(500);
        expect(data.message).toBe('Payment initialization failed');
        expect(data.debugInfo).toContain('Amount must be at least $0.50 usd');
        expect(data.stripeErrorCode).toBe('amount_too_small');
        expect(data.traceId).toBeDefined();
    });
});
