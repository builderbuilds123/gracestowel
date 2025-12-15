import { startEmailWorker, resetEmailWorkerForTests } from "../../src/jobs/email-worker"
import { Worker } from "bullmq"

// Mock bullmq
jest.mock("bullmq", () => {
  return {
    Worker: jest.fn().mockImplementation((queueName, processor, options) => {
      return {
        on: jest.fn(),
        close: jest.fn(),
        // Expose processor for testing
        processor,
      }
    }),
  }
})

describe("Email Worker", () => {
  const mockLogger = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  }

  const mockResendService = {
    send: jest.fn().mockResolvedValue({ id: "mock-email-id" }),
  }

  const mockContainer = {
    resolve: jest.fn((key) => {
      if (key === "logger") return mockLogger
      if (key === "resendNotificationProviderService") return mockResendService
      return null
    }),
  }

  const originalEnv = process.env

  beforeEach(() => {
    jest.clearAllMocks()
    process.env = { ...originalEnv, REDIS_URL: "redis://localhost:6379" }
    resetEmailWorkerForTests()
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it("starts worker with correct configuration", () => {
    startEmailWorker(mockContainer as any)

    expect(Worker).toHaveBeenCalledWith(
      "email-queue",
      expect.any(Function),
      expect.objectContaining({
        connection: expect.objectContaining({
          host: "localhost",
          port: 6379,
        }),
        concurrency: 5,
      })
    )
  })

  it("processes job and calls Resend service", async () => {
    startEmailWorker(mockContainer as any)
    const processor = (Worker as unknown as jest.Mock).mock.calls[0][1]

    const job = {
      data: {
        orderId: "order_123",
        template: "order_confirmation",
        recipient: "test@example.com",
        data: { foo: "bar" },
      },
      attemptsMade: 0,
      id: "job_1",
    }

    await processor(job)

    expect(mockResendService.send).toHaveBeenCalledWith({
      to: "test@example.com",
      template: "order_confirmation",
      data: { foo: "bar" },
      channel: "email",
    })

    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining("[EMAIL][SENT] Sent order_confirmation to t***@example.com")
    )
  })

  it("handles failure and logs error", async () => {
    startEmailWorker(mockContainer as any)
    const processor = (Worker as unknown as jest.Mock).mock.calls[0][1]

    mockResendService.send.mockRejectedValueOnce(new Error("API Error"))

    const job = {
      data: {
        orderId: "order_123",
        template: "order_confirmation",
        recipient: "test@example.com",
        data: {},
      },
      attemptsMade: 0,
      id: "job_1",
    }

    await expect(processor(job)).rejects.toThrow("API Error")

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining("[EMAIL][FAILED] Failed order_confirmation for order order_123: API Error")
    )
  })
})
