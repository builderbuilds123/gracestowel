// Uses startEmailWorker dynamically for testing mocks

// Functional Mock for Redis List
const redisList: string[] = [];
const mockRedis = {
  lpush: jest.fn((key, val) => {
    if (key === "email:dlq") redisList.unshift(val);
    return Promise.resolve(redisList.length);
  }),
  lrange: jest.fn((key, start, end) => {
    if (key === "email:dlq") return Promise.resolve(redisList);
    return Promise.resolve([]);
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

describe("DLQ Integration (Simulated)", () => {
  let mockContainer: any;

  beforeEach(() => {
    redisList.length = 0; // Clear list
    jest.clearAllMocks();
    mockContainer = {
        resolve: jest.fn().mockReturnValue({ info: jest.fn(), error: jest.fn() })
    };
  });

  it("stores failed job in DLQ and allows retrieval", async () => {
    // 1. Start worker to get the failed handler
    const { startEmailWorker } = require("../../src/jobs/email-worker");
    // We need to spy on the Worker constructor to capture the 'failed' handler
    const MockWorker = require("bullmq").Worker;
    let failedHandler: any;
    MockWorker.mockImplementation((name: string, processor: any, opts: any) => ({
        on: (event: string, cb: any) => {
            if (event === "failed") failedHandler = cb;
        },
        close: jest.fn(),
    }));

    startEmailWorker(mockContainer);

    expect(failedHandler).toBeDefined();

    // 2. Simulate a job failure
    const mockJob = {
        id: "job_dlq_int",
        data: {
            orderId: "ord_dlq_int",
            template: "order_confirmation",
            recipient: "test@example.com"
        },
        attemptsMade: 3
    };

    await failedHandler(mockJob, new Error("Integration Failure"));

    // 3. Verify storage
    expect(redisList.length).toBe(1);

    // 4. Verify retrieval (simulation of manual inspection)
    const stored = JSON.parse(redisList[0]);
    expect(stored.jobId).toBe("job_dlq_int");
    expect(stored.recipient).toBe("masked-test@example.com");
  });
});
