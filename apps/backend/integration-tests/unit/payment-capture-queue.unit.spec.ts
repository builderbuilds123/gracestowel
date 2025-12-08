/**
 * Unit tests for payment-capture-queue.ts
 * 
 * Story: 2-2-expiration-listener
 * Coverage: Queue creation, job scheduling, job cancellation, Redis connection
 */

// Store mock references
const mockQueueAdd = jest.fn().mockResolvedValue({ id: "test-job-id" })
const mockQueueGetJob = jest.fn()
const mockQueueInstance = {
    add: mockQueueAdd,
    getJob: mockQueueGetJob,
}

const mockWorkerOn = jest.fn()
const mockWorkerClose = jest.fn()

// Mock BullMQ before importing the module
jest.mock("bullmq", () => ({
    Queue: jest.fn().mockImplementation(() => mockQueueInstance),
    Worker: jest.fn().mockImplementation(() => ({
        on: mockWorkerOn,
        close: mockWorkerClose,
    })),
    Job: jest.fn(),
}))

// Mock stripe client
jest.mock("../../src/utils/stripe", () => ({
    getStripeClient: jest.fn().mockReturnValue({
        paymentIntents: {
            retrieve: jest.fn(),
            capture: jest.fn(),
        },
    }),
}))

describe("payment-capture-queue", () => {
    const originalEnv = process.env

    beforeEach(() => {
        jest.clearAllMocks()
        jest.resetModules()
        process.env = { ...originalEnv }
        process.env.REDIS_URL = "redis://localhost:6379"
        jest.spyOn(console, "log").mockImplementation(() => {})
        jest.spyOn(console, "warn").mockImplementation(() => {})
        jest.spyOn(console, "error").mockImplementation(() => {})
    })

    afterEach(() => {
        process.env = originalEnv
        jest.restoreAllMocks()
    })

    describe("PAYMENT_CAPTURE_QUEUE constant", () => {
        it("should be 'payment-capture'", () => {
            const { PAYMENT_CAPTURE_QUEUE } = require("../../src/lib/payment-capture-queue")
            expect(PAYMENT_CAPTURE_QUEUE).toBe("payment-capture")
        })
    })

    describe("PAYMENT_CAPTURE_DELAY_MS constant", () => {
        it("should be 1 hour in milliseconds (3600000)", () => {
            const { PAYMENT_CAPTURE_DELAY_MS } = require("../../src/lib/payment-capture-queue")
            expect(PAYMENT_CAPTURE_DELAY_MS).toBe(60 * 60 * 1000) // 1 hour
            expect(PAYMENT_CAPTURE_DELAY_MS).toBe(3600000)
        })
    })

    describe("getPaymentCaptureQueue", () => {
        it("should throw error when REDIS_URL is not configured", () => {
            delete process.env.REDIS_URL
            const { getPaymentCaptureQueue } = require("../../src/lib/payment-capture-queue")
            
            expect(() => getPaymentCaptureQueue()).toThrow("REDIS_URL is not configured")
        })

        it("should return queue instance when REDIS_URL is set", () => {
            const { getPaymentCaptureQueue } = require("../../src/lib/payment-capture-queue")
            
            const queue = getPaymentCaptureQueue()
            
            // Verify it returns the mock queue with expected methods
            expect(queue).toBeDefined()
            expect(typeof queue.add).toBe("function")
            expect(typeof queue.getJob).toBe("function")
        })

        it("should return same queue instance on subsequent calls (singleton)", () => {
            const { getPaymentCaptureQueue } = require("../../src/lib/payment-capture-queue")
            
            const queue1 = getPaymentCaptureQueue()
            const queue2 = getPaymentCaptureQueue()
            
            expect(queue1).toBe(queue2)
        })
    })

    describe("schedulePaymentCapture", () => {
        it("should schedule job with correct data", async () => {
            const { schedulePaymentCapture } = require("../../src/lib/payment-capture-queue")
            
            const orderId = "ord_test_123"
            const paymentIntentId = "pi_test_456"
            
            await schedulePaymentCapture(orderId, paymentIntentId)
            
            expect(mockQueueAdd).toHaveBeenCalledWith(
                `capture-${orderId}`,
                expect.objectContaining({
                    orderId,
                    paymentIntentId,
                    scheduledAt: expect.any(Number),
                }),
                expect.objectContaining({
                    delay: 3600000, // 1 hour
                    jobId: `capture-${orderId}`,
                })
            )
        })

        it("should return the created job", async () => {
            const { schedulePaymentCapture } = require("../../src/lib/payment-capture-queue")
            
            const job = await schedulePaymentCapture("ord_123", "pi_456")
            
            expect(job).toEqual({ id: "test-job-id" })
        })

        it("should log job scheduling", async () => {
            const consoleSpy = jest.spyOn(console, "log")
            const { schedulePaymentCapture } = require("../../src/lib/payment-capture-queue")
            
            await schedulePaymentCapture("ord_test_789", "pi_test_012")
            
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining("Scheduled payment capture for order ord_test_789")
            )
        })

        it("should include scheduledAt timestamp in job data", async () => {
            const { schedulePaymentCapture } = require("../../src/lib/payment-capture-queue")
            
            const beforeTime = Date.now()
            await schedulePaymentCapture("ord_123", "pi_456")
            const afterTime = Date.now()
            
            const addCall = mockQueueAdd.mock.calls[0]
            const jobData = addCall[1]
            
            expect(jobData.scheduledAt).toBeGreaterThanOrEqual(beforeTime)
            expect(jobData.scheduledAt).toBeLessThanOrEqual(afterTime)
        })
    })

    describe("cancelPaymentCaptureJob", () => {
        it("should cancel existing job and return true", async () => {
            const { cancelPaymentCaptureJob } = require("../../src/lib/payment-capture-queue")
            
            const mockJob = { remove: jest.fn().mockResolvedValue(undefined) }
            mockQueueGetJob.mockResolvedValue(mockJob)
            
            const result = await cancelPaymentCaptureJob("ord_test_123")
            
            expect(mockQueueGetJob).toHaveBeenCalledWith("capture-ord_test_123")
            expect(mockJob.remove).toHaveBeenCalled()
            expect(result).toBe(true)
        })

        it("should return false when job does not exist", async () => {
            const { cancelPaymentCaptureJob } = require("../../src/lib/payment-capture-queue")
            
            mockQueueGetJob.mockResolvedValue(null)
            
            const result = await cancelPaymentCaptureJob("ord_nonexistent")
            
            expect(result).toBe(false)
        })

        it("should log when job is canceled", async () => {
            const consoleSpy = jest.spyOn(console, "log")
            const { cancelPaymentCaptureJob } = require("../../src/lib/payment-capture-queue")
            
            const mockJob = { remove: jest.fn().mockResolvedValue(undefined) }
            mockQueueGetJob.mockResolvedValue(mockJob)
            
            await cancelPaymentCaptureJob("ord_test_cancel")
            
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining("Canceled payment capture job for order ord_test_cancel")
            )
        })
    })
})
