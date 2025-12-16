import { enqueueEmail, initEmailQueue, getEmailQueue } from "../../src/lib/email-queue";

// Mock BullMQ
jest.mock("bullmq", () => {
  return {
    Queue: jest.fn().mockImplementation(() => ({
      add: jest.fn().mockResolvedValue({ id: "job_123" }),
    })),
  };
});

// Mock Redis connection
jest.mock("../../src/lib/redis", () => ({
  getRedisConnection: jest.fn().mockReturnValue({}),
}));

describe("Email Queue Non-Blocking Behavior (Integration)", () => {
  let mockContainer: any;
  let mockLogger: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
    };
    mockContainer = {
      resolve: jest.fn().mockReturnValue(mockLogger),
    };
    initEmailQueue(mockContainer);
  });

  it("should NOT throw when queue operation fails (Redis unavailable simulation)", async () => {
    // Arrange: Simulate Redis/Queue failure
    const queue = getEmailQueue();
    (queue.add as jest.Mock).mockRejectedValueOnce(new Error("Redis Connection Timeout"));

    const payload = {
        orderId: "ord_non_blocking",
        template: "order_confirmation" as const,
        recipient: "test@example.com",
        data: {
          orderNumber: 123, items: [], total: 100, currency: "usd"
        }
    };

    // Act: Call the function
    let result;
    let errorThrown = false;
    try {
        result = await enqueueEmail(payload);
    } catch (e) {
        errorThrown = true;
    }

    // Assert: No error thrown
    expect(errorThrown).toBe(false);
    
    // Assert: Returns null (graceful failure)
    expect(result).toBeNull();

    // Assert: Error is logged with correct prefix
    expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining("[EMAIL][ERROR] Failed to queue email")
    );
    expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining("Redis Connection Timeout")
    );
  });

  it("should log success when queue operation succeeds", async () => {
    // Arrange
    const queue = getEmailQueue();
    (queue.add as jest.Mock).mockResolvedValueOnce({ id: "job_success" });

    const payload = {
        orderId: "ord_success",
        template: "order_confirmation" as const,
        recipient: "test@example.com",
        data: {
          orderNumber: 123, items: [], total: 100, currency: "usd"
        }
    };

    // Act
    const result = await enqueueEmail(payload);

    // Assert
    expect(result).not.toBeNull();
    expect(result).toHaveProperty("id", "job_success");

    // Assert: Success log
    expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("[EMAIL][QUEUE] Enqueued order_confirmation for order ord_success")
    );
  });
});
