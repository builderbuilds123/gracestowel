import { enqueueEmail, getEmailQueue } from "../../src/lib/email-queue";

// Mock BullMQ to spy on add
jest.mock("bullmq", () => {
  return {
    Queue: jest.fn().mockImplementation(() => ({
      add: jest.fn().mockResolvedValue({ id: "job_retry_test" }),
    })),
  };
});
jest.mock("../../src/lib/redis", () => ({ getRedisConnection: jest.fn() }));

describe("Email Retry Configuration (Integration)", () => {
  it("enqueues job with correct exponential backoff settings", async () => {
    const payload = {
      orderId: "ord_retry_config",
      template: "order_confirmation" as const,
      recipient: "test@example.com",
      data: { orderNumber: 1, items: [], total: 0, currency: "usd" }
    };

    await enqueueEmail(payload);

    const queue = getEmailQueue();
    expect(queue.add).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
            attempts: 3,
            backoff: {
                type: "exponential",
                delay: 1000
            }
        })
    );
  });
});
