import { startEmailWorker, isRetryableError } from "../../src/jobs/email-worker";
import { Job, Worker } from "bullmq";
import { getRedisConnection } from "../../src/lib/redis";
import { maskEmail } from "../../src/utils/email-masking";

// Mock dependencies
jest.mock("bullmq", () => {
  return {
    Worker: jest.fn().mockImplementation((name, processor, options) => {
      const callbacks: Record<string, Function> = {};
      return {
        on: jest.fn().mockImplementation((event, cb) => {
          callbacks[event] = cb;
        }),
        close: jest.fn(),
        processor,
        callbacks, // expose for testing
      };
    }),
  };
});

// Mock ioredis
const mockLpush = jest.fn();
jest.mock("ioredis", () => {
  return jest.fn().mockImplementation(() => ({
    lpush: mockLpush,
  }));
});

jest.mock("../../src/lib/redis", () => ({
  getRedisConnection: jest.fn().mockReturnValue({}),
}));

jest.mock("../../src/utils/email-masking", () => ({
  maskEmail: jest.fn().mockReturnValue("m***@test.com"),
}));

describe("Email Worker", () => {
  let mockContainer: any;
  let mockLogger: any;
  let mockResendService: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
    };

    mockResendService = {
      send: jest.fn().mockResolvedValue({ id: "sent_123" }),
    };

    mockContainer = {
      resolve: jest.fn((key) => {
        if (key === "logger") return mockLogger;
        if (key === "resendNotificationProviderService") return mockResendService;
        return null;
      }),
    };
  });

  afterEach(() => {
     jest.resetModules();
  });

  describe("Failure Alerting", () => {
      it("logs alert when job moves to DLQ via 'failed' event", async () => {
        const { startEmailWorker } = require("../../src/jobs/email-worker");
        const worker = startEmailWorker(mockContainer) as any;

        // Simulate failed event
        const failedHandler = worker.callbacks['failed'];
        expect(failedHandler).toBeDefined();

        const mockJob = {
          id: "job_failed_alert",
          data: {
            orderId: "ord_alert_1",
            template: "order_confirmation",
            recipient: "test@example.com",
          },
          attemptsMade: 3,
        };
        const mockError = new Error("Final Alert Error");

        await failedHandler(mockJob, mockError);

        // Verify alert log
        expect(mockLogger.error).toHaveBeenCalledWith(
            expect.stringMatching(/\[EMAIL\]\[ALERT\].*order=ord_alert_1.*template=order_confirmation/)
        );

        // Verify metric log
        expect(mockLogger.info).toHaveBeenCalledWith(
            expect.stringContaining("[METRIC] email_alert")
        );
      });

      it("alert log is parseable", async () => {
        const { startEmailWorker } = require("../../src/jobs/email-worker");
        const worker = startEmailWorker(mockContainer) as any;
        const failedHandler = worker.callbacks['failed'];

        const mockJob = {
            id: "job_parse",
            data: {
              orderId: "ord_parse_1",
              template: "order_confirmation",
              recipient: "test@example.com",
            },
            attemptsMade: 3,
        };

        await failedHandler(mockJob, new Error("API Error"));

        const alertLog = mockLogger.error.mock.calls.find(
          (call: any) => call[0].includes("[EMAIL][ALERT]")
        )[0];

        expect(alertLog).toBeDefined();

        // Basic parsing check
        expect(alertLog).toContain("order=ord_parse_1");
        expect(alertLog).toContain("template=order_confirmation");
        expect(alertLog).toContain("error=API_Error"); // Spaces replaced by underscore
        expect(alertLog).toContain("attempts=3");
        expect(alertLog).toMatch(/timestamp=\d{4}-\d{2}-\d{2}T/);
      });

      it("logs alert when invalid email moves directly to DLQ", async () => {
        const { startEmailWorker } = require("../../src/jobs/email-worker");
        const worker = startEmailWorker(mockContainer) as any;
        const processor = worker.processor;

        mockResendService.send.mockRejectedValue({ statusCode: 400, message: "Invalid email" });

        const mockJob = {
          data: {
            orderId: "order_invalid_alert",
            template: "order_confirmation",
            recipient: "invalid@test.com",
            data: {}
          },
          attemptsMade: 0,
          id: "job_invalid_alert",
        };

        await processor(mockJob);

        // Verify alert log
        expect(mockLogger.error).toHaveBeenCalledWith(
            expect.stringMatching(/\[EMAIL\]\[ALERT\].*order=order_invalid_alert/)
        );
        expect(mockLogger.error).toHaveBeenCalledWith(
            expect.stringContaining("error=Invalid_email")
        );
      });
  });
});
