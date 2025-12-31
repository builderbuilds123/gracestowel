import { GET } from "../../src/api/store/orders/by-payment-intent/route";
import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";

describe("GET /store/orders/by-payment-intent - SEC-02 Security Tests", () => {
    // Valid Stripe PaymentIntent ID format: pi_[24 alphanumeric chars] = 27 chars
    const VALID_PI_ID = "pi_123456789012345678901234"; // 27 chars
    const VALID_PI_ID_2 = "pi_234567890123456789012345"; // 27 chars
    const VALID_PI_ID_3 = "pi_345678901234567890123456"; // 27 chars
    const VALID_PI_ID_4 = "pi_456789012345678901234567"; // 27 chars
    const VALID_PI_ID_5 = "pi_567890123456789012345678"; // 27 chars

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
            const paymentIntentId = VALID_PI_ID;
            const mockOrder = {
                id: "order_123",
                status: "pending",
                created_at: new Date().toISOString(),
                metadata: { stripe_payment_intent_id: paymentIntentId },
            };

            mockReq.query = { payment_intent_id: paymentIntentId };
            mockQuery.mockResolvedValue({ data: [mockOrder] });

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
            const paymentIntentId = VALID_PI_ID_2;
            const mockOrder = {
                id: "order_456",
                status: "completed",
                created_at: new Date().toISOString(),
                metadata: { stripe_payment_intent_id: paymentIntentId },
            };

            mockReq.query = { payment_intent_id: paymentIntentId };
            mockQuery.mockResolvedValue({ data: [mockOrder] });

            await GET(mockReq as MedusaRequest, mockRes as MedusaResponse);

            const responseData = jsonSpy.mock.calls[0][0];

            // Verify customer data is NOT in response
            expect(responseData.order.customer).toBeUndefined();
            expect(responseData.order.email).toBeUndefined();
            expect(responseData.order.phone).toBeUndefined();
        });

        it("should NOT return line items details", async () => {
            const paymentIntentId = VALID_PI_ID_3;
            const mockOrder = {
                id: "order_789",
                status: "pending",
                created_at: new Date().toISOString(),
                metadata: { stripe_payment_intent_id: paymentIntentId },
            };

            mockReq.query = { payment_intent_id: paymentIntentId };
            mockQuery.mockResolvedValue({ data: [mockOrder] });

            await GET(mockReq as MedusaRequest, mockRes as MedusaResponse);

            const responseData = jsonSpy.mock.calls[0][0];

            // Verify items are NOT in response
            expect(responseData.order.items).toBeUndefined();
        });
    });

    describe("SEC-02-AC2: Security Headers", () => {
        it("should set Cache-Control: no-store, private header", async () => {
            const paymentIntentId = VALID_PI_ID;
            const mockOrder = {
                id: "order_123",
                status: "pending",
                created_at: new Date().toISOString(),
                metadata: { stripe_payment_intent_id: paymentIntentId },
            };

            mockReq.query = { payment_intent_id: paymentIntentId };
            mockQuery.mockResolvedValue({ data: [mockOrder] });

            await GET(mockReq as MedusaRequest, mockRes as MedusaResponse);

            expect(setHeaderSpy).toHaveBeenCalledWith("Cache-Control", "no-store, private");
        });

        it("should set X-Content-Type-Options: nosniff header", async () => {
            const paymentIntentId = VALID_PI_ID;
            const mockOrder = {
                id: "order_123",
                status: "pending",
                created_at: new Date().toISOString(),
                metadata: { stripe_payment_intent_id: paymentIntentId },
            };

            mockReq.query = { payment_intent_id: paymentIntentId };
            mockQuery.mockResolvedValue({ data: [mockOrder] });

            await GET(mockReq as MedusaRequest, mockRes as MedusaResponse);

            expect(setHeaderSpy).toHaveBeenCalledWith("X-Content-Type-Options", "nosniff");
        });

        it("should set security headers even on error responses", async () => {
            mockReq.query = { payment_intent_id: VALID_PI_ID };
            mockQuery.mockRejectedValue(new Error("Database error"));

            await GET(mockReq as MedusaRequest, mockRes as MedusaResponse);

            expect(setHeaderSpy).toHaveBeenCalledWith("Cache-Control", "no-store, private");
            expect(setHeaderSpy).toHaveBeenCalledWith("X-Content-Type-Options", "nosniff");
        });
    });

    describe("SEC-02-AC3: Query Optimization", () => {
        it("should only fetch minimal fields (id, status, created_at, metadata)", async () => {
            const paymentIntentId = VALID_PI_ID;
            mockReq.query = { payment_intent_id: paymentIntentId };
            mockQuery.mockResolvedValue({ data: [] });

            await GET(mockReq as MedusaRequest, mockRes as MedusaResponse);

            expect(mockQuery).toHaveBeenCalledWith({
                entity: "order",
                fields: ["id", "status", "created_at", "metadata"],
                pagination: { take: 200 },
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
            const paymentIntentId = VALID_PI_ID;
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

            await GET(mockReq as MedusaRequest, mockRes as MedusaResponse);

            expect(statusSpy).toHaveBeenCalledWith(200);
            const responseData = jsonSpy.mock.calls[0][0];

            // Should return the recent order, not the old one
            expect(responseData.order.id).toBe("recent_order");
        });

        it("should return 404 if only old orders exist (>24h)", async () => {
            const paymentIntentId = VALID_PI_ID_4;
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

        it("should return 400 if payment_intent_id has invalid format", async () => {
            mockReq.query = { payment_intent_id: "invalid_format" };

            await GET(mockReq as MedusaRequest, mockRes as MedusaResponse);

            expect(statusSpy).toHaveBeenCalledWith(400);
            expect(jsonSpy).toHaveBeenCalledWith({
                error: "Invalid payment_intent_id format",
                code: "INVALID_PAYMENT_INTENT_ID",
            });
        });

        it("should return 400 if payment_intent_id is too short", async () => {
            mockReq.query = { payment_intent_id: "pi_123" };

            await GET(mockReq as MedusaRequest, mockRes as MedusaResponse);

            expect(statusSpy).toHaveBeenCalledWith(400);
            expect(jsonSpy).toHaveBeenCalledWith({
                error: "Invalid payment_intent_id format",
                code: "INVALID_PAYMENT_INTENT_ID",
            });
        });

        it("should return 400 if payment_intent_id doesn't start with pi_", async () => {
            mockReq.query = { payment_intent_id: "pm_123456789012345678901234" };

            await GET(mockReq as MedusaRequest, mockRes as MedusaResponse);

            expect(statusSpy).toHaveBeenCalledWith(400);
            expect(jsonSpy).toHaveBeenCalledWith({
                error: "Invalid payment_intent_id format",
                code: "INVALID_PAYMENT_INTENT_ID",
            });
        });

        it("should return 404 if no matching order found", async () => {
            mockReq.query = { payment_intent_id: VALID_PI_ID_5 };
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
            mockReq.query = { payment_intent_id: VALID_PI_ID };
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
            const paymentIntentId = VALID_PI_ID;
            const now = new Date();

            // Create 100 orders (simulating a busy day)
            const orders = Array.from({ length: 100 }, (_, i) => ({
                id: `order_${i}`,
                status: "pending",
                created_at: new Date(now.getTime() - i * 60 * 1000).toISOString(), // 1 min apart
                metadata: {
                    stripe_payment_intent_id: i === 50 ? paymentIntentId : `${VALID_PI_ID_2.substring(0, 3)}${i.toString().padStart(24, '0')}`,
                },
            }));

            mockReq.query = { payment_intent_id: paymentIntentId };
            mockQuery.mockResolvedValue({ data: orders });

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
