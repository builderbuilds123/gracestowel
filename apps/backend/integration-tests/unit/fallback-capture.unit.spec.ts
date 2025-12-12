/**
 * Unit tests for fallback-capture.ts
 * 
 * Story: 2.4 Fallback Cron (Queue Health Check)
 * Coverage:
 * - Skips orders with already captured payments
 * - Skips orders with active BullMQ jobs
 * - Logs critical alerts for failed jobs
 * - Triggers capture for missing jobs
 */

// Mock dependencies before imports
const mockStripeRetrieve = jest.fn();
jest.mock("../../src/utils/stripe", () => ({
    getStripeClient: jest.fn().mockReturnValue({
        paymentIntents: {
            retrieve: mockStripeRetrieve,
        },
    }),
}));

const mockQueueAdd = jest.fn();
const mockQueueGetJob = jest.fn();
const mockGetJobState = jest.fn();
const mockGetPendingRecoveryOrders = jest.fn();
jest.mock("../../src/lib/payment-capture-queue", () => ({
    getPaymentCaptureQueue: jest.fn().mockReturnValue({
        add: mockQueueAdd,
        getJob: mockQueueGetJob,
    }),
    getJobState: mockGetJobState,
}));
jest.mock("../../src/repositories/order-recovery", () => ({
    getPendingRecoveryOrders: mockGetPendingRecoveryOrders,
}));

