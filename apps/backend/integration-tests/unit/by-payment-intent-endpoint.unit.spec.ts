import { GET } from "../../src/api/store/orders/by-payment-intent/route";
import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { modificationTokenService } from "../../src/services/modification-token";

// Mock the modification token service
jest.mock("../../src/services/modification-token", () => ({
    modificationTokenService: {
        generateToken: jest.fn(),
        getRemainingTime: jest.fn(),
    },
}));

describe("GET /store/orders/by-payment-intent - SEC-02 Security Tests", () => {
    let mockReq: Partial<MedusaRequest>;
    let mockRes: Partial<MedusaResponse>;
    let mockQuery: jest.Mock;
    let setHeaderSpy: jest.Mock;
    let statusSpy: jest.Mock;
    let jsonSpy: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();

        // Mock query service
        mockQuery = jest.fn();

        // Mock response methods
        setHeaderSpy = jest.fn();
        jsonSpy = jest.fn();
        statusSpy = jest.fn(() => ({ json: jsonSpy }));

        mockReq = {
            query: {},
            scope: {
                resolve: jest.fn((service: string) => {
                    if (service === "query") return { graph: mockQuery };
                    throw new Error(`Unknown service: ${service}`);
                }),
            },
        } as any;

        mockRes = {
            setHeader: setHeaderSpy,
            status: statusSpy,
            json: jsonSpy,
        } as any;
    });

    describe("SEC-02-AC1: PII Protection", () => {
        it("should NOT return shipping_address in response", async () => {
            const paymentIntentId = "pi_test123";
            const mockOrder = {
                id: "order_123",
                status: "pending",
                created_at: new Date().toISOString(),
                metadata: { stripe_payment_intent_id: paymentIntentId },
                shipping_address: {
                    first_name: "John",
                    last_name: "Doe",
                    address_1: "123 Main St",
                    city: "New York",
                    postal_code: "10001",
                    country_code: "US",
                },
                items: [
                    {
                        id: "item_1",
                        title: "Premium Towel",
                        quantity: 2,
                        unit_price: 2999,
                    },
                ],
                total: 5998,
                currency_code: "usd",
            };

            mockReq.query = { payment_intent_id: paymentIntentId };
            mockQuery.mockResolvedValue({ data: [mockOrder] });
            (modificationTokenService.generateToken as jest.Mock).mockReturnValue("mock_token");
            (modificationTokenService.getRemainingTime as jest.Mock).mockReturnValue(3600);

            await GET(mockReq as MedusaRequest, mockRes as MedusaResponse);

            expect(statusSpy).toHaveBeenCalledWith(200);
            const responseData = jsonSpy.mock.calls[0][0];

            // Verify PII is NOT in response
            expect(responseData.order.shipping_address).toBeUndefined();
            expect(responseData.order.items).toBeUndefined();
            expect(responseData.order.total).toBeUndefined();
            expect(responseData.order.currency_code).toBeUndefined();

            // Verify only safe fields are returned
            expect(responseData.order).toEqual({
                id: "order_123",
                status: "pending",
            });
        });

        it("should NOT return customer details in response", async () => {
            const paymentIntentId = "pi_test456";
            const mockOrder = {
                id: "order_456",
                status: "completed",
                created_at: new Date().toISOString(),
                metadata: { stripe_payment_intent_id: paymentIntentId },
                customer: {
                    id: "cust_123",
                    email: "customer@example.com",
                    phone: "+1234567890",
                },
            };

            mockReq.query = { payment_intent_id: paymentIntentId };
            mockQuery.mockResolvedValue({ data: [mockOrder] });
            (modificationTokenService.generateToken as jest.Mock).mockReturnValue("mock_token");
            (modificationTokenService.getRemainingTime as jest.Mock).mockReturnValue(3600);

            await GET(mockReq as MedusaRequest, mockRes as MedusaResponse);

            const responseData = jsonSpy.mock.calls[0][0];

            // Verify customer data is NOT in response
            expect(responseData.order.customer).toBeUndefined();
            expect(responseData.order.email).toBeUndefined();
            expect(responseData.order.phone).toBeUndefined();
        });

        it("should NOT return line items details", async () => {
            const paymentIntentId = "pi_test789";
            const mockOrder = {
                id: "order_789",
                status: "pending",
                created_at: new Date().toISOString(),
                metadata: { stripe_payment_intent_id: paymentIntentId },
                items: [
                    {
                        id: "item_1",
                        title: "Sensitive Product Name",
                        quantity: 3,
                        unit_price: 1999,
                        thumbnail: "https://example.com/image.jpg",
                        variant_id: "variant_123",
                    },
                ],
            };

            mockReq.query = { payment_intent_id: paymentIntentId };
            mockQuery.mockResolvedValue({ data: [mockOrder] });
            (modificationTokenService.generateToken as jest.Mock).mockReturnValue("mock_token");
            (modificationTokenService.getRemainingTime as jest.Mock).mockReturnValue(3600);

            await GET(mockReq as MedusaRequest, mockRes as MedusaResponse);

            const responseData = jsonSpy.mock.calls[0][0];

            // Verify items are NOT in response
            expect(responseData.order.items).toBeUndefined();
        });
    });

    describe("SEC-02-AC2: Security Headers", () => {
        it("should set Cache-Control: no-store, private header", async () => {
            const paymentIntentId = "pi_test123";
            const mockOrder = {
                id: "order_123",
                status: "pending",
                created_at: new Date().toISOString(),
                metadata: { stripe_payment_intent_id: paymentIntentId },
            };

            mockReq.query = { payment_intent_id: paymentIntentId };
            mockQuery.mockResolvedValue({ data: [mockOrder] });
            (modificationTokenService.generateToken as jest.Mock).mockReturnValue("mock_token");
            (modificationTokenService.getRemainingTime as jest.Mock).mockReturnValue(3600);

            await GET(mockReq as MedusaRequest, mockRes as MedusaResponse);

            expect(setHeaderSpy).toHaveBeenCalledWith("Cache-Control", "no-store, private");
        });

        it("should set X-Content-Type-Options: nosniff header", async () => {
            const paymentIntentId = "pi_test123";
            const mockOrder = {
                id: "order_123",
                status: "pending",
                created_at: new Date().toISOString(),
                metadata: { stripe_payment_intent_id: paymentIntentId },
            };

            mockReq.query = { payment_intent_id: paymentIntentId };
            mockQuery.mockResolvedValue({ data: [mockOrder] });
            (modificationTokenService.generateToken as jest.Mock).mockReturnValue("mock_token");
            (modificationTokenService.getRemainingTime as jest.Mock).mockReturnValue(3600);

            await GET(mockReq as MedusaRequest, mockRes as MedusaResponse);

            expect(setHeaderSpy).toHaveBeenCalledWith("X-Content-Type-Options", "nosniff");
        });

        it("should set security headers even on error responses", async () => {
            mockReq.query = { payment_intent_id: "pi_test" };
            mockQuery.mockRejectedValue(new Error("Database error"));

            await GET(mockReq as MedusaRequest, mockRes as MedusaResponse);

            expect(setHeaderSpy).toHaveBeenCalledWith("Cache-Control", "no-store, private");
            expect(setHeaderSpy).toHaveBeenCalledWith("X-Content-Type-Options", "nosniff");
        });
    });

    describe("SEC-02-AC3: Query Optimization", () => {
        it("should only fetch minimal fields (id, status, created_at, metadata)", async () => {
            const paymentIntentId = "pi_test123";
            mockReq.query = { payment_intent_id: paymentIntentId };
            mockQuery.mockResolvedValue({ data: [] });

            await GET(mockReq as MedusaRequest, mockRes as MedusaResponse);

            expect(mockQuery).toHaveBeenCalledWith({
                entity: "order",
                fields: ["id", "status", "created_at", "metadata"],
            });

            // Verify it does NOT fetch PII fields
            const callArgs = mockQuery.mock.calls[0][0];
            expect(callArgs.fields).not.toContain("shipping_address.*");
            expect(callArgs.fields).not.toContain("items.*");
            expect(callArgs.fields).not.toContain("customer.*");
            expect(callArgs.fields).not.toContain("total");
            expect(callArgs.fields).not.toContain("currency_code");
        });

        it("should filter to orders within last 24 hours", async () => {
            const paymentIntentId = "pi_test123";
            const now = new Date();
            const twentyFiveHoursAgo = new Date(now.getTime() - 25 * 60 * 60 * 1000);
            const twelveHoursAgo = new Date(now.getTime() - 12 * 60 * 60 * 1000);

            const oldOrder = {
                id: "old_order",
                status: "pending",
                created_at: twentyFiveHoursAgo.toISOString(),
                metadata: { stripe_payment_intent_id: paymentIntentId },
            };

            const recentOrder = {
                id: "recent_order",
                status: "pending",
                created_at: twelveHoursAgo.toISOString(),
                metadata: { stripe_payment_intent_id: paymentIntentId },
            };

            mockReq.query = { payment_intent_id: paymentIntentId };
            mockQuery.mockResolvedValue({ data: [oldOrder, recentOrder] });
            (modificationTokenService.generateToken as jest.Mock).mockReturnValue("mock_token");
            (modificationTokenService.getRemainingTime as jest.Mock).mockReturnValue(3600);

            await GET(mockReq as MedusaRequest, mockRes as MedusaResponse);

            expect(statusSpy).toHaveBeenCalledWith(200);
            const responseData = jsonSpy.mock.calls[0][0];

            // Should return the recent order, not the old one
            expect(responseData.order.id).toBe("recent_order");
        });

        it("should return 404 if only old orders exist (>24h)", async () => {
            const paymentIntentId = "pi_old";
            const thirtyHoursAgo = new Date(Date.now() - 30 * 60 * 60 * 1000);

            const oldOrder = {
                id: "old_order",
                status: "pending",
                created_at: thirtyHoursAgo.toISOString(),
                metadata: { stripe_payment_intent_id: paymentIntentId },
            };

            mockReq.query = { payment_intent_id: paymentIntentId };
            mockQuery.mockResolvedValue({ data: [oldOrder] });

            await GET(mockReq as MedusaRequest, mockRes as MedusaResponse);

            expect(statusSpy).toHaveBeenCalledWith(404);
            expect(jsonSpy).toHaveBeenCalledWith({
                error: "Order not found",
                code: "ORDER_NOT_FOUND",
                message: "Order is still being processed. Please try again in a few seconds.",
                retry: true,
            });
        });
    });

    describe("SEC-02-AC4: Token Generation", () => {
        it("should use existing token (not mint new ones uncontrollably)", async () => {
            const paymentIntentId = "pi_test123";
            const orderId = "order_123";
            const createdAt = new Date().toISOString();

            const mockOrder = {
                id: orderId,
                status: "pending",
                created_at: createdAt,
                metadata: { stripe_payment_intent_id: paymentIntentId },
            };

            mockReq.query = { payment_intent_id: paymentIntentId };
            mockQuery.mockResolvedValue({ data: [mockOrder] });
            (modificationTokenService.generateToken as jest.Mock).mockReturnValue("existing_token");
            (modificationTokenService.getRemainingTime as jest.Mock).mockReturnValue(3600);

            await GET(mockReq as MedusaRequest, mockRes as MedusaResponse);

            // Verify token is generated with order creation time (deterministic)
            expect(modificationTokenService.generateToken).toHaveBeenCalledWith(
                orderId,
                paymentIntentId,
                createdAt
            );

            const responseData = jsonSpy.mock.calls[0][0];
            expect(responseData.modification_token).toBe("existing_token");
        });
    });

    describe("Error Handling", () => {
        it("should return 400 if payment_intent_id is missing", async () => {
            mockReq.query = {};

            await GET(mockReq as MedusaRequest, mockRes as MedusaResponse);

            expect(statusSpy).toHaveBeenCalledWith(400);
            expect(jsonSpy).toHaveBeenCalledWith({
                error: "payment_intent_id query parameter is required",
                code: "MISSING_PAYMENT_INTENT_ID",
            });
        });

        it("should return 404 if no matching order found", async () => {
            mockReq.query = { payment_intent_id: "pi_nonexistent" };
            mockQuery.mockResolvedValue({ data: [] });

            await GET(mockReq as MedusaRequest, mockRes as MedusaResponse);

            expect(statusSpy).toHaveBeenCalledWith(404);
            expect(jsonSpy).toHaveBeenCalledWith({
                error: "Order not found",
                code: "ORDER_NOT_FOUND",
                message: "Order is still being processed. Please try again in a few seconds.",
                retry: true,
            });
        });

        it("should return 500 on database error", async () => {
            mockReq.query = { payment_intent_id: "pi_test" };
            mockQuery.mockRejectedValue(new Error("Database connection failed"));

            await GET(mockReq as MedusaRequest, mockRes as MedusaResponse);

            expect(statusSpy).toHaveBeenCalledWith(500);
            expect(jsonSpy).toHaveBeenCalledWith({
                error: "Failed to fetch order",
                code: "FETCH_FAILED",
            });
        });
    });

    describe("Performance Tests", () => {
        it("should handle multiple orders efficiently (filters in memory)", async () => {
            const paymentIntentId = "pi_target";
            const now = new Date();

            // Create 100 orders (simulating a busy day)
            const orders = Array.from({ length: 100 }, (_, i) => ({
                id: `order_${i}`,
                status: "pending",
                created_at: new Date(now.getTime() - i * 60 * 1000).toISOString(), // 1 min apart
                metadata: {
                    stripe_payment_intent_id: i === 50 ? paymentIntentId : `pi_other_${i}`,
                },
            }));

            mockReq.query = { payment_intent_id: paymentIntentId };
            mockQuery.mockResolvedValue({ data: orders });
            (modificationTokenService.generateToken as jest.Mock).mockReturnValue("mock_token");
            (modificationTokenService.getRemainingTime as jest.Mock).mockReturnValue(3600);

            const startTime = Date.now();
            await GET(mockReq as MedusaRequest, mockRes as MedusaResponse);
            const duration = Date.now() - startTime;

            // Should complete quickly (< 100ms) for in-memory filtering
            expect(duration).toBeLessThan(100);

            expect(statusSpy).toHaveBeenCalledWith(200);
            const responseData = jsonSpy.mock.calls[0][0];
            expect(responseData.order.id).toBe("order_50");
        });
    });
});
