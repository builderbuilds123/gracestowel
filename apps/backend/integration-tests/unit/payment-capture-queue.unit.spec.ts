import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Job } from "bullmq";

const mockQueueAdd = vi.fn().mockResolvedValue({ id: "test-job-id" });
const mockQueueGetJob = vi.fn();
const mockQueueInstance = {
    add: mockQueueAdd,
    getJob: mockQueueGetJob,
};

const mockWorkerOn = vi.fn();
const mockWorkerClose = vi.fn();

// Mock BullMQ
vi.mock("bullmq", () => ({
    Queue: vi.fn(function() { return mockQueueInstance; }),
    Worker: vi.fn(function() {
        return {
            on: mockWorkerOn,
            close: mockWorkerClose,
        };
    }),
    Job: vi.fn(),
}));

// Mock Stripe error class to ensure identity match
class MockStripeInvalidRequestError extends Error {
    type: string;
    code: string;
    constructor(data: any) {
        super(data.message);
        this.type = data.type;
        this.code = data.code;
    }
}

vi.mock("stripe", () => {
    return {
        errors: {
            StripeInvalidRequestError: MockStripeInvalidRequestError
        },
        __esModule: true,
        default: {
            errors: {
                StripeInvalidRequestError: MockStripeInvalidRequestError
            }
        }
    };
});

// Mock Stripe client
const mockStripeRetrieve = vi.fn();
const mockStripeCapture = vi.fn();
const mockResetStripeClient = vi.fn();

// Create the factory function for the Stripe mock
const createStripeMock = () => ({
    getStripeClient: vi.fn().mockReturnValue({
        paymentIntents: {
            retrieve: mockStripeRetrieve,
            capture: mockStripeCapture,
        },
    }),
    resetStripeClient: mockResetStripeClient,
    STRIPE_API_VERSION: "2025-10-29.clover",
    createStripeClient: vi.fn(),
});

