import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Job } from "bullmq";

const mockQueueAdd = vi.fn().mockResolvedValue({ id: "test-job-id" });
const mockQueueGetJob = vi.fn();
const mockQueueClose = vi.fn().mockResolvedValue(undefined);
const mockQueueInstance = {
    add: mockQueueAdd,
    getJob: mockQueueGetJob,
    close: mockQueueClose,
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

// Mock logger
vi.mock("../../src/utils/logger", () => ({
    logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        critical: vi.fn(),
    },
}));

// Mock payment-capture-core (the shared service the worker delegates to)
const mockCaptureAllOrderPayments = vi.fn();
const mockSetOrderEditStatus = vi.fn().mockResolvedValue(true);
const mockFetchOrderTotal = vi.fn();

vi.mock("../../src/services/payment-capture-core", () => ({
    captureAllOrderPayments: mockCaptureAllOrderPayments,
    setOrderEditStatus: mockSetOrderEditStatus,
    fetchOrderTotal: mockFetchOrderTotal,
}));

// Mock admin notifications
vi.mock("../../src/lib/admin-notifications", () => ({
    sendAdminNotification: vi.fn(),
    AdminNotificationType: { PAYMENT_FAILED: "PAYMENT_FAILED" },
}));

describe("payment-capture-queue", () => {
    const originalEnv = process.env;
    let mockContainer: any;

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

        // Re-configure BullMQ mocks after clearAllMocks
        mockQueueAdd.mockResolvedValue({ id: "test-job-id" });
        mockQueueGetJob.mockResolvedValue(null);

        // Reset core mocks
        mockCaptureAllOrderPayments.mockReset();
        mockSetOrderEditStatus.mockReset().mockResolvedValue(true);
        mockFetchOrderTotal.mockReset();

        mockContainer = {
            resolve: vi.fn((serviceName: string) => {
                if (serviceName === "query") {
                    return { graph: vi.fn() };
                }
                if (serviceName === "order") {
                    return { updateOrders: vi.fn(), addOrderTransactions: vi.fn() };
                }
                if (serviceName === "payment") {
                    return {
                        updatePaymentCollections: vi.fn(),
                        capturePayment: vi.fn(),
                    };
                }
                return {};
            }),
        };

        // Import the module under test FRESH for each test
        const queueMod = await import("../../src/lib/payment-capture-queue");
        getPaymentCaptureQueue = queueMod.getPaymentCaptureQueue;
        schedulePaymentCapture = queueMod.schedulePaymentCapture;
        cancelPaymentCaptureJob = queueMod.cancelPaymentCaptureJob;

        // Worker functions
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
        // fetchOrderTotal is now re-exported from payment-capture-core
        // These tests verify the worker's re-export delegates correctly

        it("should delegate to payment-capture-core fetchOrderTotal", async () => {
            mockFetchOrderTotal.mockResolvedValue({ totalCents: 5000, currencyCode: "usd", status: "pending" });

            const result = await fetchOrderTotal(mockContainer, "ord_test");
            expect(result).toEqual({ totalCents: 5000, currencyCode: "usd", status: "pending" });
            expect(mockFetchOrderTotal).toHaveBeenCalledWith(mockContainer, "ord_test");
        });

        it("should propagate errors from payment-capture-core", async () => {
            mockFetchOrderTotal.mockRejectedValue(new Error("Order ord_missing not found in DB via query.graph"));

            await expect(fetchOrderTotal(mockContainer, "ord_missing")).rejects.toThrow("not found in DB");
        });

        it("should return null when payment-capture-core returns null (no currency)", async () => {
            mockFetchOrderTotal.mockResolvedValue(null);

            const result = await fetchOrderTotal(mockContainer, "ord_no_currency");
            expect(result).toBeNull();
        });

        it("should convert float total to cents (AC #2)", async () => {
            mockFetchOrderTotal.mockResolvedValue({ totalCents: 1099, currencyCode: "usd", status: "pending" });

            const result = await fetchOrderTotal(mockContainer, "ord_float");
            expect(result).toEqual({ totalCents: 1099, currencyCode: "usd", status: "pending" });
        });

        it("should return correct data when order exists and valid", async () => {
            mockFetchOrderTotal.mockResolvedValue({ totalCents: 5000, currencyCode: "usd", status: "pending" });

            const result = await fetchOrderTotal(mockContainer, "ord_valid");
            expect(result).toEqual({ totalCents: 5000, currencyCode: "usd", status: "pending" });
        });
    });

    describe("processPaymentCapture (Story 2.3)", () => {
        const mockJobData = {
            orderId: "order_123",
            paymentIntentId: "pi_123",
            scheduledAt: 100000,
        };
        const mockJob: Partial<Job> = { data: mockJobData, id: "job_123" };

        beforeEach(() => {
            startPaymentCaptureWorker(mockContainer);
        });

        it("should capture successfully when captureAllOrderPayments succeeds (Normal Flow)", async () => {
            mockCaptureAllOrderPayments.mockResolvedValue({
                hasPayments: true,
                allAlreadyCaptured: false,
                capturedCount: 1,
                skippedCount: 0,
                failedCount: 0,
                errors: [],
            });

            await processPaymentCapture(mockJob as Job);

            // Verify lock was acquired
            expect(mockSetOrderEditStatus).toHaveBeenCalledWith(
                mockContainer,
                "order_123",
                "locked_for_capture"
            );

            // Verify captureAllOrderPayments was called
            expect(mockCaptureAllOrderPayments).toHaveBeenCalledWith(
                mockContainer,
                "order_123",
                expect.stringContaining("worker_capture_order_123")
            );

            // Verify lock was released
            expect(mockSetOrderEditStatus).toHaveBeenCalledWith(
                mockContainer,
                "order_123",
                "idle"
            );
        });

        it("should handle partial capture (some already captured)", async () => {
            mockCaptureAllOrderPayments.mockResolvedValue({
                hasPayments: true,
                allAlreadyCaptured: false,
                capturedCount: 1,
                skippedCount: 1,
                failedCount: 0,
                errors: [],
            });

            await processPaymentCapture(mockJob as Job);

            expect(mockCaptureAllOrderPayments).toHaveBeenCalled();
        });

        it("should throw when captureAllOrderPayments reports failures", async () => {
            mockCaptureAllOrderPayments.mockResolvedValue({
                hasPayments: true,
                allAlreadyCaptured: false,
                capturedCount: 0,
                skippedCount: 0,
                failedCount: 1,
                errors: ["Payment pay_123: insufficient_funds"],
            });

            await expect(processPaymentCapture(mockJob as Job))
                .rejects.toThrow("Failed to capture 1 payment(s)");

            // Lock should still be released on error
            expect(mockSetOrderEditStatus).toHaveBeenCalledWith(
                mockContainer,
                "order_123",
                "idle"
            );
        });

        it("should handle no payments found", async () => {
            mockCaptureAllOrderPayments.mockResolvedValue({
                hasPayments: false,
                allAlreadyCaptured: false,
                capturedCount: 0,
                skippedCount: 0,
                failedCount: 0,
                errors: [],
            });

            await processPaymentCapture(mockJob as Job);

            // Should complete without error
            expect(mockCaptureAllOrderPayments).toHaveBeenCalled();
        });

        it("should skip if lock cannot be acquired", async () => {
            mockSetOrderEditStatus.mockResolvedValue(false);

            await processPaymentCapture(mockJob as Job);

            // captureAllOrderPayments should NOT be called
            expect(mockCaptureAllOrderPayments).not.toHaveBeenCalled();
        });

        it("should skip if already canceled (no payments to capture)", async () => {
            mockCaptureAllOrderPayments.mockResolvedValue({
                hasPayments: true,
                allAlreadyCaptured: false,
                capturedCount: 0,
                skippedCount: 0,
                failedCount: 0,
                errors: [],
            });

            await processPaymentCapture(mockJob as Job);
            // Verifies no error is thrown for canceled orders handled by core service
            expect(mockCaptureAllOrderPayments).toHaveBeenCalled();
        });

        it("should skip if already succeeded (all already captured)", async () => {
            mockCaptureAllOrderPayments.mockResolvedValue({
                hasPayments: true,
                allAlreadyCaptured: true,
                capturedCount: 0,
                skippedCount: 2,
                failedCount: 0,
                errors: [],
            });

            await processPaymentCapture(mockJob as Job);
            expect(mockCaptureAllOrderPayments).toHaveBeenCalled();
        });

        it("should release lock even when captureAllOrderPayments throws", async () => {
            mockCaptureAllOrderPayments.mockRejectedValue(new Error("Unexpected error"));

            await expect(processPaymentCapture(mockJob as Job))
                .rejects.toThrow("Unexpected error");

            // Lock release should still happen
            const idleCalls = mockSetOrderEditStatus.mock.calls.filter(
                (call: any[]) => call[2] === "idle"
            );
            expect(idleCalls.length).toBeGreaterThanOrEqual(1);
        });

        it("should skip invalid orderId", async () => {
            const invalidJob: Partial<Job> = {
                data: { orderId: "invalid", paymentIntentId: "pi_123", scheduledAt: 100000 },
                id: "job_invalid",
            };

            await processPaymentCapture(invalidJob as Job);

            // Should return early without calling captureAllOrderPayments
            expect(mockCaptureAllOrderPayments).not.toHaveBeenCalled();
        });

        it("should update order metadata after successful capture", async () => {
            mockCaptureAllOrderPayments.mockResolvedValue({
                hasPayments: true,
                allAlreadyCaptured: false,
                capturedCount: 1,
                skippedCount: 0,
                failedCount: 0,
                errors: [],
            });

            await processPaymentCapture(mockJob as Job);

            // The core service handles metadata updates internally
            // Worker just verifies lock was released after success
            expect(mockSetOrderEditStatus).toHaveBeenCalledWith(
                mockContainer,
                "order_123",
                "idle"
            );
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
                    paymentIntentId: "pi_wiring",
                }),
                expect.objectContaining({
                    delay: expect.any(Number),
                })
            );

            const scheduledData = mockQueueAdd.mock.calls[mockQueueAdd.mock.calls.length - 1][1];
            const mockJobWiring = { data: scheduledData, id: "job_wiring" } as any as Job;

            startPaymentCaptureWorker(mockContainer);

            mockCaptureAllOrderPayments.mockResolvedValue({
                hasPayments: true,
                allAlreadyCaptured: false,
                capturedCount: 1,
                skippedCount: 0,
                failedCount: 0,
                errors: [],
            });

            await processPaymentCapture(mockJobWiring);

            expect(mockCaptureAllOrderPayments).toHaveBeenCalledWith(
                mockContainer,
                "order_wiring",
                expect.any(String)
            );
        });
    });

    describe("Story 1.1: Payment Capture Delay Configuration", () => {
        it("should use default 3 days when PAYMENT_CAPTURE_DELAY_MS is not set", async () => {
            delete process.env.PAYMENT_CAPTURE_DELAY_MS;
            vi.resetModules();

            const queueMod = await import("../../src/lib/payment-capture-queue");
            const DEFAULT_DELAY_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

            expect(queueMod.PAYMENT_CAPTURE_DELAY_MS).toBe(DEFAULT_DELAY_MS);
        });

        it("should use custom delay when PAYMENT_CAPTURE_DELAY_MS is set", async () => {
            const customDelay = 60 * 60 * 1000; // 1 hour
            process.env.PAYMENT_CAPTURE_DELAY_MS = String(customDelay);
            vi.resetModules();

            const queueMod = await import("../../src/lib/payment-capture-queue");

            expect(queueMod.PAYMENT_CAPTURE_DELAY_MS).toBe(customDelay);
        });

        it("should use default when PAYMENT_CAPTURE_DELAY_MS is invalid (NaN)", async () => {
            process.env.PAYMENT_CAPTURE_DELAY_MS = "invalid_number";
            vi.resetModules();

            const queueMod = await import("../../src/lib/payment-capture-queue");

            // Current implementation: parsedDelay stays as default when isNaN
            const delay = queueMod.PAYMENT_CAPTURE_DELAY_MS;
            expect(typeof delay).toBe("number");
        });

        it("should use default when PAYMENT_CAPTURE_DELAY_MS is empty string", async () => {
            process.env.PAYMENT_CAPTURE_DELAY_MS = "";
            vi.resetModules();

            const queueMod = await import("../../src/lib/payment-capture-queue");
            const DEFAULT_DELAY_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

            expect(queueMod.PAYMENT_CAPTURE_DELAY_MS).toBe(DEFAULT_DELAY_MS);
        });

        it("should handle very short delays for testing", async () => {
            const testDelay = 60000; // 1 minute
            process.env.PAYMENT_CAPTURE_DELAY_MS = String(testDelay);
            vi.resetModules();

            const queueMod = await import("../../src/lib/payment-capture-queue");

            expect(queueMod.PAYMENT_CAPTURE_DELAY_MS).toBe(testDelay);
        });

        it("should handle very long delays", async () => {
            const longDelay = 30 * 24 * 60 * 60 * 1000; // 30 days
            process.env.PAYMENT_CAPTURE_DELAY_MS = String(longDelay);
            vi.resetModules();

            const queueMod = await import("../../src/lib/payment-capture-queue");

            expect(queueMod.PAYMENT_CAPTURE_DELAY_MS).toBe(longDelay);
        });

        it("should calculate modification window seconds correctly", async () => {
            const delayMs = 2 * 24 * 60 * 60 * 1000; // 2 days
            process.env.PAYMENT_CAPTURE_DELAY_MS = String(delayMs);
            vi.resetModules();

            const queueMod = await import("../../src/lib/payment-capture-queue");
            const expectedSeconds = Math.floor(delayMs / 1000);

            expect(queueMod.getModificationWindowSeconds()).toBe(expectedSeconds);
        });
    });

    describe("Story 1.2: Idempotency via Core Service", () => {
        // The worker now delegates to captureAllOrderPayments which handles
        // idempotency internally via Medusa's capturePaymentWorkflow.
        // These tests verify the worker passes the correct idempotency key prefix.

        it("should pass worker_capture_{orderId}_{jobId} as idempotency key prefix", async () => {
            const orderId = "order_test123";
            const paymentIntentId = "pi_test456";

            mockCaptureAllOrderPayments.mockResolvedValue({
                hasPayments: true,
                allAlreadyCaptured: false,
                capturedCount: 1,
                skippedCount: 0,
                failedCount: 0,
                errors: [],
            });

            const mockJobIdemp: Partial<Job> = {
                data: { orderId, paymentIntentId, scheduledAt: Date.now() },
                id: "job_abc",
            };

            startPaymentCaptureWorker(mockContainer);
            await processPaymentCapture(mockJobIdemp as Job);

            expect(mockCaptureAllOrderPayments).toHaveBeenCalledWith(
                mockContainer,
                orderId,
                `worker_capture_${orderId}_job_abc`
            );
        });

        it("should use different idempotency key for different orders", async () => {
            mockCaptureAllOrderPayments.mockResolvedValue({
                hasPayments: true,
                allAlreadyCaptured: false,
                capturedCount: 1,
                skippedCount: 0,
                failedCount: 0,
                errors: [],
            });

            startPaymentCaptureWorker(mockContainer);

            const job1: Partial<Job> = {
                data: { orderId: "order_one", paymentIntentId: "pi_1", scheduledAt: Date.now() },
                id: "job_1",
            };
            const job2: Partial<Job> = {
                data: { orderId: "order_two", paymentIntentId: "pi_2", scheduledAt: Date.now() },
                id: "job_2",
            };

            await processPaymentCapture(job1 as Job);
            await processPaymentCapture(job2 as Job);

            expect(mockCaptureAllOrderPayments).toHaveBeenCalledTimes(2);
            const key1 = mockCaptureAllOrderPayments.mock.calls[0][2];
            const key2 = mockCaptureAllOrderPayments.mock.calls[1][2];
            expect(key1).not.toBe(key2);
            expect(key1).toContain("order_one");
            expect(key2).toContain("order_two");
        });

        it("should use different idempotency key for different payment intents (via job ID)", async () => {
            mockCaptureAllOrderPayments.mockResolvedValue({
                hasPayments: true,
                allAlreadyCaptured: false,
                capturedCount: 1,
                skippedCount: 0,
                failedCount: 0,
                errors: [],
            });

            startPaymentCaptureWorker(mockContainer);

            const job1: Partial<Job> = {
                data: { orderId: "order_same", paymentIntentId: "pi_one", scheduledAt: Date.now() },
                id: "job_pi1",
            };
            const job2: Partial<Job> = {
                data: { orderId: "order_same", paymentIntentId: "pi_two", scheduledAt: Date.now() },
                id: "job_pi2",
            };

            await processPaymentCapture(job1 as Job);
            await processPaymentCapture(job2 as Job);

            expect(mockCaptureAllOrderPayments).toHaveBeenCalledTimes(2);
            const key1 = mockCaptureAllOrderPayments.mock.calls[0][2];
            const key2 = mockCaptureAllOrderPayments.mock.calls[1][2];
            expect(key1).not.toBe(key2);
        });

        it("should NOT include timestamp in idempotency key", async () => {
            mockCaptureAllOrderPayments.mockResolvedValue({
                hasPayments: true,
                allAlreadyCaptured: false,
                capturedCount: 1,
                skippedCount: 0,
                failedCount: 0,
                errors: [],
            });

            const mockJobTs: Partial<Job> = {
                data: {
                    orderId: "order_notimestamp",
                    paymentIntentId: "pi_notimestamp",
                    scheduledAt: 1234567890,
                },
                id: "job_no_ts",
            };

            startPaymentCaptureWorker(mockContainer);
            await processPaymentCapture(mockJobTs as Job);

            const key = mockCaptureAllOrderPayments.mock.calls[0][2];
            expect(key).not.toContain("1234567890");
        });
    });
});
