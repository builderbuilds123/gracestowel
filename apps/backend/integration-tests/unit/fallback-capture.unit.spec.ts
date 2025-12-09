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
jest.mock("../../src/lib/payment-capture-queue", () => ({
    getPaymentCaptureQueue: jest.fn().mockReturnValue({
        add: mockQueueAdd,
        getJob: mockQueueGetJob,
    }),
    getJobState: mockGetJobState,
}));

describe("fallback-capture", () => {
    let mockContainer: any;
    let mockQueryGraph: jest.Mock;
    let fallbackCaptureJob: any;

    beforeEach(() => {
        jest.clearAllMocks();
        
        // Reset modules to get fresh import
        jest.resetModules();
        
        // Setup mock container
        mockQueryGraph = jest.fn();
        mockContainer = {
            resolve: jest.fn().mockReturnValue({
                graph: mockQueryGraph,
            }),
        };
        
        // Mock console methods
        jest.spyOn(console, "log").mockImplementation(() => {});
        jest.spyOn(console, "error").mockImplementation(() => {});
        
        // Re-import the module
        fallbackCaptureJob = require("../../src/jobs/fallback-capture").default;
    });

    afterEach(() => {
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
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining("Skipped: 1"));
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

        expect(console.error).toHaveBeenCalledWith(
            expect.stringContaining("[FallbackCron][CRITICAL]")
        );
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining("[METRIC] fallback_capture_alert"));
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
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining("[METRIC] fallback_capture_triggered"));
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
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining("Found 0 orders"));
    });
});
