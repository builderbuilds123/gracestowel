import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock('../../src/services/modification-token', () => ({
    modificationTokenService: {
        validateToken: vi.fn(),
        getRemainingTime: vi.fn()
    }
}));

import { MedusaRequest, MedusaResponse } from '@medusajs/framework/http';
import { GET } from '../../src/api/store/orders/[id]/guest-view/route';
import { modificationTokenService } from '../../src/services/modification-token';

// Mock Dependencies
const mockGraph = vi.fn();

vi.mock('@medusajs/framework', () => ({
    MedusaRequest: vi.fn(),
    MedusaResponse: vi.fn()
}));

const mockResolve = vi.fn((key: string) => {
    if (key === 'query') return { graph: mockGraph };
    return null;
});

let mockReq: Partial<MedusaRequest>;
let mockRes: Partial<MedusaResponse>;
let jsonMock: vi.Mock;
let statusMock: vi.Mock;
let setHeaderMock: vi.Mock;

describe('GET /store/orders/:id/guest-view', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        
        jsonMock = vi.fn();
        statusMock = vi.fn().mockReturnThis();
        setHeaderMock = vi.fn();
        
        mockReq = {
            scope: { resolve: mockResolve } as any,
            query: {},
            headers: {},
            params: { id: 'order_123' }
        };
        
        mockRes = {
            json: jsonMock,
            status: statusMock,
            setHeader: setHeaderMock
        };
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

    // Story 4-2: Additional Security Tests
    it('accepts token from x-modification-token header', async () => {
        const reqWithHeader = {
            ...mockReq,
            headers: { 'x-modification-token': 'header_token' },
            query: {} // No query param
        };
        
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
                shipping_address: { last_name: 'Doe', country_code: 'US' },
                items: []
            }]
        });

        await GET(reqWithHeader, mockRes);

        expect(mockRes.status).toHaveBeenCalledWith(200);
        expect(modificationTokenService.validateToken).toHaveBeenCalledWith('header_token');
    });

    it('returns 401 with TOKEN_INVALID for invalid signature', async () => {
        mockReq.query = { token: 'invalid_signature_token' };
        (modificationTokenService.validateToken as any).mockReturnValue({ 
            valid: false, 
            expired: false, 
            error: "Invalid token" 
        });

        await GET(mockReq, mockRes);

        expect(mockRes.status).toHaveBeenCalledWith(401);
        expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ 
            code: 'TOKEN_INVALID'
        }));
    });

    it('returns 403 with TOKEN_MISMATCH when order ID does not match', async () => {
        mockReq.query = { token: 'valid_but_wrong_order_token' };
        (modificationTokenService.validateToken as any).mockReturnValue({ 
            valid: true, 
            payload: { order_id: 'order_different' } // Different from mockReq.params.id
        });

        await GET(mockReq, mockRes);

        expect(mockRes.status).toHaveBeenCalledWith(403);
        expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ 
            code: 'TOKEN_MISMATCH',
            error: 'Token does not match this order'
        }));
    });

    // Security Headers Tests (Story 4-2 AC3)
    it('sets Cache-Control header to no-store, private', async () => {
        mockReq.query = { token: 'any_token' };
        (modificationTokenService.validateToken as any).mockReturnValue({ valid: false });

        await GET(mockReq, mockRes);

        expect(mockRes.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store, private');
    });

    it('sets X-Content-Type-Options header to nosniff', async () => {
        mockReq.query = { token: 'any_token' };
        (modificationTokenService.validateToken as any).mockReturnValue({ valid: false });

        await GET(mockReq, mockRes);

        expect(mockRes.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
    });

    it('does not include phone number in response (PII masking)', async () => {
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
                items: []
            }]
        });

        await GET(mockReq, mockRes);

        const responseData = mockRes.json.mock.calls[0][0];
        const address = responseData.order.shipping_address;
        
        // Verify phone is NOT included
        expect(address).not.toHaveProperty('phone');
        // Verify full address not included
        expect(address).not.toHaveProperty('address_1');
        expect(address).not.toHaveProperty('first_name');
        expect(address).not.toHaveProperty('city');
    });

    // Code Review Fix: Test short email masking edge cases
    it.each([
        { description: '1-char local part', input: 'a@example.com', expected: '*@example.com' },
        { description: '2-char local part', input: 'ab@example.com', expected: 'a*@example.com' },
        { description: '3+ char local part', input: 'abc@example.com', expected: 'ab***@example.com' }
    ])('masks email correctly for $description', async ({ input, expected }) => {
        // Clear mocks for each test case to ensure isolation
        jsonMock.mockClear();
        mockGraph.mockClear();

        mockReq.query = { token: 'valid_token' };
        (modificationTokenService.validateToken as any).mockReturnValue({
            valid: true,
            payload: { order_id: 'order_123' }
        });
        (modificationTokenService.getRemainingTime as any).mockReturnValue(3600);
        
        mockGraph.mockResolvedValue({
            data: [{
                id: 'order_123',
                email: input,
                status: 'pending',
                currency_code: 'usd',
                total: 10000,
                subtotal: 9000,
                tax_total: 500,
                shipping_total: 500,
                created_at: new Date().toISOString(),
                shipping_address: { last_name: 'Doe', country_code: 'US' },
                items: []
            }]
        });

        await GET(mockReq, mockRes);

        const responseData = jsonMock.mock.calls[0][0];
        expect(responseData.order.email).toBe(expected);
    });
});