describe("payment-capture-queue", () => {
    const originalEnv = process.env;
    let mockContainer: any;
    let mockQueryGraph: vi.Mock;
    
    // Module functions under test
    let getPaymentCaptureQueue: any;
    let schedulePaymentCapture: any;
    let cancelPaymentCaptureJob: any;
    let startPaymentCaptureWorker: any;
    let fetchOrderTotal: any;
    let processPaymentCapture: any;

    beforeEach(async () => {
        vi.clearAllMocks();
        vi.resetModules();
        process.env = { ...originalEnv };
        process.env.REDIS_URL = "redis://localhost:6379";
        process.env.STRIPE_SECRET_KEY = "sk_test_mock";

        vi.spyOn(console, "log").mockImplementation(() => {});
        vi.spyOn(console, "warn").mockImplementation(() => {});
        vi.spyOn(console, "error").mockImplementation(() => {});

        // Re-apply the Stripe mock after resetModules
        vi.doMock("../../src/utils/stripe", createStripeMock);

        // Re-configure BullMQ mocks after clearAllMocks
        mockQueueAdd.mockResolvedValue({ id: "test-job-id" });
        mockQueueGetJob.mockResolvedValue(null);

        mockQueryGraph = vi.fn();
        const mockUpdateOrders = vi.fn().mockResolvedValue({});
        const mockUpdatePaymentCollections = vi.fn().mockResolvedValue({});
        const mockCapturePayment = vi.fn().mockResolvedValue({});
        const mockAddOrderTransactions = vi.fn().mockResolvedValue({});
        
        (global as any).mockUpdateOrders = mockUpdateOrders;
        (global as any).mockCapturePayment = mockCapturePayment;
        (global as any).mockUpdatePaymentCollections = mockUpdatePaymentCollections;
        (global as any).mockAddOrderTransactions = mockAddOrderTransactions;
        mockContainer = {
            resolve: vi.fn((serviceName: string) => {
                if (serviceName === "query") {
                    return { graph: mockQueryGraph };
                }
                if (serviceName === "order") {
                    return { updateOrders: mockUpdateOrders, addOrderTransactions: mockAddOrderTransactions };
                }
                if (serviceName === "payment") {
                    return {
                        updatePaymentCollections: mockUpdatePaymentCollections,
                        capturePayment: mockCapturePayment
                    };
                }
                return {};
            })
        };

        // Import the module under test FRESH for each test
        const queueMod = await import("../../src/lib/payment-capture-queue");
        getPaymentCaptureQueue = queueMod.getPaymentCaptureQueue;
        schedulePaymentCapture = queueMod.schedulePaymentCapture;
        cancelPaymentCaptureJob = queueMod.cancelPaymentCaptureJob;
        
        // Worker functions are now in a separate module
        const workerMod = await import("../../src/workers/payment-capture-worker");
        startPaymentCaptureWorker = workerMod.startPaymentCaptureWorker;
        fetchOrderTotal = workerMod.fetchOrderTotal;
        processPaymentCapture = workerMod.processPaymentCapture;
    });

    afterEach(() => {
        process.env = originalEnv;
        vi.restoreAllMocks();
    });

    describe("fetchOrderTotal (Story 2.3)", () => {
        it("should throw error if container is not initialized", async () => {
            await expect(fetchOrderTotal("ord_123")).rejects.toThrow("Container not initialized");
        });
        
        it("should throw error if order is not found", async () => {
            startPaymentCaptureWorker(mockContainer);
            mockQueryGraph.mockResolvedValue({ data: [] });

            await expect(fetchOrderTotal("ord_missing")).rejects.toThrow("not found in DB");
            expect(mockQueryGraph).toHaveBeenCalled();
        });

        it("should convert float total to cents (AC #2)", async () => {
            startPaymentCaptureWorker(mockContainer);
            mockQueryGraph.mockResolvedValue({ 
                data: [{ id: "ord_float", total: 10.99, currency_code: "usd", status: "pending" }] 
            });

            const result = await fetchOrderTotal("ord_float");
            expect(result).toEqual({ totalCents: 1099, currencyCode: "usd", status: "pending" });
        });

        it("should return null if currency_code is missing (M1 Fix)", async () => {
            startPaymentCaptureWorker(mockContainer);
            mockQueryGraph.mockResolvedValue({ 
                data: [{ id: "ord_1", total: 1000 }] // missing currency_code
            });

            const result = await fetchOrderTotal("ord_1");
            expect(result).toBeNull();
            expect(console.error).toHaveBeenCalledWith(expect.stringContaining("no currency code"));
        });

        it("should return correct data when order exists and valid", async () => {
            startPaymentCaptureWorker(mockContainer);
            mockQueryGraph.mockResolvedValue({ 
                data: [{ id: "ord_valid", total: 50.00, currency_code: "usd", status: "pending" }] 
            });

            const result = await fetchOrderTotal("ord_valid");
            expect(result).toEqual({ totalCents: 5000, currencyCode: "usd", status: "pending" });
        });
    });

    describe("processPaymentCapture (Story 2.3)", () => {
        const mockJobData = {
            orderId: "order_123",
            paymentIntentId: "pi_123",
            scheduledAt: 100000,
        };
        const mockJob: Partial<Job> = { data: mockJobData };

        beforeEach(() => {
            startPaymentCaptureWorker(mockContainer);
        });

        it("should capture dynamic amount when order fetch succeeds (Normal Flow)", async () => {
            mockStripeRetrieve.mockResolvedValue({
                id: "pi_123",
                status: "requires_capture",
                amount: 5000,
                currency: "usd"
            });
            mockQueryGraph.mockResolvedValue({
                data: [{
                    id: "order_123",
                    total: 50.00,
                    currency_code: "usd",
                    status: "pending",
                    metadata: {},
                    payment_collections: [{
                        id: "paycol_123",
                        status: "authorized",
                        payments: [{ id: "pay_123" }]
                    }]
                }]
            });

            await processPaymentCapture(mockJob as Job);

            expect((global as any).mockCapturePayment).toHaveBeenCalledWith({
                payment_id: "pay_123",
                amount: 50.00 
            });

            expect(mockStripeCapture).not.toHaveBeenCalled();
        });

        it("should capture partial amount when order total < authorized (Partial)", async () => {
            mockStripeRetrieve.mockResolvedValue({
                id: "pi_123",
                status: "requires_capture",
                amount: 5000,
                currency: "usd"
            });
            mockQueryGraph.mockResolvedValue({
                data: [{
                    id: "order_123",
                    total: 40.00,
                    currency_code: "usd",
                    status: "pending",
                    metadata: {},
                    payment_collections: [{
                        id: "paycol_123",
                        status: "authorized",
                        payments: [{ id: "pay_123" }]
                    }]
                }]
            });

            await processPaymentCapture(mockJob as Job);

            expect((global as any).mockCapturePayment).toHaveBeenCalledWith({
                payment_id: "pay_123",
                amount: 40.00
            });

            expect(mockStripeCapture).not.toHaveBeenCalled();
        });

        it("should throw error when order total > authorized (Excess)", async () => {
            mockStripeRetrieve.mockResolvedValue({
                id: "pi_123",
                status: "requires_capture",
                amount: 5000,
                currency: "usd"
            });
            mockQueryGraph.mockResolvedValue({
                data: [{
                    id: "order_123",
                    total: 60.00,
                    currency_code: "usd",
                    status: "pending",
                    metadata: {},
                    payment_collections: [{
                        id: "paycol_123",
                        status: "authorized",
                        payments: [{ id: "pay_123" }]
                    }]
                }]
            });
            (global as any).mockCapturePayment.mockRejectedValueOnce(
                new Error("Payment Module validation failed")
            );

            await expect(processPaymentCapture(mockJob as Job))
                .rejects.toThrow("exceeds authorized amount");

            expect(mockStripeCapture).not.toHaveBeenCalled();
            expect(console.error).toHaveBeenCalledWith(expect.stringContaining("Manual intervention required"));
        });

        it("should throw error on currency mismatch (M2 Fix)", async () => {
            mockStripeRetrieve.mockResolvedValue({ 
                id: "pi_123", 
                status: "requires_capture", 
                amount: 5000, 
                currency: "usd" 
            });
            mockQueryGraph.mockResolvedValue({
                data: [{
                    id: "order_123",
                    total: 50.00,
                    currency_code: "eur",
                    status: "pending",
                    payment_collections: [{
                        id: "paycol_123",
                        status: "authorized",
                        payments: [{ id: "pay_123" }]
                    }]
                }]
            });

            await expect(processPaymentCapture(mockJob as Job))
                .rejects.toThrow("Currency mismatch");
            
            expect(console.error).toHaveBeenCalledWith(expect.stringContaining("Currency mismatch"));
            expect(mockStripeCapture).not.toHaveBeenCalled();
        });

        it("should fail the job if order fetch fails (no capture)", async () => {
            mockStripeRetrieve.mockResolvedValue({ 
                id: "pi_123", 
                status: "requires_capture", 
                amount: 5000, 
                currency: "usd" 
            });
            mockQueryGraph.mockResolvedValue({ data: [] });

            await expect(processPaymentCapture(mockJob as Job))
                .rejects.toThrow("not found in DB");

            expect(mockStripeCapture).not.toHaveBeenCalled();
        });

        it("should handle Stripe amount_too_large error (M3 Fix)", async () => {
             mockStripeRetrieve.mockResolvedValue({
                id: "pi_123",
                status: "requires_capture",
                amount: 5000,
                currency: "usd"
            });
            mockQueryGraph.mockResolvedValue({
                data: [{
                    id: "order_123",
                    total: 50.00,
                    currency_code: "usd",
                    status: "pending",
                    metadata: {},
                    payment_collections: [{
                        id: "paycol_123",
                        status: "authorized",
                        payments: [{ id: "pay_123" }]
                    }]
                }]
            });

            (global as any).mockCapturePayment.mockRejectedValueOnce(
                new Error("Payment Module unavailable")
            );

            const stripeError = new Error("Amount too large") as any;
            stripeError.type = "invalid_request_error";
            stripeError.code = "amount_too_large";

            mockStripeCapture.mockRejectedValue(stripeError);

            await expect(processPaymentCapture(mockJob as Job))
                .rejects.toThrow("Amount too large");
            
            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining("Amount too large error"),
                expect.anything()
            );
        });
        
        it("should skip if already canceled", async () => {
            mockStripeRetrieve.mockResolvedValue({ status: "canceled" });
            await processPaymentCapture(mockJob as Job);
            expect(console.log).toHaveBeenCalledWith(expect.stringContaining("already canceled"));
            expect(mockStripeCapture).not.toHaveBeenCalled();
        });

        it("should skip if already succeeded", async () => {
            mockStripeRetrieve.mockResolvedValue({ status: "succeeded", amount: 5000 });
            mockQueryGraph.mockResolvedValue({
                data: [{
                    id: "order_123",
                    currency_code: "usd",
                    status: "pending",
                    metadata: {},
                    payment_collections: [{
                        id: "paycol_123",
                        status: "authorized",
                        payments: [{ id: "pay_123" }]
                    }]
                }]
            });
            await processPaymentCapture(mockJob as Job);
            expect(console.log).toHaveBeenCalledWith(expect.stringContaining("already captured"));
            expect(mockStripeCapture).not.toHaveBeenCalled();
        });

        it("should fail the job when order fetch fails (no capture) - duplicate", async () => {
            mockStripeRetrieve.mockResolvedValue({ status: "requires_capture", amount: 5000, currency: "usd" });
            mockQueryGraph.mockResolvedValue({ data: [] });

            await expect(processPaymentCapture(mockJob as Job))
                .rejects.toThrow("not found in DB");

            expect(mockStripeCapture).not.toHaveBeenCalled();
        });

        it("should skip capture if order is canceled in Medusa", async () => {
            mockStripeRetrieve.mockResolvedValue({ status: "requires_capture", amount: 1000, currency: "usd" });
            mockQueryGraph.mockResolvedValue({
                data: [{
                    id: "order_123",
                    total: 10.00,
                    currency_code: "usd",
                    status: "canceled",
                    payment_collections: [{
                        id: "paycol_123",
                        status: "authorized",
                        payments: [{ id: "pay_123" }]
                    }]
                }]
            });

            await processPaymentCapture(mockJob as Job);

            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining("canceled in Medusa")
            );
            expect(console.log).toHaveBeenCalledWith(expect.stringContaining("capture_blocked_canceled_order"));
            expect(mockStripeCapture).not.toHaveBeenCalled();
        });

        it("should update order metadata after successful capture", async () => {
            mockStripeRetrieve.mockResolvedValue({ status: "requires_capture", amount: 1000, currency: "usd" });
            mockQueryGraph.mockResolvedValue({
                data: [{
                    id: "order_123",
                    total: 10.00,
                    currency_code: "usd",
                    status: "pending",
                    metadata: {},
                    payment_collections: [{
                        id: "paycol_123",
                        status: "authorized",
                        payments: [{ id: "pay_123" }]
                    }]
                }]
            });

            await processPaymentCapture(mockJob as Job);

            expect((global as any).mockCapturePayment).toHaveBeenCalledWith({
                payment_id: "pay_123",
                amount: 10.00
            });

            expect((global as any).mockAddOrderTransactions).toHaveBeenCalled();

            expect((global as any).mockUpdateOrders).toHaveBeenCalledWith([
                expect.objectContaining({
                    id: "order_123",
                    status: "completed"
                })
            ]);
        });
    });

    describe("Queue & Worker (Story 2.2 Coverage)", () => {
        it("should schedule job correctly", async () => {
            await schedulePaymentCapture("order_1", "pi_1");
            expect(mockQueueAdd).toHaveBeenCalled();
        });

        it("should verify wiring from schedule to process (AC5)", async () => {
            await schedulePaymentCapture("order_wiring", "pi_wiring");
            
            expect(mockQueueAdd).toHaveBeenCalledWith(
                "capture-order_wiring",
                expect.objectContaining({
                    orderId: "order_wiring",
                    paymentIntentId: "pi_wiring"
                }),
                expect.objectContaining({
                    delay: expect.any(Number)
                })
            );

            const scheduledData = mockQueueAdd.mock.calls[mockQueueAdd.mock.calls.length - 1][1];
            const mockJob = { data: scheduledData } as Job;

            mockStripeRetrieve.mockResolvedValue({ status: "requires_capture", amount: 1000, currency: "usd" });
            mockQueryGraph.mockResolvedValue({
                data: [{
                    id: "order_wiring",
                    total: 10.00,
                    currency_code: "usd",
                    status: "pending",
                    metadata: {},
                    payment_collections: [{
                        id: "paycol_wiring",
                        status: "authorized",
                        payments: [{ id: "pay_wiring" }]
                    }]
                }]
            });

            startPaymentCaptureWorker(mockContainer);

            await processPaymentCapture(mockJob);

            expect((global as any).mockCapturePayment).toHaveBeenCalledWith({
                payment_id: "pay_wiring",
                amount: 10.00
            });

            expect((global as any).mockUpdateOrders).toHaveBeenCalledWith([
                expect.objectContaining({
                    id: "order_wiring",
                    status: "completed"
                })
            ]);
        });
    });
});
