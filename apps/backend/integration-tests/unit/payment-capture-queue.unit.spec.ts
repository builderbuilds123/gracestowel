/**
 * Unit tests for payment-capture-queue.ts
 * 
 * Story: 2.3 Enhance Capture Logic for Dynamic Totals
 * Coverage: 
 * - Queue management & Worker setup
 * - fetchOrderTotal (Story 2.3 core)
 * - processPaymentCapture (Story 2.3 core - dynamic amounts)
 * - Error handling & edge cases
 */

import { Job } from "bullmq";

const mockQueueAdd = jest.fn().mockResolvedValue({ id: "test-job-id" });
const mockQueueGetJob = jest.fn();
const mockQueueInstance = {
    add: mockQueueAdd,
    getJob: mockQueueGetJob,
};

const mockWorkerOn = jest.fn();
const mockWorkerClose = jest.fn();

// Mock BullMQ
jest.mock("bullmq", () => ({
    Queue: jest.fn().mockImplementation(() => mockQueueInstance),
    Worker: jest.fn().mockImplementation(() => ({
        on: mockWorkerOn,
        close: mockWorkerClose,
    })),
    Job: jest.fn(),
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

jest.mock("stripe", () => {
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
const mockStripeRetrieve = jest.fn();
const mockStripeCapture = jest.fn();
jest.mock("../../src/utils/stripe", () => ({
    getStripeClient: jest.fn().mockReturnValue({
        paymentIntents: {
            retrieve: mockStripeRetrieve,
            capture: mockStripeCapture,
        },
    }),
}));

// Remove top-level require
// const { ... } = require("../../src/lib/payment-capture-queue");

describe("payment-capture-queue", () => {
    const originalEnv = process.env;
    let mockContainer: any;
    let mockQueryGraph: jest.Mock;
    
    // Module functions under test
    let getPaymentCaptureQueue: any;
    let schedulePaymentCapture: any;
    let cancelPaymentCaptureJob: any;
    let startPaymentCaptureWorker: any;
    let fetchOrderTotal: any;
    let processPaymentCapture: any;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.resetModules();
        process.env = { ...originalEnv };
        process.env.REDIS_URL = "redis://localhost:6379";
        
        // Mock console to keep tests clean
        jest.spyOn(console, "log").mockImplementation(() => {});
        jest.spyOn(console, "warn").mockImplementation(() => {});
        jest.spyOn(console, "error").mockImplementation(() => {});

        // Setup mock container with query and order services
        mockQueryGraph = jest.fn();
        const mockUpdateOrders = jest.fn().mockResolvedValue({});
        (global as any).mockUpdateOrders = mockUpdateOrders; // Expose for test assertions
        mockContainer = {
            resolve: jest.fn((serviceName: string) => {
                if (serviceName === "query") {
                    return { graph: mockQueryGraph };
                }
                if (serviceName === "order") {
                    return { updateOrders: mockUpdateOrders };
                }
                return {};
            })
        };

        // Import the module under test FRESH for each test
        const mod = require("../../src/lib/payment-capture-queue");
        getPaymentCaptureQueue = mod.getPaymentCaptureQueue;
        schedulePaymentCapture = mod.schedulePaymentCapture;
        cancelPaymentCaptureJob = mod.cancelPaymentCaptureJob;
        startPaymentCaptureWorker = mod.startPaymentCaptureWorker;
        fetchOrderTotal = mod.fetchOrderTotal;
        processPaymentCapture = mod.processPaymentCapture;
    });

    afterEach(() => {
        process.env = originalEnv;
        jest.restoreAllMocks();
    });

    describe("fetchOrderTotal (Story 2.3)", () => {
        // H1. Missing Tests for fetchOrderTotal

        it("should return null if container is not initialized", async () => {
            // Ensure worker hasn't started (containerRef null)
            const result = await fetchOrderTotal("ord_123");
            expect(result).toBeNull();
            expect(console.error).toHaveBeenCalledWith(expect.stringContaining("Container not initialized"));
        });
        
        // ... rest of tests use fetchOrderTotal from closure ...

        it("should return null if order is not found", async () => {
            // Initialize container
            startPaymentCaptureWorker(mockContainer);
            mockQueryGraph.mockResolvedValue({ data: [] });

            const result = await fetchOrderTotal("ord_missing");
            expect(result).toBeNull();
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
                data: [{ id: "ord_valid", total: 5000, currency_code: "usd", status: "pending" }] 
            });

            const result = await fetchOrderTotal("ord_valid");
            expect(result).toEqual({ totalCents: 5000, currencyCode: "usd", status: "pending" });
        });
    });

    describe("processPaymentCapture (Story 2.3)", () => {
        // H2. Missing Tests for processPaymentCapture Dynamic Amount Logic

        const mockJobData = {
            orderId: "ord_123",
            paymentIntentId: "pi_123",
            scheduledAt: 100000,
        };
        const mockJob: Partial<Job> = { data: mockJobData };

        beforeEach(() => {
            // Ensure container is initialized for all these tests
            startPaymentCaptureWorker(mockContainer);
        });

        it("should capture dynamic amount when order fetch succeeds (Normal Flow)", async () => {
            // Setup: PaymentIntent = 5000, Order = 5000
            mockStripeRetrieve.mockResolvedValue({ 
                id: "pi_123", 
                status: "requires_capture", 
                amount: 5000, 
                currency: "usd" 
            });
            mockQueryGraph.mockResolvedValue({ 
                data: [{ id: "ord_123", total: 5000, currency_code: "usd" }] 
            });
            mockStripeCapture.mockResolvedValue({ status: "succeeded" });

            await processPaymentCapture(mockJob as Job);

            // Verify capture called with 5000 and idempotency key
            expect(mockStripeCapture).toHaveBeenCalledWith(
                "pi_123", 
                { amount_to_capture: 5000 }, 
                expect.objectContaining({ idempotencyKey: "capture_ord_123_100000" })
            );
        });

        it("should capture partial amount when order total < authorized (Partial)", async () => {
            // Setup: PaymentIntent = 5000, Order = 4000 (item removed)
            mockStripeRetrieve.mockResolvedValue({ 
                id: "pi_123", 
                status: "requires_capture", 
                amount: 5000, 
                currency: "usd" 
            });
            mockQueryGraph.mockResolvedValue({ 
                data: [{ id: "ord_123", total: 4000, currency_code: "usd" }] 
            });
            mockStripeCapture.mockResolvedValue({ status: "succeeded" });

            await processPaymentCapture(mockJob as Job);

            expect(mockStripeCapture).toHaveBeenCalledWith(
                "pi_123", 
                { amount_to_capture: 4000 }, 
                expect.any(Object)
            );
            expect(console.log).toHaveBeenCalledWith(expect.stringContaining("released 1000 cents"));
        });

        it("should throw error when order total > authorized (Excess)", async () => {
            // Setup: PaymentIntent = 5000, Order = 6000 (item added/price changed)
            mockStripeRetrieve.mockResolvedValue({ 
                id: "pi_123", 
                status: "requires_capture", 
                amount: 5000, 
                currency: "usd" 
            });
            mockQueryGraph.mockResolvedValue({ 
                data: [{ id: "ord_123", total: 6000, currency_code: "usd" }] 
            });

            await expect(processPaymentCapture(mockJob as Job))
                .rejects.toThrow("exceeds authorized amount");
            
            expect(mockStripeCapture).not.toHaveBeenCalled();
            expect(console.error).toHaveBeenCalledWith(expect.stringContaining("Manual intervention required"));
        });

        it("should throw error on currency mismatch (M2 Fix)", async () => {
            // Setup: PaymentIntent = USD, Order = EUR
            mockStripeRetrieve.mockResolvedValue({ 
                id: "pi_123", 
                status: "requires_capture", 
                amount: 5000, 
                currency: "usd" 
            });
            mockQueryGraph.mockResolvedValue({ 
                data: [{ id: "ord_123", total: 5000, currency_code: "eur" }] 
            });

            await expect(processPaymentCapture(mockJob as Job))
                .rejects.toThrow("Currency mismatch");
            
            expect(console.error).toHaveBeenCalledWith(expect.stringContaining("Currency mismatch"));
            expect(mockStripeCapture).not.toHaveBeenCalled();
        });

        it("should fallback to original amount if order fetch fails", async () => {
            // Setup: PaymentIntent = 5000, Order fetch fails (returns null)
            mockStripeRetrieve.mockResolvedValue({ 
                id: "pi_123", 
                status: "requires_capture", 
                amount: 5000, 
                currency: "usd" 
            });
            // Simulate fetch failure
            mockQueryGraph.mockResolvedValue({ data: [] }); // not found
            // Or make fetchOrderTotal throw/fail inside. 
            // In our impl, if graph returns [], fetchOrderTotal returns null.
            
            mockStripeCapture.mockResolvedValue({ status: "succeeded" });

            await processPaymentCapture(mockJob as Job);

            expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("Could not fetch order total"));

            // Capture called without amount_to_capture (full capture)
            expect(mockStripeCapture).toHaveBeenCalledWith(
                "pi_123", 
                {}, 
                expect.any(Object)
            );
        });

        it("should handle Stripe amount_too_large error (M3 Fix)", async () => {
             mockStripeRetrieve.mockResolvedValue({
                id: "pi_123", 
                status: "requires_capture", 
                amount: 5000, 
                currency: "usd" 
            });
            mockQueryGraph.mockResolvedValue({ 
                data: [{ id: "ord_123", total: 5000, currency_code: "usd" }] 
            });

            // Create error with type/code properties (robust property-based check)
            const stripeError = new Error("Amount too large") as any;
            stripeError.type = "invalid_request_error";
            stripeError.code = "amount_too_large";
            
            mockStripeCapture.mockRejectedValue(stripeError);

            await expect(processPaymentCapture(mockJob as Job))
                .rejects.toThrow("Amount too large");
            
            // Should log CRITICAL error with the error object (no double logging)
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
            mockStripeRetrieve.mockResolvedValue({ status: "succeeded" });
            await processPaymentCapture(mockJob as Job);
            expect(console.log).toHaveBeenCalledWith(expect.stringContaining("already captured"));
            expect(mockStripeCapture).not.toHaveBeenCalled();
        });

        // Code Review Fix: Test for canceled order guard
        it("should skip capture if order is canceled in Medusa", async () => {
            mockStripeRetrieve.mockResolvedValue({ status: "requires_capture", amount: 1000, currency: "usd" });
            mockQueryGraph.mockResolvedValue({
                data: [{ id: "ord_123", total: 1000, currency_code: "usd", status: "canceled" }]
            });

            await processPaymentCapture(mockJob as Job);

            // Should log critical error about canceled order
            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining("canceled in Medusa")
            );
            expect(console.log).toHaveBeenCalledWith(expect.stringContaining("capture_blocked_canceled_order"));
            // Should NOT capture
            expect(mockStripeCapture).not.toHaveBeenCalled();
        });

        // Code Review Fix: Test for order metadata update after capture
        it("should update order metadata after successful capture", async () => {
            mockStripeRetrieve.mockResolvedValue({ status: "requires_capture", amount: 1000, currency: "usd" });
            mockQueryGraph.mockResolvedValue({
                data: [{ id: "ord_123", total: 1000, currency_code: "usd", status: "pending" }]
            });
            mockStripeCapture.mockResolvedValue({ status: "succeeded" });

            await processPaymentCapture(mockJob as Job);

            // Should have called updateOrders to set metadata
            expect((global as any).mockUpdateOrders).toHaveBeenCalledWith([
                expect.objectContaining({
                    id: "ord_123",
                    metadata: expect.objectContaining({
                        payment_captured_at: expect.any(String),
                        payment_amount_captured: 1000,
                    }),
                })
            ]);
        });
    });

    describe("Queue & Worker (Story 2.2 Coverage)", () => {
        // Keep existing coverage for completeness logic
        it("should schedule job correctly", async () => {
            await schedulePaymentCapture("ord_1", "pi_1");
            expect(mockQueueAdd).toHaveBeenCalled();
        });
    });
});
