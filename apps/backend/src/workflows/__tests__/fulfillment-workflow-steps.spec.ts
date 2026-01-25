// Guard jest.mock calls - they are hoisted but factory functions can check
try {
    if (typeof jest !== "undefined") {
        jest.mock("../../lib/payment-capture-queue", () => {
            const mockQueue = { getJob: typeof jest !== "undefined" ? jest.fn() : () => {} };
            return { getPaymentCaptureQueue: () => mockQueue };
        });

        jest.mock("../../services/payment-capture-core", () => ({
            executePaymentCapture: typeof jest !== "undefined" ? jest.fn() : () => {},
        }));
    }
} catch (e) {
    // jest not available, skip mocks
}

// Only proceed with test code if jest is available
if (typeof jest !== "undefined") {
    const { cancelPaymentCaptureJobStep } = require("../steps/cancel-capture-job");
    const { capturePaymentStep } = require("../steps/capture-payment-step");
    const { MedusaContainer } = require("@medusajs/framework/types");
    const { executePaymentCapture } = require("../../services/payment-capture-core");

    // Mocks
    const mockLogger = {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
    };

    const mockJob = {
        remove: jest.fn().mockResolvedValue(undefined),
    };

    const mockQueue = {
        getJob: jest.fn(),
    };

    const mockContainer = {
        resolve: jest.fn((key) => {
            if (key === "logger") return mockLogger;
            return null;
        }),
    } as unknown as MedusaContainer;

    describe("Fulfillment Workflow Steps", () => {
        beforeEach(() => {
            jest.clearAllMocks();
        });

        describe("cancelPaymentCaptureJobStep", () => {
            it("should remove the job if it exists", async () => {
                 mockQueue.getJob.mockResolvedValue(mockJob);

                 const result = await cancelPaymentCaptureJobStep.invoke({
                     input: "order_123",
                     container: mockContainer
                 });

                 expect(mockQueue.getJob).toHaveBeenCalledWith("capture-order_123");
                 expect(mockJob.remove).toHaveBeenCalled();
                 expect(result).toEqual({ cancelled: true, jobId: "capture-order_123" });
            });

            it("should return false if job does not exist", async () => {
                mockQueue.getJob.mockResolvedValue(null);

                const result = await cancelPaymentCaptureJobStep.invoke({
                    input: "order_123",
                    container: mockContainer
                });

                expect(mockJob.remove).not.toHaveBeenCalled();
                expect(result).toEqual({ cancelled: false, jobId: "capture-order_123" });
           });

           it("should soft fail and return false on error", async () => {
               mockQueue.getJob.mockRejectedValue(new Error("Queue error"));

               const result = await cancelPaymentCaptureJobStep.invoke({
                   input: "order_123",
                   container: mockContainer
               });

               expect(mockLogger.warn).toHaveBeenCalledWith(
                   "cancel-capture-job-step", 
                   "Failed to cancel capture job", 
                   expect.objectContaining({ jobId: "capture-order_123" })
               );
               expect(result).toEqual(expect.objectContaining({ cancelled: false }));
           });
        });

        describe("capturePaymentStep", () => {
            it("should call executePaymentCapture with correct args", async () => {
                await capturePaymentStep.invoke({
                    input: {
                        orderId: "order_123",
                        paymentIntentId: "pi_123"
                    },
                    container: mockContainer
                });

                expect(executePaymentCapture).toHaveBeenCalledWith(
                    mockContainer,
                    "order_123",
                    "pi_123",
                    "workflow_capture_order_123_pi_123"
                );
            });

            it("should throw if executePaymentCapture fails", async () => {
                (executePaymentCapture as jest.Mock).mockRejectedValue(new Error("Capture failed"));

                await expect(capturePaymentStep.invoke({
                    input: {
                        orderId: "order_123",
                        paymentIntentId: "pi_123"
                    },
                    container: mockContainer
                })).rejects.toThrow("Payment Capture Failed: Capture failed");
            });
        });
    });
}
