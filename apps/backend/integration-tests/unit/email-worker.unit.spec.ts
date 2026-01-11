import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock dependencies
vi.mock("bullmq", () => {
  return {
    Worker: vi.fn(function(name, processor, options) {
      const callbacks: Record<string, Function> = {};
      return {
        on: vi.fn().mockImplementation((event, cb) => {
          callbacks[event] = cb;
        }),
        close: vi.fn(),
        processor,
        callbacks, // expose for testing
      };
    }),
  };
});

// Mock ioredis
const mockLpush = vi.fn();
// Use a real function for the constructor mock
const MockRedis = vi.fn(function() {
  return {
    lpush: mockLpush,
    quit: vi.fn(), // email-worker calls quit() in shutdown
  };
});

vi.mock("ioredis", () => {
  return {
    default: MockRedis,
    Redis: MockRedis, // Ensure named export is also present if needed
  };
});

vi.mock("../../src/lib/redis", () => ({
  getRedisConnection: vi.fn().mockReturnValue({}),
}));

vi.mock("../../src/utils/email-masking", () => ({
  maskEmail: vi.fn().mockReturnValue("m***@test.com"),
}));

describe("Email Worker", () => {
  let mockContainer: any;
  let mockLogger: any;
  let mockNotificationService: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
    };

    mockNotificationService = {
      createNotifications: vi.fn().mockResolvedValue({ id: "sent_123" }),
    };

    mockContainer = {
      resolve: vi.fn((key) => {
        if (key === "logger") return mockLogger;
        if (key === "notification") return mockNotificationService;
        return null;
      }),
    };
  });

  afterEach(async () => {
      // Ensure we clean up the worker singleton if possible, or reset modules
     vi.resetModules();
     const { shutdownEmailWorker } = await import("../../src/workers/email-worker");
     await shutdownEmailWorker();
  });

  // Helper helper to get module
  async function getEmailWorker() {
      // Must use dynamic import after resetModules
      return await import("../../src/workers/email-worker");
  }

  describe("Core Functionality (Story 1.2)", () => {
    it("processes job and calls Resend service", async () => {
      const { startEmailWorker } = await getEmailWorker();
      const worker = startEmailWorker(mockContainer) as any;
      const processor = worker.processor;

      const mockJob = {
        data: {
          orderId: "ord_123",
          template: "order_confirmation",
          recipient: "test@example.com",
          data: { foo: "bar" }
        },
        attemptsMade: 0,
        id: "job_1",
      };

      await processor(mockJob);

      expect(mockNotificationService.createNotifications).toHaveBeenCalledWith({
        to: "test@example.com",
        channel: "email",
        template: "order_confirmation",
        data: { foo: "bar" },
      });
    });

    it("logs success with masked email", async () => {
      const { startEmailWorker } = await getEmailWorker();
      const worker = startEmailWorker(mockContainer) as any;
      const processor = worker.processor;

      const mockJob = {
        data: {
          orderId: "ord_success",
          template: "order_confirmation",
          recipient: "test@example.com",
          data: {}
        },
        attemptsMade: 0,
        id: "job_success",
      };

      await processor(mockJob);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("[EMAIL][SENT] Sent order_confirmation to m***@test.com for order ord_success. ID: sent_123")
      );
    });

    it("logs failure and throws on Resend error", async () => {
      const { startEmailWorker } = await getEmailWorker();
      const worker = startEmailWorker(mockContainer) as any;
      const processor = worker.processor;

      mockNotificationService.createNotifications.mockRejectedValue(new Error("Resend Error"));

      const mockJob = {
        data: {
          orderId: "ord_fail",
          template: "order_confirmation",
          recipient: "test@example.com",
          data: {}
        },
        attemptsMade: 0,
        id: "job_fail",
      };

      await expect(processor(mockJob)).rejects.toThrow("Resend Error");

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining("[EMAIL][FAILED] Failed order_confirmation for order ord_fail (attempt 1/3): Resend Error")
      );
    });
  });

  describe("Retry Logic (Story 2.1)", () => {
    it("logs retry attempt when attemptsMade > 0", async () => {
      const { startEmailWorker } = await getEmailWorker();
      const worker = startEmailWorker(mockContainer) as any;
      const processor = worker.processor;

      const mockJob = {
        data: {
          orderId: "ord_retry",
          template: "order_confirmation",
          recipient: "test@example.com",
          data: {}
        },
        attemptsMade: 1, // Second attempt
        id: "job_retry",
      };

      await processor(mockJob);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("[EMAIL][RETRY] Attempt 2/3 for order ord_retry")
      );
    });
  });

  describe("Failure Alerting (Story 4.3)", () => {
      it("logs alert when job moves to DLQ via 'failed' event", async () => {
        const { startEmailWorker } = await getEmailWorker();
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
        const { startEmailWorker } = await getEmailWorker();
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
        const { startEmailWorker } = await getEmailWorker();
        const worker = startEmailWorker(mockContainer) as any;
        const processor = worker.processor;

        mockNotificationService.createNotifications.mockRejectedValue({ statusCode: 400, message: "Invalid email" });

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

  describe("DLQ Storage (Story 2.2)", () => {
    it("stores correct DLQ entry format with masked email", async () => {
      const { startEmailWorker } = await getEmailWorker();
      const worker = startEmailWorker(mockContainer) as any;
      const failedHandler = worker.callbacks['failed'];

      const mockJob = {
        id: "job_dlq_test",
        data: {
          orderId: "ord_dlq_1",
          template: "order_confirmation",
          recipient: "unmasked@test.com",
        },
        attemptsMade: 3,
      };
      const mockError = new Error("Final Failure");

      await failedHandler(mockJob, mockError);

      expect(mockLpush).toHaveBeenCalledWith(
        "email:dlq",
        expect.stringContaining("jobId") // Basic check
      );

      const dlqEntryString = mockLpush.mock.calls[0][1];
      const dlqEntry = JSON.parse(dlqEntryString);

      expect(dlqEntry).toMatchObject({
        jobId: "job_dlq_test",
        orderId: "ord_dlq_1",
        template: "order_confirmation",
        recipient: "m***@test.com", // Checked by mock implementation
        error: "Final Failure",
        attempts: 3,
      });
      expect(dlqEntry.failedAt).toBeDefined();
    });
  });

  describe("Invalid Email Handling (Story 2.3)", () => {
    it("isRetryableError returns false for 400 status", async () => {
      const { isRetryableError } = await getEmailWorker();
      expect(isRetryableError({ statusCode: 400 })).toBe(false);
      expect(isRetryableError({ status: 400 })).toBe(false);
      expect(isRetryableError({ response: { status: 400 } })).toBe(false);
    });

    it("isRetryableError returns false for specific error messages", async () => {
      const { isRetryableError } = await getEmailWorker();
      expect(isRetryableError({ message: "Some invalid email error" })).toBe(false);
      expect(isRetryableError({ message: "Email address is not valid" })).toBe(false);
    });

    it("isRetryableError returns true for 500/429/Network", async () => {
      const { isRetryableError } = await getEmailWorker();
      expect(isRetryableError({ statusCode: 500 })).toBe(true);
      expect(isRetryableError({ statusCode: 429 })).toBe(true);
      expect(isRetryableError({ message: "Network timeout" })).toBe(true);
    });

    it("moves invalid email directly to DLQ without throwing", async () => {
      const { startEmailWorker } = await getEmailWorker();
      const worker = startEmailWorker(mockContainer) as any;
      const processor = worker.processor;

      mockNotificationService.createNotifications.mockRejectedValue({ statusCode: 400, message: "Invalid email" });

      const mockJob = {
        data: {
          orderId: "ord_inv_1",
          template: "order_confirmation",
          recipient: "invalid@test.com",
        },
        attemptsMade: 0,
        id: "job_inv_1",
      };

      // Should resolve (not throw)
      await expect(processor(mockJob)).resolves.toBeUndefined();

      // Check DLQ storage
      expect(mockLpush).toHaveBeenCalledWith(
        "email:dlq",
        expect.stringContaining('"reason":"invalid_email"')
      );
    });
  });
});