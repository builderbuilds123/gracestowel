
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { action } from './api.payment-collections.$id.sessions';
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

// Mock validateCSRFToken
const mockValidateCSRFToken = vi.fn();
vi.mock("../utils/csrf.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../utils/csrf.server")>();
  return {
    ...actual,
    validateCSRFToken: (...args: any[]) => mockValidateCSRFToken(...args),
    resolveCSRFSecret: vi.fn(() => "test-secret"),
  };
});

import { monitoredFetch } from '../utils/monitored-fetch';

describe('Payment Sessions API', () => {
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
        mockValidateCSRFToken.mockResolvedValue(true);
    });

    it('should create payment session for valid collection ID', async () => {
        const collectionId = 'pay_col_01HTEST1234567';
        const sessionId = 'payses_456';

        // Mock Medusa response
        fetchSpy.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                payment_collection: {
                    id: collectionId,
                    payment_sessions: [{
                        id: sessionId,
                        provider_id: 'pp_stripe',
                        data: {
                            client_secret: 'pi_secret_xxx'
                        }
                    }]
                }
            })
        });

        const request = new Request(`http://localhost:3000/api/payment-collections/${collectionId}/sessions`, {
            method: 'POST',
            body: JSON.stringify({ provider_id: 'pp_stripe' }),
        });

        const params = { id: collectionId };
        const response: any = await action({ request, context: mockContext, params } as any);
        const { data, status } = await unwrap(response);

        expect(status).toBe(200);
        expect(data.payment_collection.payment_sessions[0].id).toBe(sessionId);

        // Verify Medusa call
        expect(fetchSpy).toHaveBeenCalledWith(
            `http://localhost:9000/store/payment-collections/${collectionId}/payment-sessions`,
            expect.objectContaining({
                method: 'POST',
                body: JSON.stringify({ provider_id: 'pp_stripe' }),
                headers: expect.objectContaining({
                    'x-publishable-api-key': 'pk_test_123'
                })
            })
        );
    });

    it('should default provider_id to pp_stripe', async () => {
        const collectionId = 'pay_col_01HTEST1234567';
        
        fetchSpy.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ payment_collection: {} })
        });

        const request = new Request(`http://localhost:3000/api/payment-collections/${collectionId}/sessions`, {
            method: 'POST',
            body: JSON.stringify({}), // Empty body
        });

        await action({ request, context: mockContext, params: { id: collectionId } } as any);

        // Verify Medusa call used default provider
        expect(fetchSpy).toHaveBeenCalledWith(
            expect.stringContaining(collectionId),
            expect.objectContaining({
                body: JSON.stringify({ provider_id: 'pp_stripe' })
            })
        );
    });

    it('should return 400 if ID is missing in params', async () => {
         const request = new Request(`http://localhost:3000/api/payment-collections//sessions`, {
            method: 'POST',
            body: JSON.stringify({}), 
        });

        const response: any = await action({ request, context: mockContext, params: {} } as any);
        const { data, status } = await unwrap(response);

        expect(status).toBe(400);
        expect(data.error).toBe('Collection ID is required');
    });

    it('should return 400 for invalid collection ID format', async () => {
         const request = new Request(`http://localhost:3000/api/payment-collections/invalid_id/sessions`, {
            method: 'POST',
            body: JSON.stringify({}), 
        });

        const response: any = await action({ request, context: mockContext, params: { id: 'invalid_id' } } as any);
        const { data, status } = await unwrap(response);

        expect(status).toBe(400);
        expect(data.error).toBe('Invalid collection ID format');
    });

    it('should return 400 for invalid provider_id format', async () => {
        const collectionId = 'pay_col_01HTEST1234567';
        const request = new Request(`http://localhost:3000/api/payment-collections/${collectionId}/sessions`, {
            method: 'POST',
            body: JSON.stringify({ provider_id: 'invalid_provider' }),
        });

        const response: any = await action({ request, context: mockContext, params: { id: collectionId } } as any);
        const { data, status } = await unwrap(response);

        expect(status).toBe(400);
        expect(data.error).toBe('Invalid provider ID format');
    });

    it('should return 400 for invalid JSON body', async () => {
        const collectionId = 'pay_col_01HTEST1234567';
        const request = new Request(`http://localhost:3000/api/payment-collections/${collectionId}/sessions`, {
            method: 'POST',
            body: 'invalid json{',
            headers: { 'Content-Type': 'application/json' },
        });

        const response: any = await action({ request, context: mockContext, params: { id: collectionId } } as any);
        const { data, status } = await unwrap(response);

        expect(status).toBe(400);
        expect(data.error).toBe('Invalid JSON body');
    });

    it('should handle unexpected Medusa response structure (missing payment_sessions)', async () => {
        const collectionId = 'pay_col_01HTEST1234567';
        
        fetchSpy.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                payment_collection: {
                    id: collectionId,
                    // Missing payment_sessions array
                }
            })
        });

        const request = new Request(`http://localhost:3000/api/payment-collections/${collectionId}/sessions`, {
            method: 'POST',
            body: JSON.stringify({ provider_id: 'pp_stripe' }),
        });

        const response: any = await action({ request, context: mockContext, params: { id: collectionId } } as any);
        const { data, status } = await unwrap(response);

        // Should still return 200 with the response as-is (consumer handles structure)
        expect(status).toBe(200);
        expect(data.payment_collection.id).toBe(collectionId);
        expect(data.payment_collection.payment_sessions).toBeUndefined();
    });

    it('should handle Medusa 404 errors (collection not found)', async () => {
        const collectionId = 'pay_col_01HTEST1234567';
        
        fetchSpy.mockResolvedValueOnce({
            ok: false,
            status: 404,
            statusText: 'Not Found',
            text: async () => 'Payment collection not found'
        });

        const request = new Request(`http://localhost:3000/api/payment-collections/${collectionId}/sessions`, {
            method: 'POST',
            body: JSON.stringify({ provider_id: 'pp_stripe' }),
        });

        const response: any = await action({ request, context: mockContext, params: { id: collectionId } } as any);
        const { data, status } = await unwrap(response);

        expect(status).toBe(404);
        expect(data.error).toBe('Payment collection not found');
    });
});
