import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { action } from './api.shipping-rates';

// Mock Cloudflare context
const mockContext = {
    cloudflare: {
        env: {
            MEDUSA_BACKEND_URL: 'http://localhost:9000',
            MEDUSA_PUBLISHABLE_KEY: 'pk_test_mock',
        },
    },
};

// Helper to unwrap response
async function unwrap(response: any) {
    if (response instanceof Response || typeof response.json === 'function') {
        return { data: await response.json(), status: response.status };
    }
    // Check for DataWithResponseInit-like structure
    if (response && typeof response === 'object' && 'data' in response && 'init' in response) {
        return { 
            data: response.data, 
            status: response.init?.status || 200 
        };
    }
    // Default to plain object (direct return from action)
    return { data: response, status: 200 };
}

describe('api.shipping-rates action', () => {
    let fetchSpy: any;

    beforeEach(() => {
        fetchSpy = vi.spyOn(global, 'fetch');
        // Console error mock to keep output clean during expected error tests
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns shipping options for the requested currency (CAD)', async () => {
        // Mock regions response
        fetchSpy.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                regions: [
                    { id: 'reg_us', currency_code: 'usd' },
                    { id: 'reg_ca', currency_code: 'cad' },
                ]
            }),
        });

        // Mock shipping options response
        fetchSpy.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                shipping_options: [
                    { id: 'so_1', name: 'Standard', amount: 1000 }, // $10.00
                    { id: 'so_2', name: 'Express', amount: 2000 },  // $20.00
                ]
            }),
        });

        const request = new Request('http://localhost:3000/api/shipping-rates', {
            method: 'POST',
            body: JSON.stringify({ currency: 'CAD' }),
        });

        const response: any = await action({ request, context: mockContext as any, params: {} });
        const { data } = await unwrap(response);

        // Verify we got options
        expect(data.shippingOptions).toHaveLength(2);
        expect(data.shippingOptions[0].id).toBe('so_1');
        
        // Verify region selection logic
        // The second call (options) should use reg_ca
        const optionsCall = fetchSpy.mock.calls[1];
        expect(optionsCall[0]).toContain('region_id=reg_ca');
    });

    it('falls back to first region if currency not found', async () => {
        // Mock regions response (only EUR available)
        fetchSpy.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                regions: [
                    { id: 'reg_eu', currency_code: 'eur' },
                ]
            }),
        });

        // Mock shipping options response
        fetchSpy.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                shipping_options: [
                    { id: 'so_eu', name: 'Euro Standard', amount: 500 },
                ]
            }),
        });

        const request = new Request('http://localhost:3000/api/shipping-rates', {
            method: 'POST',
            body: JSON.stringify({ currency: 'CAD' }), // Requesting CAD, but only EUR exists
        });

        const response: any = await action({ request, context: mockContext as any, params: {} });
        const { data } = await unwrap(response);

        expect(data.shippingOptions).toHaveLength(1);
        expect(data.shippingOptions[0].id).toBe('so_eu');

        // Verify fallback to first region
        const optionsCall = fetchSpy.mock.calls[1];
        expect(optionsCall[0]).toContain('region_id=reg_eu');
    });

    it('returns 500 when regions fetch fails', async () => {
        fetchSpy.mockResolvedValueOnce({
            ok: false,
            status: 500,
            statusText: 'Internal Server Error',
        });

        const request = new Request('http://localhost:3000/api/shipping-rates', {
            method: 'POST',
            body: JSON.stringify({ currency: 'CAD' }),
        });

        const response: any = await action({ request, context: mockContext as any, params: {} });
        const { data, status } = await unwrap(response);

        expect(status).toBe(500);
        expect(data.message).toBe("An error occurred while calculating shipping rates.");
    });

    it('returns 500 when no regions are found', async () => {
        fetchSpy.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ regions: [] }),
        });

        const request = new Request('http://localhost:3000/api/shipping-rates', {
            method: 'POST',
            body: JSON.stringify({ currency: 'CAD' }),
        });

        const response: any = await action({ request, context: mockContext as any, params: {} });
        const { data, status } = await unwrap(response);

        expect(status).toBe(500);
        expect(data.message).toBe("An error occurred while calculating shipping rates.");
    });

    it('returns 500 when shipping options fetch fails', async () => {
        // Mock regions success
        fetchSpy.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                regions: [{ id: 'reg_1', currency_code: 'cad' }]
            }),
        });

        // Mock options failure
        fetchSpy.mockResolvedValueOnce({
            ok: false,
            status: 502,
            statusText: 'Bad Gateway',
        });

        const request = new Request('http://localhost:3000/api/shipping-rates', {
            method: 'POST',
            body: JSON.stringify({ currency: 'CAD' }),
        });

        const response: any = await action({ request, context: mockContext as any, params: {} });
        const { data, status } = await unwrap(response);

        expect(status).toBe(500);
        expect(data.message).toBe("An error occurred while calculating shipping rates.");
    });
});
