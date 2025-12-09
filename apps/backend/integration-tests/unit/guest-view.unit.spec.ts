// @ts-nocheck
jest.mock('../../src/services/modification-token', () => ({
    modificationTokenService: {
        validateToken: jest.fn(),
        getRemainingTime: jest.fn()
    }
}));

import { GET } from '../../src/api/store/orders/[id]/guest-view/route';
import { modificationTokenService } from '../../src/services/modification-token';

// Mock Dependencies
const mockGraph = jest.fn();
const mockQueryService = {
    graph: mockGraph
};

jest.mock('@medusajs/framework', () => ({
    MedusaRequest: jest.fn(),
    MedusaResponse: jest.fn()
}));

const mockResolve = jest.fn((key: string) => {
    if (key === 'query') return mockQueryService;
    return null;
});

const mockReq = {
    scope: { resolve: mockResolve },
    query: {},
    headers: {},
    params: { id: 'order_123' }
} as any;

const mockRes = {
    json: jest.fn(),
    status: jest.fn().mockReturnThis(),
    setHeader: jest.fn()
} as any;

describe('GET /store/orders/:id/guest-view', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('returns 401 if token is missing', async () => {
        await GET(mockReq, mockRes);
        expect(mockRes.status).toHaveBeenCalledWith(401);
        expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ code: "TOKEN_REQUIRED" }));
    });

    it('returns 403 if token is expired', async () => {
        mockReq.query = { token: 'expired_token' };
        (modificationTokenService.validateToken as any).mockReturnValue({ valid: false, expired: true, error: "Modification window has expired" });

        await GET(mockReq, mockRes);

        expect(mockRes.status).toHaveBeenCalledWith(403);
        expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ 
            code: 'TOKEN_EXPIRED',
            request_new_link_url: expect.stringContaining('/api/resend-magic-link')
        }));
    });

    it('returns masked order data if token is valid', async () => {
        mockReq.query = { token: 'valid_token' };
        (modificationTokenService.validateToken as any).mockReturnValue({ 
            valid: true, 
            payload: { order_id: 'order_123' }
        });
        (modificationTokenService.getRemainingTime as any).mockReturnValue(3600);

        mockGraph.mockResolvedValue({
            data: [{
                id: 'order_123',
                email: 'test@example.com',
                status: 'pending',
                currency_code: 'usd',
                total: 10000,
                subtotal: 9000,
                tax_total: 500,
                shipping_total: 500,
                created_at: new Date().toISOString(),
                shipping_address: {
                    first_name: 'John',
                    last_name: 'Doe',
                    address_1: '123 Main St',
                    city: 'New York',
                    country_code: 'US',
                    phone: '555-0123'
                },
                items: [{ id: 'item_1', title: 'Towel', quantity: 1, unit_price: 5000 }]
            }]
        });

        await GET(mockReq, mockRes);

        expect(mockRes.status).toHaveBeenCalledWith(200);
        
        // Check PII Masking
        const responseData = mockRes.json.mock.calls[0][0];
        const order = responseData.order;

        expect(order.items).toHaveLength(1);
        expect(order.email).toBe('te***@example.com');
        // Regex: (.{2})(.*)(@.*)
        // test@example.com
        // $1 = te
        // $2 = st
        // $3 = @example.com
        // Result: te***@example.com
        expect(order.email).toMatch(/^te\*\*\*@example\.com$/);
        
        // Address should be masked per AC10
        expect(order.shipping_address).toEqual({
             last_name: 'D***', // Masked
             country_code: 'US'
             // first_name and city intentionally omitted per AC10
        });
        
        expect(responseData.modification_window).toHaveProperty('server_time');
        expect(responseData.modification_window).toHaveProperty('expires_at');
    });
});
