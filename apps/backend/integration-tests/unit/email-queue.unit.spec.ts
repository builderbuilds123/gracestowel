import { getEmailQueue, enqueueEmail, initEmailQueue } from "../../src/lib/email-queue"

// Mock BullMQ
jest.mock("bullmq", () => {
  return {
    Queue: jest.fn().mockImplementation(() => ({
      add: jest.fn().mockResolvedValue({ id: "mock-job-id" }),
    })),
  }
})

// Mock Redis connection
jest.mock("../../src/lib/redis", () => ({
  getRedisConnection: jest.fn().mockReturnValue({ host: "localhost", port: 6379 }),
}))

// Mock email masking
jest.mock("../../src/utils/email-masking", () => ({
  maskEmail: jest.fn((email) => email),
}))

describe("Email Queue Service", () => {
  const mockContainer = {
    resolve: jest.fn().mockReturnValue({
      info: jest.fn(),
      error: jest.fn(),
    }),
  }

  beforeAll(() => {
    // Initialize with mock logger to avoid console noise
    initEmailQueue(mockContainer as any)
  })

  beforeEach(() => {
    jest.clearAllMocks()
    // Note: Queue constructor mock counts accumulate if not reset, but we can't easily reset module-level singleton here
    // without using jest.isolateModules() for every test, which is overkill.
    // We will verify behavior on the queue instance methods instead.
  })

  it("getEmailQueue() returns singleton instance", () => {
    // This might be called in other tests, so we can't strictly assert "called 1 time" unless we know order.
    // Instead we check reference equality.
    const queue1 = getEmailQueue()
    const queue2 = getEmailQueue()
    expect(queue1).toBe(queue2)
    // We expect it to be an instance of our mocked Queue
    expect(queue1.add).toBeDefined()
  })

  it("enqueueEmail() adds job with correct options", async () => {
    const payload = {
      orderId: "ord_123",
      template: "order-placed" as const,
      recipient: "test@example.com",
      data: {
        order: {
          id: "ord_123",
          display_id: "1001",
          items: [],
          total: 100,
          currency_code: "usd",
        },
      },
    }

    await enqueueEmail(payload)

    const queue = getEmailQueue()
    expect(queue.add).toHaveBeenCalledWith(
      "email-ord_123",
      payload,
      expect.objectContaining({
        jobId: "email-ord_123",
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 1000,
        },
      })
    )
  })

  it("handles errors gracefully (Story 1.3 requirement implemented early)", async () => {
    const queue = getEmailQueue()
    // Force fail next add
    ;(queue.add as jest.Mock).mockRejectedValueOnce(new Error("Redis offline"))

    const payload = {
        orderId: "ord_fail",
        template: "order-placed" as const,
        recipient: "test@example.com",
        data: {
          order: {
            id: "ord_fail",
            display_id: "1",
            items: [],
            total: 0,
            currency_code: "usd"
          }
        }
    }

    const result = await enqueueEmail(payload)
    
    expect(result).toBeNull()
    // Should log error
    const logger = mockContainer.resolve("logger")
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("Failed to queue email"))
  })
})
