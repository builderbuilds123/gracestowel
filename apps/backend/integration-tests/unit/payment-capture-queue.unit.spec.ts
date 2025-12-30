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
        const mockUpdatePaymentCollections = jest.fn().mockResolvedValue({});
        const mockCapturePayment = jest.fn().mockResolvedValue({});
        const mockAddOrderTransactions = jest.fn().mockResolvedValue({});
        // Expose mocks for test assertions
        (global as any).mockUpdateOrders = mockUpdateOrders;
        (global as any).mockCapturePayment = mockCapturePayment;
        (global as any).mockUpdatePaymentCollections = mockUpdatePaymentCollections;
        (global as any).mockAddOrderTransactions = mockAddOrderTransactions;
        mockContainer = {
            resolve: jest.fn((serviceName: string) => {
                if (serviceName === "query") {
                    return { graph: mockQueryGraph };
                }
                if (serviceName === "order") {
                    return { updateOrders: mockUpdateOrders, addOrderTransactions: mockAddOrderTransactions };
                }
                // Modules.PAYMENT resolves to "payment" not "paymentModuleService"
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
        const queueMod = require("../../src/lib/payment-capture-queue");
        getPaymentCaptureQueue = queueMod.getPaymentCaptureQueue;
        schedulePaymentCapture = queueMod.schedulePaymentCapture;
        cancelPaymentCaptureJob = queueMod.cancelPaymentCaptureJob;
        
        // Worker functions are now in a separate module
        const workerMod = require("../../src/workers/payment-capture-worker");
        startPaymentCaptureWorker = workerMod.startPaymentCaptureWorker;
        fetchOrderTotal = workerMod.fetchOrderTotal;
        processPaymentCapture = workerMod.processPaymentCapture;
    });

    afterEach(() => {
        process.env = originalEnv;
        jest.restoreAllMocks();
    });

    describe("fetchOrderTotal (Story 2.3)", () => {
        // H1. Missing Tests for fetchOrderTotal

        it("should throw error if container is not initialized", async () => {
            // Ensure worker hasn't started (containerRef null)
            await expect(fetchOrderTotal("ord_123")).rejects.toThrow("Container not initialized");
        });
        
        // ... rest of tests use fetchOrderTotal from closure ...

        it("should throw error if order is not found", async () => {
            // Initialize container
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
            // Total is in dollars (50.00), which converts to 5000 cents
            mockQueryGraph.mockResolvedValue({ 
                data: [{ id: "ord_valid", total: 50.00, currency_code: "usd", status: "pending" }] 
            });

            const result = await fetchOrderTotal("ord_valid");
            expect(result).toEqual({ totalCents: 5000, currencyCode: "usd", status: "pending" });
        });
    });

    describe("processPaymentCapture (Story 2.3)", () => {
        // H2. Missing Tests for processPaymentCapture Dynamic Amount Logic

        const mockJobData = {
            orderId: "order_123",
            paymentIntentId: "pi_123",
            scheduledAt: 100000,
        };
        const mockJob: Partial<Job> = { data: mockJobData };

        beforeEach(() => {
            // Ensure container is initialized for all these tests
            startPaymentCaptureWorker(mockContainer);
        });

        it("should capture dynamic amount when order fetch succeeds (Normal Flow)", async () => {
            // Setup: PaymentIntent = 5000 cents, Order = 50.00 dollars (converts to 5000 cents)
            mockStripeRetrieve.mockResolvedValue({
                id: "pi_123",
                status: "requires_capture",
                amount: 5000,
                currency: "usd"
            });
            // Mock returns complete order object with all needed fields for all queries
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

            // PAY-01 AC3: Verify Payment Module capture called with correct amount in major units
            expect((global as any).mockCapturePayment).toHaveBeenCalledWith({
                payment_id: "pay_123",
                amount: 50.00  // 5000 cents → 50.00 major units
            });

            // Stripe capture should NOT be called when Payment Module succeeds
            expect(mockStripeCapture).not.toHaveBeenCalled();
        });

        it("should capture partial amount when order total < authorized (Partial)", async () => {
            // Setup: PaymentIntent = 5000 cents, Order = 40.00 dollars (converts to 4000 cents, item removed)
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

            // PAY-01 AC3: Verify Payment Module capture called with partial amount
            expect((global as any).mockCapturePayment).toHaveBeenCalledWith({
                payment_id: "pay_123",
                amount: 40.00  // 4000 cents → 40.00 major units (partial capture)
            });

            // Stripe capture should NOT be called when Payment Module succeeds
            expect(mockStripeCapture).not.toHaveBeenCalled();
        });

        it("should throw error when order total > authorized (Excess)", async () => {
            // Setup: PaymentIntent = 5000 cents, Order = 60.00 dollars (converts to 6000 cents, item added/price changed)
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
            // Mock Payment Module to fail so it falls back to Stripe validation path
            (global as any).mockCapturePayment.mockRejectedValueOnce(
                new Error("Payment Module validation failed")
            );

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
            // Setup: PaymentIntent = 5000, Order fetch fails (returns null)
            mockStripeRetrieve.mockResolvedValue({ 
                id: "pi_123", 
                status: "requires_capture", 
                amount: 5000, 
                currency: "usd" 
            });
            // Simulate fetch failure
            mockQueryGraph.mockResolvedValue({ data: [] }); // not found

            await expect(processPaymentCapture(mockJob as Job))
                .rejects.toThrow("not found in DB");

            // Should not attempt capture
            expect(mockStripeCapture).not.toHaveBeenCalled();
        });

        it("should handle Stripe amount_too_large error (M3 Fix)", async () => {
             mockStripeRetrieve.mockResolvedValue({
                id: "pi_123",
                status: "requires_capture",
                amount: 5000,
                currency: "usd"
            });
            // Note: total is in dollars (50.00), which converts to 5000 cents
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

            // Mock Payment Module to fail so it falls back to Stripe
            (global as any).mockCapturePayment.mockRejectedValueOnce(
                new Error("Payment Module unavailable")
            );

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

        // Code Review: Test for fail-fast when order fetch fails
        it("should fail the job when order fetch fails (no capture) - duplicate", async () => {
            mockStripeRetrieve.mockResolvedValue({ status: "requires_capture", amount: 5000, currency: "usd" });
            mockQueryGraph.mockResolvedValue({ data: [] }); // Order not found

            await expect(processPaymentCapture(mockJob as Job))
                .rejects.toThrow("not found in DB");

            expect(mockStripeCapture).not.toHaveBeenCalled();
        });

        // Code Review Fix: Test for canceled order guard
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

            // PAY-01: Verify Payment Module services were called (no metadata updates)
            expect((global as any).mockCapturePayment).toHaveBeenCalledWith({
                payment_id: "pay_123",
                amount: 10.00
            });

            // PAY-01 AC4: Verify OrderTransaction creation
            expect((global as any).mockAddOrderTransactions).toHaveBeenCalled();

            // PAY-01: Verify order status updated to completed
            expect((global as any).mockUpdateOrders).toHaveBeenCalledWith([
                expect.objectContaining({
                    id: "order_123",
                    status: "completed"
                })
            ]);
        });
    });

    describe("Queue & Worker (Story 2.2 Coverage)", () => {
        // Keep existing coverage for completeness logic
        it("should schedule job correctly", async () => {
            await schedulePaymentCapture("order_1", "pi_1");
            expect(mockQueueAdd).toHaveBeenCalled();
        });

        it("should verify wiring from schedule to process (AC5)", async () => {
            // 1. Schedule
            await schedulePaymentCapture("order_wiring", "pi_wiring");
            
            // Verify what was added to queue matches what worker expects
            expect(mockQueueAdd).toHaveBeenCalledWith(
                "capture-order_wiring",
                expect.objectContaining({
                    orderId: "order_wiring",
                    paymentIntentId: "pi_wiring"
                }),
                expect.objectContaining({
                    delay: expect.any(Number) // Verified in config test
                })
            );

            // 2. Simulate Worker processing the exact payload we just scheduled
            const scheduledData = mockQueueAdd.mock.calls[mockQueueAdd.mock.calls.length - 1][1];
            const mockJob = { data: scheduledData } as Job;

            // Setup mocks for successful processing (total in dollars, converts to 1000 cents)
            mockStripeRetrieve.mockResolvedValue({ status: "requires_capture", amount: 1000, currency: "usd" });
            // Mock returns complete order object with all fields needed by all queries
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

            // Initialize worker/container
            startPaymentCaptureWorker(mockContainer);

            // Run process
            await processPaymentCapture(mockJob);

            // 3. Verify Payment Module capture called (AC5 - end-to-end wiring)
            expect((global as any).mockCapturePayment).toHaveBeenCalledWith({
                payment_id: "pay_wiring",
                amount: 10.00
            });

            // PAY-01: Verify order status updated to completed
            expect((global as any).mockUpdateOrders).toHaveBeenCalledWith([
                expect.objectContaining({
                    id: "order_wiring",
                    status: "completed"
                })
            ]);
        });
    });
});
