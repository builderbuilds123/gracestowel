/**
 * Unit tests for audit-logger.ts
 * 
 * Story 2.5: Audit Logging for Order Modification Attempts
 * 
 * Tests:
 * - Token hashing
 * - Log data structure
 * - All action types
 * - Edge cases
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import crypto from "crypto";

// Mock logger first
vi.mock("../../../src/utils/logger");

// Import after mock
import { logOrderModificationAttempt, AuditAction } from "../../../src/utils/audit-logger";
import { logger } from "../../../src/utils/logger";

// Spy on the mocked logger method
const mockLoggerInfoFn = vi.spyOn(logger, "info");

describe("logOrderModificationAttempt", () => {
  const testOrderId = "order_123";
  const testCustomerId = "customer_456";
  const testToken = "test_token_abc123";
  const testIp = "192.168.1.1";
  const testUserAgent = "Mozilla/5.0";

  beforeEach(() => {
    vi.clearAllMocks();
    // Ensure the mock is reset for each test
    mockLoggerInfoFn.mockClear();
  });

  describe("token hashing", () => {
    it("should hash token and take first 16 characters", () => {
      const auditData = {
        orderId: testOrderId,
        action: "view" as AuditAction,
        authMethod: "guest_token" as const,
        customerId: null,
        token: testToken,
        ip: testIp,
        userAgent: testUserAgent,
        success: true,
      };

      logOrderModificationAttempt(auditData);

      const expectedHash = crypto
        .createHash("sha256")
        .update(testToken)
        .digest("hex")
        .slice(0, 16);

      expect(mockLoggerInfoFn).toHaveBeenCalledWith(
        "order-modification-audit",
        expect.objectContaining({
          tokenHash: expectedHash,
        })
      );
    });

    it("should set tokenHash to null when token is not provided", () => {
      const auditData = {
        orderId: testOrderId,
        action: "view" as AuditAction,
        authMethod: "customer_session" as const,
        customerId: testCustomerId,
        ip: testIp,
        userAgent: testUserAgent,
        success: true,
      };

      logOrderModificationAttempt(auditData);

      expect(mockLoggerInfoFn).toHaveBeenCalledWith(
        "order-modification-audit",
        expect.objectContaining({
          tokenHash: null,
        })
      );
    });

    it("should hash different tokens differently", () => {
      const token1 = "token1";
      const token2 = "token2";

      const hash1 = crypto
        .createHash("sha256")
        .update(token1)
        .digest("hex")
        .slice(0, 16);

      const hash2 = crypto
        .createHash("sha256")
        .update(token2)
        .digest("hex")
        .slice(0, 16);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe("action types", () => {
    const actions: AuditAction[] = ["view", "edit", "cancel", "eligibility_check"];

    actions.forEach((action) => {
      it(`should log ${action} action correctly`, () => {
        const auditData = {
          orderId: testOrderId,
          action,
          authMethod: "customer_session" as const,
          customerId: testCustomerId,
          ip: testIp,
          userAgent: testUserAgent,
          success: true,
        };

        logOrderModificationAttempt(auditData);

        expect(mockLoggerInfoFn).toHaveBeenCalledWith(
          "order-modification-audit",
          expect.objectContaining({
            action,
          })
        );
      });
    });
  });

  describe("auth methods", () => {
    it("should log customer_session auth method", () => {
      const auditData = {
        orderId: testOrderId,
        action: "view" as AuditAction,
        authMethod: "customer_session" as const,
        customerId: testCustomerId,
        ip: testIp,
        userAgent: testUserAgent,
        success: true,
      };

      logOrderModificationAttempt(auditData);

      expect(mockLoggerInfoFn).toHaveBeenCalledWith(
        "order-modification-audit",
        expect.objectContaining({
          authMethod: "customer_session",
          customerId: testCustomerId,
        })
      );
    });

    it("should log guest_token auth method", () => {
      const auditData = {
        orderId: testOrderId,
        action: "view" as AuditAction,
        authMethod: "guest_token" as const,
        customerId: null,
        token: testToken,
        ip: testIp,
        userAgent: testUserAgent,
        success: true,
      };

      logOrderModificationAttempt(auditData);

      expect(mockLoggerInfoFn).toHaveBeenCalledWith(
        "order-modification-audit",
        expect.objectContaining({
          authMethod: "guest_token",
          customerId: null,
        })
      );
    });

    it("should log none auth method", () => {
      const auditData = {
        orderId: testOrderId,
        action: "view" as AuditAction,
        authMethod: "none" as const,
        customerId: null,
        ip: testIp,
        userAgent: testUserAgent,
        success: false,
        failureReason: "Unauthorized",
      };

      logOrderModificationAttempt(auditData);

      expect(mockLoggerInfoFn).toHaveBeenCalledWith(
        "order-modification-audit",
        expect.objectContaining({
          authMethod: "none",
          customerId: null,
        })
      );
    });
  });

  describe("success and failure logging", () => {
    it("should log successful attempts", () => {
      const auditData = {
        orderId: testOrderId,
        action: "edit" as AuditAction,
        authMethod: "customer_session" as const,
        customerId: testCustomerId,
        ip: testIp,
        userAgent: testUserAgent,
        success: true,
      };

      logOrderModificationAttempt(auditData);

      expect(mockLoggerInfoFn).toHaveBeenCalledWith(
        "order-modification-audit",
        expect.objectContaining({
          success: true,
          failureReason: null,
        })
      );
    });

    it("should log failed attempts with failure reason", () => {
      const failureReason = "Order already fulfilled";
      const auditData = {
        orderId: testOrderId,
        action: "edit" as AuditAction,
        authMethod: "customer_session" as const,
        customerId: testCustomerId,
        ip: testIp,
        userAgent: testUserAgent,
        success: false,
        failureReason,
      };

      logOrderModificationAttempt(auditData);

      expect(mockLoggerInfoFn).toHaveBeenCalledWith(
        "order-modification-audit",
        expect.objectContaining({
          success: false,
          failureReason,
        })
      );
    });

    it("should set failureReason to null when not provided", () => {
      const auditData = {
        orderId: testOrderId,
        action: "view" as AuditAction,
        authMethod: "customer_session" as const,
        customerId: testCustomerId,
        ip: testIp,
        userAgent: testUserAgent,
        success: false,
      };

      logOrderModificationAttempt(auditData);

      expect(mockLoggerInfoFn).toHaveBeenCalledWith(
        "order-modification-audit",
        expect.objectContaining({
          failureReason: null,
        })
      );
    });
  });

  describe("complete log structure", () => {
    it("should include all required fields in log", () => {
      const auditData = {
        orderId: testOrderId,
        action: "edit" as AuditAction,
        authMethod: "guest_token" as const,
        customerId: null,
        token: testToken,
        ip: testIp,
        userAgent: testUserAgent,
        success: true,
      };

      logOrderModificationAttempt(auditData);

      expect(mockLoggerInfoFn).toHaveBeenCalledWith(
        "order-modification-audit",
        expect.objectContaining({
          orderId: testOrderId,
          action: "edit",
          authMethod: "guest_token",
          customerId: null,
          tokenHash: expect.any(String),
          ip: testIp,
          userAgent: testUserAgent,
          timestamp: expect.any(String),
          success: true,
          failureReason: null,
        })
      );
    });

    it("should include ISO timestamp", () => {
      const auditData = {
        orderId: testOrderId,
        action: "view" as AuditAction,
        authMethod: "customer_session" as const,
        customerId: testCustomerId,
        ip: testIp,
        userAgent: testUserAgent,
        success: true,
      };

      logOrderModificationAttempt(auditData);

      // Get the call arguments from the spy
      expect(mockLoggerInfoFn).toHaveBeenCalled();
      const callArgs = mockLoggerInfoFn.mock.calls[0];
      const logData = callArgs[1];
      const timestamp = new Date(logData.timestamp);

      expect(timestamp.toISOString()).toBe(logData.timestamp);
      expect(timestamp.getTime()).toBeCloseTo(Date.now(), -3); // Within 1 second
    });
  });

  describe("edge cases", () => {
    it("should handle empty order ID", () => {
      const auditData = {
        orderId: "",
        action: "view" as AuditAction,
        authMethod: "none" as const,
        customerId: null,
        ip: testIp,
        userAgent: testUserAgent,
        success: false,
      };

      expect(() => logOrderModificationAttempt(auditData)).not.toThrow();
    });

    it("should handle empty IP address", () => {
      const auditData = {
        orderId: testOrderId,
        action: "view" as AuditAction,
        authMethod: "customer_session" as const,
        customerId: testCustomerId,
        ip: "",
        userAgent: testUserAgent,
        success: true,
      };

      expect(() => logOrderModificationAttempt(auditData)).not.toThrow();
    });

    it("should handle empty user agent", () => {
      const auditData = {
        orderId: testOrderId,
        action: "view" as AuditAction,
        authMethod: "customer_session" as const,
        customerId: testCustomerId,
        ip: testIp,
        userAgent: "",
        success: true,
      };

      expect(() => logOrderModificationAttempt(auditData)).not.toThrow();
    });

    it("should handle very long token", () => {
      const longToken = "a".repeat(1000);
      const auditData = {
        orderId: testOrderId,
        action: "view" as AuditAction,
        authMethod: "guest_token" as const,
        customerId: null,
        token: longToken,
        ip: testIp,
        userAgent: testUserAgent,
        success: true,
      };

      expect(() => logOrderModificationAttempt(auditData)).not.toThrow();

      const expectedHash = crypto
        .createHash("sha256")
        .update(longToken)
        .digest("hex")
        .slice(0, 16);

      expect(mockLoggerInfoFn).toHaveBeenCalledWith(
        "order-modification-audit",
        expect.objectContaining({
          tokenHash: expectedHash,
        })
      );
    });
  });
});
