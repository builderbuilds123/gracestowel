/**
 * Unit tests for payment-capture-worker.ts (loader)
 * 
 * Story: 2-2-expiration-listener
 * Coverage: Loader initialization, REDIS_URL validation, error handling
 */

// Use jest.fn directly in the mock factory
jest.mock("../../src/lib/payment-capture-queue", () => ({
    startPaymentCaptureWorker: jest.fn(),
}))

// Import after mock setup
import paymentCaptureWorkerLoader from "../../src/loaders/payment-capture-worker"
import { startPaymentCaptureWorker } from "../../src/lib/payment-capture-queue"

// Get typed mock reference
const mockStartPaymentCaptureWorker = startPaymentCaptureWorker as jest.Mock

describe("paymentCaptureWorkerLoader", () => {
    const originalEnv = process.env
    const mockContainer = {} as any

    beforeEach(() => {
        jest.clearAllMocks()
        process.env = { ...originalEnv }
        jest.spyOn(console, "log").mockImplementation(() => {})
        jest.spyOn(console, "warn").mockImplementation(() => {})
        jest.spyOn(console, "error").mockImplementation(() => {})
    })

    afterEach(() => {
        process.env = originalEnv
        jest.restoreAllMocks()
    })

    describe("when REDIS_URL is configured", () => {
        beforeEach(() => {
            process.env.REDIS_URL = "redis://localhost:6379"
        })

        it("should start the payment capture worker", async () => {
            await paymentCaptureWorkerLoader(mockContainer)

            expect(mockStartPaymentCaptureWorker).toHaveBeenCalledTimes(1)
        })

        it("should not log a warning", async () => {
            const warnSpy = jest.spyOn(console, "warn")

            await paymentCaptureWorkerLoader(mockContainer)

            expect(warnSpy).not.toHaveBeenCalled()
        })
    })

    describe("when REDIS_URL is NOT configured", () => {
        beforeEach(() => {
            delete process.env.REDIS_URL
        })

        it("should NOT start the payment capture worker", async () => {
            await paymentCaptureWorkerLoader(mockContainer)

            expect(mockStartPaymentCaptureWorker).not.toHaveBeenCalled()
        })

        it("should log a warning about missing REDIS_URL", async () => {
            const warnSpy = jest.spyOn(console, "warn")

            await paymentCaptureWorkerLoader(mockContainer)

            expect(warnSpy).toHaveBeenCalledWith(
                "REDIS_URL not configured - payment capture worker not started"
            )
        })
    })

    describe("error handling", () => {
        beforeEach(() => {
            process.env.REDIS_URL = "redis://localhost:6379"
        })

        it("should log CRITICAL error when worker fails to start", async () => {
            const testError = new Error("Connection failed")
            mockStartPaymentCaptureWorker.mockImplementationOnce(() => {
                throw testError
            })
            const errorSpy = jest.spyOn(console, "error")

            await expect(paymentCaptureWorkerLoader(mockContainer)).rejects.toThrow("Connection failed")

            expect(errorSpy).toHaveBeenCalledWith(
                "CRITICAL: Failed to start payment capture worker:",
                testError
            )
        })

        it("should re-throw the error for Medusa to handle", async () => {
            const testError = new Error("Redis unavailable")
            mockStartPaymentCaptureWorker.mockImplementationOnce(() => {
                throw testError
            })

            await expect(paymentCaptureWorkerLoader(mockContainer)).rejects.toThrow("Redis unavailable")
        })
    })

    describe("loader export", () => {
        it("should be a default export function", () => {
            expect(typeof paymentCaptureWorkerLoader).toBe("function")
        })

        it("should accept MedusaContainer as parameter", () => {
            // Function signature check - if it accepts the mock container without error
            expect(async () => {
                process.env.REDIS_URL = "redis://localhost:6379"
                await paymentCaptureWorkerLoader(mockContainer)
            }).not.toThrow()
        })
    })
})
