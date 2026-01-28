/**
 * Unit tests for stripe-capture.ts
 * 
 * Story 1.3: Fulfillment-Triggered Payment Capture
 * 
 * Tests:
 * - Immediate capture job scheduling
 * - Fallback job cancellation
 * - Error handling
 * - Edge cases
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MedusaContainer } from "@medusajs/medusa";

// Mock logger
vi.mock("../../../src/utils/logger", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

// Import after mocks
import { capturePayment } from "../../../src/services/stripe-capture";
import { logger } from "../../../src/utils/logger";

// Get mock functions using spies
const mockLoggerInfo = vi.spyOn(logger, "info");
const mockLoggerError = vi.spyOn(logger, "error");
const mockLoggerWarn = vi.spyOn(logger, "warn");

describe("capturePayment", () => {
  const testOrderId = "order_123";
  const testPaymentIntentId = "pi_test456";
  const mockContainer = {} as MedusaContainer;
  const originalEnv = process.env;
  
  // Create mock functions for queue operations
  let mockSchedulePaymentCapture: ReturnType<typeof vi.fn>;
  let mockCancelPaymentCaptureJob: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLoggerInfo.mockClear();
    mockLoggerError.mockClear();
    process.env = { ...originalEnv };
    process.env.REDIS_URL = "redis://localhost:6379"; // Required for queue operations
    
    // Create fresh mocks for each test
    mockSchedulePaymentCapture = vi.fn().mockResolvedValue(undefined);
    mockCancelPaymentCaptureJob = vi.fn().mockResolvedValue(true);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("successful capture flow", () => {
    it("should cancel existing scheduled job and schedule immediate capture", async () => {
      await capturePayment(testOrderId, testPaymentIntentId, mockContainer, {
        schedulePaymentCapture: mockSchedulePaymentCapture,
        cancelPaymentCaptureJob: mockCancelPaymentCaptureJob,
      });

      expect(mockCancelPaymentCaptureJob).toHaveBeenCalledWith(testOrderId);
      expect(mockSchedulePaymentCapture).toHaveBeenCalledWith(
        testOrderId,
        testPaymentIntentId,
        0 // Immediate capture (delay: 0)
      );
    });

    it("should log when fallback job is removed", async () => {
      mockCancelPaymentCaptureJob.mockResolvedValue(true);

      await capturePayment(testOrderId, testPaymentIntentId, mockContainer, {
        schedulePaymentCapture: mockSchedulePaymentCapture,
        cancelPaymentCaptureJob: mockCancelPaymentCaptureJob,
      });

      expect(mockLoggerInfo).toHaveBeenCalledWith(
        "stripe-capture",
        "Fallback job removed",
        { orderId: testOrderId }
      );
    });

    it("should log when fallback job is not found", async () => {
      mockCancelPaymentCaptureJob.mockResolvedValue(false);

      await capturePayment(testOrderId, testPaymentIntentId, mockContainer, {
        schedulePaymentCapture: mockSchedulePaymentCapture,
        cancelPaymentCaptureJob: mockCancelPaymentCaptureJob,
      });

      expect(mockLoggerInfo).toHaveBeenCalledWith(
        "stripe-capture",
        "Fallback job not found",
        { orderId: testOrderId }
      );
    });

    it("should log immediate capture job scheduling", async () => {
      await capturePayment(testOrderId, testPaymentIntentId, mockContainer, {
        schedulePaymentCapture: mockSchedulePaymentCapture,
        cancelPaymentCaptureJob: mockCancelPaymentCaptureJob,
      });

      expect(mockLoggerInfo).toHaveBeenCalledWith(
        "stripe-capture",
        "Triggering immediate capture on fulfillment",
        {
          orderId: testOrderId,
          paymentIntentId: testPaymentIntentId,
          idempotencyKey: `capture_${testOrderId}_${testPaymentIntentId}`,
        }
      );

      expect(mockLoggerInfo).toHaveBeenCalledWith(
        "stripe-capture",
        "Immediate capture job scheduled successfully",
        {
          orderId: testOrderId,
          paymentIntentId: testPaymentIntentId,
        }
      );
    });
  });

  describe("error handling", () => {
    it("should propagate errors from schedulePaymentCapture", async () => {
      const scheduleError = new Error("Failed to schedule job");
      mockSchedulePaymentCapture.mockRejectedValue(scheduleError);

      await expect(
        capturePayment(testOrderId, testPaymentIntentId, mockContainer, {
          schedulePaymentCapture: mockSchedulePaymentCapture,
          cancelPaymentCaptureJob: mockCancelPaymentCaptureJob,
        })
      ).rejects.toThrow("Failed to schedule job");

      expect(mockLoggerError).toHaveBeenCalledWith(
        "stripe-capture",
        "Failed to schedule immediate capture",
        {
          orderId: testOrderId,
          paymentIntentId: testPaymentIntentId,
          error: "Failed to schedule job",
        }
      );
    });

    it("should still attempt to schedule even if cancel fails", async () => {
      mockCancelPaymentCaptureJob.mockRejectedValue(new Error("Cancel failed"));

      await capturePayment(testOrderId, testPaymentIntentId, mockContainer, {
        schedulePaymentCapture: mockSchedulePaymentCapture,
        cancelPaymentCaptureJob: mockCancelPaymentCaptureJob,
      });

      // Should still attempt to schedule even though cancel failed
      expect(mockSchedulePaymentCapture).toHaveBeenCalled();
      expect(mockLoggerInfo).toHaveBeenCalledWith(
        "stripe-capture",
        "Triggering immediate capture on fulfillment",
        expect.any(Object)
      );
      // Should log warning about cancel failure
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        "stripe-capture",
        "Failed to cancel fallback job, proceeding with immediate capture",
        expect.objectContaining({
          orderId: testOrderId,
          error: "Cancel failed",
        })
      );
    });

    it("should handle non-Error exceptions", async () => {
      mockSchedulePaymentCapture.mockRejectedValue("String error");

      await expect(
        capturePayment(testOrderId, testPaymentIntentId, mockContainer, {
          schedulePaymentCapture: mockSchedulePaymentCapture,
          cancelPaymentCaptureJob: mockCancelPaymentCaptureJob,
        })
      ).rejects.toBe("String error");

      expect(mockLoggerError).toHaveBeenCalledWith(
        "stripe-capture",
        "Failed to schedule immediate capture",
        {
          orderId: testOrderId,
          paymentIntentId: testPaymentIntentId,
          error: "String error",
        }
      );
    });
  });

  describe("idempotency key generation", () => {
    it("should use correct idempotency key format", async () => {
      await capturePayment(testOrderId, testPaymentIntentId, mockContainer, {
        schedulePaymentCapture: mockSchedulePaymentCapture,
        cancelPaymentCaptureJob: mockCancelPaymentCaptureJob,
      });

      expect(mockLoggerInfo).toHaveBeenCalledWith(
        "stripe-capture",
        "Triggering immediate capture on fulfillment",
        expect.objectContaining({
          idempotencyKey: `capture_${testOrderId}_${testPaymentIntentId}`,
        })
      );
    });

    it("should handle different order and payment intent IDs", async () => {
      const orderId2 = "order_789";
      const paymentIntentId2 = "pi_abc123";

      await capturePayment(orderId2, paymentIntentId2, mockContainer, {
        schedulePaymentCapture: mockSchedulePaymentCapture,
        cancelPaymentCaptureJob: mockCancelPaymentCaptureJob,
      });

      expect(mockLoggerInfo).toHaveBeenCalledWith(
        "stripe-capture",
        "Triggering immediate capture on fulfillment",
        expect.objectContaining({
          idempotencyKey: `capture_${orderId2}_${paymentIntentId2}`,
        })
      );
    });
  });

  describe("edge cases", () => {
    it("should handle empty order ID", async () => {
      await expect(
        capturePayment("", testPaymentIntentId, mockContainer, {
          schedulePaymentCapture: mockSchedulePaymentCapture,
          cancelPaymentCaptureJob: mockCancelPaymentCaptureJob,
        })
      ).resolves.not.toThrow();

      expect(mockSchedulePaymentCapture).toHaveBeenCalledWith(
        "",
        testPaymentIntentId,
        0
      );
    });

    it("should handle empty payment intent ID", async () => {
      await expect(
        capturePayment(testOrderId, "", mockContainer, {
          schedulePaymentCapture: mockSchedulePaymentCapture,
          cancelPaymentCaptureJob: mockCancelPaymentCaptureJob,
        })
      ).resolves.not.toThrow();

      expect(mockSchedulePaymentCapture).toHaveBeenCalledWith(
        testOrderId,
        "",
        0
      );
    });

    it("should handle special characters in IDs", async () => {
      const specialOrderId = "order_test-123_abc";
      const specialPaymentIntentId = "pi_test-456_xyz";

      await capturePayment(specialOrderId, specialPaymentIntentId, mockContainer, {
        schedulePaymentCapture: mockSchedulePaymentCapture,
        cancelPaymentCaptureJob: mockCancelPaymentCaptureJob,
      });

      expect(mockSchedulePaymentCapture).toHaveBeenCalledWith(
        specialOrderId,
        specialPaymentIntentId,
        0
      );
    });
  });
});
