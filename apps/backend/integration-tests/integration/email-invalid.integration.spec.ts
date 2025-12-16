import { startEmailWorker } from "../../src/jobs/email-worker";
import { Job } from "bullmq";

// Functional Mock for Redis List
const redisList: string[] = [];
const mockRedis = {
  lpush: jest.fn((key, val) => {
    if (key === "email:dlq") redisList.unshift(val);
    return Promise.resolve(redisList.length);
  }),
};

jest.mock("ioredis", () => {
  return jest.fn().mockImplementation(() => mockRedis);
});

// Mock BullMQ worker
jest.mock("bullmq", () => {
  return {
    Worker: jest.fn().mockImplementation(() => ({
      on: jest.fn(),
      close: jest.fn(),
    })),
  };
});
jest.mock("../../src/lib/redis", () => ({ getRedisConnection: jest.fn() }));
jest.mock("../../src/utils/email-masking", () => ({ maskEmail: (e: string) => `masked-${e}` }));

describe("Invalid Email Integration (Simulated)", () => {
  let mockContainer: any;
  let mockResendService: any;

  beforeEach(() => {
    redisList.length = 0;
    jest.clearAllMocks();
    mockResendService = {
        send: jest.fn()
    };
    mockContainer = {
        resolve: jest.fn((key) => {
            if (key === "logger") return { info: jest.fn(), error: jest.fn(), warn: jest.fn() };
            if (key === "resendNotificationProviderService") return mockResendService;
            return null;
        })
    };
  });

  it("handles invalid email by moving to DLQ immediately (no retry)", async () => {
    // 1. Setup Resend to fail with 400
    mockResendService.send.mockRejectedValue({ statusCode: 400, message: "Invalid email" });

    // 2. Start worker
    const { startEmailWorker } = require("../../src/jobs/email-worker");
    const worker = startEmailWorker(mockContainer);
    
    // Get processor directly from the mocked constructor call
    const MockWorker = require("bullmq").Worker;
    // We need the processor passed to constructor. Since startEmailWorker is called inside test, 
    // it's the most recent call.
    const processor = MockWorker.mock.calls[MockWorker.mock.calls.length - 1][1];

    // 3. Simulate job
    const mockJob = {
        id: "job_inv_int",
        data: {
            orderId: "ord_inv_int",
            template: "order_confirmation",
            recipient: "invalid@test.com"
        },
        attemptsMade: 0
    };

    // 4. Run processor
    // It should resolve (not throw) because it handles the error internally
    await processor(mockJob);

    // 5. Verify DLQ storage
    expect(redisList.length).toBe(1);
    const entry = JSON.parse(redisList[0]);
    expect(entry.reason).toBe("invalid_email");
    expect(entry.attempts).toBe(1); // 0 + 1
  });
});