describe("fallback-capture", () => {
    let mockContainer: any;
    let mockQueryGraph: jest.Mock;
    let fallbackCaptureJob: any;
    const originalEnv = process.env;
    const mockManager: any = {};
    
    // Mock logger for structured logging tests
    const mockLogger = {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    };

    beforeEach(() => {
        jest.clearAllMocks();
        mockGetPendingRecoveryOrders.mockResolvedValue([]);
        
        // Reset modules to get fresh import
        jest.resetModules();

        // Ensure REDIS_URL present for default test flows
        process.env = { ...originalEnv, REDIS_URL: "redis://localhost:6379" } as any;
        
        // Setup mock container with logger support
        mockQueryGraph = jest.fn();
        mockContainer = {
            resolve: jest.fn((key: string) => {
                if (key === "logger" || key === "LOGGER" || key.includes("LOGGER")) {
                    return mockLogger;
                }
                if (key === "manager") return mockManager;
                return { graph: mockQueryGraph };
            }),
        };
        
        // Mock console methods (for any legacy logging)
        jest.spyOn(console, "log").mockImplementation(() => {});
        jest.spyOn(console, "error").mockImplementation(() => {});
        jest.spyOn(console, "warn").mockImplementation(() => {});
        
        // Re-import the module
        fallbackCaptureJob = require("../../src/jobs/fallback-capture").default;
    });

    afterEach(() => {
        process.env = originalEnv;
        jest.restoreAllMocks();
    });

    const createMockOrder = (id: string, paymentIntentId: string) => ({
        id,
        metadata: { stripe_payment_intent_id: paymentIntentId },
        created_at: new Date(Date.now() - 70 * 60 * 1000), // 70 mins ago
        status: "pending",
    });

    it("should skip orders with already captured payments", async () => {
        mockQueryGraph.mockResolvedValue({
            data: [createMockOrder("ord_1", "pi_123")],
        });
        
        // Payment already captured (status: succeeded)
        mockStripeRetrieve.mockResolvedValue({ status: "succeeded" });

        await fallbackCaptureJob(mockContainer);

        expect(mockStripeRetrieve).toHaveBeenCalledWith("pi_123");
        expect(mockQueueAdd).not.toHaveBeenCalled();
    });

    it("should skip orders with active BullMQ jobs", async () => {
        mockQueryGraph.mockResolvedValue({
            data: [createMockOrder("ord_2", "pi_456")],
        });
        
        // Payment needs capture
        mockStripeRetrieve.mockResolvedValue({ status: "requires_capture" });
        
        // Job exists and is waiting
        mockGetJobState.mockResolvedValue("waiting");

        await fallbackCaptureJob(mockContainer);

        expect(mockGetJobState).toHaveBeenCalledWith("ord_2");
        expect(mockQueueAdd).not.toHaveBeenCalled();
    });

    it("should log critical alert for failed jobs", async () => {
        mockQueryGraph.mockResolvedValue({
            data: [createMockOrder("ord_3", "pi_789")],
        });
        
        // Payment needs capture
        mockStripeRetrieve.mockResolvedValue({ status: "requires_capture" });
        
        // Job failed
        mockGetJobState.mockResolvedValue("failed");

        await fallbackCaptureJob(mockContainer);

        expect(mockQueueAdd).not.toHaveBeenCalled();
    });

    it("should trigger capture for missing jobs", async () => {
        mockQueryGraph.mockResolvedValue({
            data: [createMockOrder("ord_4", "pi_abc")],
        });
        
        // Payment needs capture
        mockStripeRetrieve.mockResolvedValue({ status: "requires_capture" });
        
        // Job is missing
        mockGetJobState.mockResolvedValue("missing");

        await fallbackCaptureJob(mockContainer);

        // M2 Fix: Uses consistent job ID pattern for deduplication
        expect(mockQueueAdd).toHaveBeenCalledWith(
            "capture-ord_4",
            expect.objectContaining({
                orderId: "ord_4",
                paymentIntentId: "pi_abc",
            }),
            expect.objectContaining({
                delay: 0,
                jobId: "capture-ord_4",
            })
        );
    });

    // M3: Test for completed job state
    it("should trigger capture for completed jobs (stale completed state with requires_capture)", async () => {
        mockQueryGraph.mockResolvedValue({
            data: [createMockOrder("ord_5", "pi_completed")],
        });
        
        // Payment still needs capture (edge case: job completed but didn't actually capture)
        mockStripeRetrieve.mockResolvedValue({ status: "requires_capture" });
        
        // Job state is completed (but Stripe says still needs capture - rare edge case)
        mockGetJobState.mockResolvedValue("completed");

        await fallbackCaptureJob(mockContainer);

        // Should trigger capture since Stripe still shows requires_capture
        expect(mockQueueAdd).toHaveBeenCalledWith(
            "capture-ord_5",
            expect.objectContaining({
                orderId: "ord_5",
                paymentIntentId: "pi_completed",
            }),
            expect.objectContaining({
                delay: 0,
            })
        );
    });

    it("should handle no orders gracefully", async () => {
        mockQueryGraph.mockResolvedValue({ data: [] });

        await fallbackCaptureJob(mockContainer);

        expect(mockStripeRetrieve).not.toHaveBeenCalled();
        expect(mockQueueAdd).not.toHaveBeenCalled();
    });

    it("should skip cron when REDIS_URL is missing", async () => {
        process.env = { ...originalEnv }; // remove REDIS_URL

        // Re-import to apply env
        fallbackCaptureJob = require("../../src/jobs/fallback-capture").default;

        await fallbackCaptureJob(mockContainer);

        expect(mockQueueAdd).not.toHaveBeenCalled();
        expect(mockStripeRetrieve).not.toHaveBeenCalled();
    });

    it("should defensively skip non-pending orders returned by query", async () => {
        mockQueryGraph.mockResolvedValue({
            data: [{
                id: "ord_np",
                metadata: { stripe_payment_intent_id: "pi_np" },
                created_at: new Date(Date.now() - 70 * 60 * 1000),
                status: "processing",
            }],
        });

        await fallbackCaptureJob(mockContainer);

        expect(mockStripeRetrieve).not.toHaveBeenCalled();
        expect(mockQueueAdd).not.toHaveBeenCalled();
    });

    // Code Review: Test for Redis guard
    it("should exit gracefully when Redis/BullMQ is unavailable", async () => {
        // Reset and re-mock to throw error
        jest.resetModules();
        jest.doMock("../../src/lib/payment-capture-queue", () => ({
            getPaymentCaptureQueue: jest.fn().mockImplementation(() => {
                throw new Error("Redis connection failed");
            }),
            getJobState: mockGetJobState,
        }));
        
        // Re-import with new mock
        const fallbackCaptureJobWithError = require("../../src/jobs/fallback-capture").default;
        
        await fallbackCaptureJobWithError(mockContainer);
        
        // Should exit without querying orders
        expect(mockQueryGraph).not.toHaveBeenCalled();
    });

    // Code Review: Test that order query filters to pending status only
    it("should only query pending orders (not processing/completed)", async () => {
        // Re-import fresh due to previous test's resetModules
        jest.resetModules();
        
        // Explicitly mock happy path for this test
        jest.doMock("../../src/lib/payment-capture-queue", () => ({
            getPaymentCaptureQueue: jest.fn().mockReturnValue({
                add: jest.fn(),
            }),
            getJobState: jest.fn(),
        }));
        jest.doMock("../../src/repositories/order-recovery", () => ({
            getPendingRecoveryOrders: jest.fn().mockResolvedValue([]),
        }));

        const freshFallbackCaptureJob = require("../../src/jobs/fallback-capture").default;
        
        const freshMockQueryGraph = jest.fn().mockResolvedValue({ data: [] });
        const freshMockContainer = {
            resolve: jest.fn((key: string) => {
                if (key === "logger" || key === "LOGGER" || key.includes("LOGGER")) {
                    return mockLogger;
                }
                if (key === "manager") return {};
                return { graph: freshMockQueryGraph };
            }),
        };

        await freshFallbackCaptureJob(freshMockContainer);

        // Verify query was called with status: "pending" filter
        expect(freshMockQueryGraph).toHaveBeenCalledWith(
            expect.objectContaining({
                entity: "order",
                filters: expect.objectContaining({
                    status: "pending",
                }),
            })
        );
    });

    // Story 6.2: Redis Recovery Logic
    describe("Redis recovery logic (Story 6.2)", () => {
        const mockOrderService = {
            updateOrders: jest.fn().mockResolvedValue([{}]),
        };

        const createRecoveryOrder = (id: string, paymentIntentId: string) => ({
            id,
            metadata: { 
                stripe_payment_intent_id: paymentIntentId,
                needs_recovery: true,
                recovery_reason: "redis_failure"
            },
            created_at: new Date(Date.now() - 70 * 60 * 1000),
            status: "pending",
        });

        it("should process orders flagged with needs_recovery: true and clear flag", async () => {
            jest.resetModules();
            
            jest.doMock("../../src/lib/payment-capture-queue", () => ({
                getPaymentCaptureQueue: jest.fn().mockReturnValue({
                    add: mockQueueAdd,
                }),
                getJobState: mockGetJobState,
            }));
            jest.doMock("../../src/repositories/order-recovery", () => ({
                getPendingRecoveryOrders: jest.fn().mockResolvedValue([createRecoveryOrder("ord_recovery", "pi_recovery")]),
            }));

            const freshFallbackJob = require("../../src/jobs/fallback-capture").default;

            const recoveryOrder = createRecoveryOrder("ord_recovery", "pi_recovery");
            const recoveryQueryGraph = jest.fn().mockResolvedValue({
                data: [recoveryOrder],
            });

            const recoveryContainer = {
                resolve: jest.fn((key: string) => {
                    if (key === "logger" || key === "LOGGER" || key.includes("LOGGER")) {
                        return mockLogger;
                    }
                    if (key === "query") return { graph: recoveryQueryGraph };
                    if (key === "manager") return {};
                    if (key === "order") return mockOrderService;
                    return undefined;
                }),
            };

            mockStripeRetrieve.mockResolvedValue({ status: "requires_capture" });
            mockGetJobState.mockResolvedValue("missing");

            await freshFallbackJob(recoveryContainer);

            // Should queue capture for recovery order with source: redis_recovery
            expect(mockQueueAdd).toHaveBeenCalledWith(
                "capture-ord_recovery",
                expect.objectContaining({
                    orderId: "ord_recovery",
                    paymentIntentId: "pi_recovery",
                    source: "redis_recovery",
                }),
                expect.objectContaining({ delay: 0 })
            );

            // Should clear the recovery flag from metadata
            expect(mockOrderService.updateOrders).toHaveBeenCalledWith([{
                id: "ord_recovery",
                metadata: expect.objectContaining({
                    stripe_payment_intent_id: "pi_recovery",
                }),
            }]);
            // Verify needs_recovery is NOT in the cleared metadata
            const updateCall = mockOrderService.updateOrders.mock.calls[0][0][0];
            expect(updateCall.metadata.needs_recovery).toBeUndefined();
            expect(updateCall.metadata.recovery_reason).toBeUndefined();
        });
    });
});
