/**
 * Unit tests for error-messages.ts
 * 
 * Story 4.1: User-Friendly Error Messages
 * 
 * Tests:
 * - Error code mapping
 * - Fallback behavior
 * - Edge cases
 */

import { describe, it, expect } from "vitest";
import { getErrorDisplay, ORDER_ERROR_MESSAGES, ErrorDisplay } from "./error-messages";

describe("getErrorDisplay", () => {
  describe("known error codes", () => {
    it("should return correct display for ORDER_FULFILLED", () => {
      const result = getErrorDisplay("ORDER_FULFILLED");

      expect(result).toEqual(ORDER_ERROR_MESSAGES.ORDER_FULFILLED);
      expect(result.title).toBe("Order Already Shipped");
      expect(result.message).toBe("This order has already shipped and cannot be modified.");
      expect(result.action).toBe("Contact support if you need assistance.");
    });

    it("should return correct display for PAYMENT_CAPTURED", () => {
      const result = getErrorDisplay("PAYMENT_CAPTURED");

      expect(result).toEqual(ORDER_ERROR_MESSAGES.PAYMENT_CAPTURED);
      expect(result.title).toBe("Payment Processed");
      expect(result.message).toBe("Payment has been processed for this order.");
    });

    it("should return correct display for UNAUTHORIZED", () => {
      const result = getErrorDisplay("UNAUTHORIZED");

      expect(result).toEqual(ORDER_ERROR_MESSAGES.UNAUTHORIZED);
      expect(result.title).toBe("Access Denied");
      expect(result.message).toBe("You don't have permission to view this order.");
    });

    it("should return correct display for RATE_LIMITED", () => {
      const result = getErrorDisplay("RATE_LIMITED");

      expect(result).toEqual(ORDER_ERROR_MESSAGES.RATE_LIMITED);
      expect(result.title).toBe("Too Many Requests");
      expect(result.message).toBe("You've made too many requests.");
    });

    it("should return correct display for all defined error codes", () => {
      const errorCodes = Object.keys(ORDER_ERROR_MESSAGES);

      errorCodes.forEach((code) => {
        const result = getErrorDisplay(code);

        expect(result).toBeDefined();
        expect(result.title).toBeDefined();
        expect(result.message).toBeDefined();
        expect(typeof result.title).toBe("string");
        expect(typeof result.message).toBe("string");
        if (result.action) {
          expect(typeof result.action).toBe("string");
        }
      });
    });
  });

  describe("fallback behavior", () => {
    it("should return EDIT_NOT_ALLOWED for unknown error codes", () => {
      const result = getErrorDisplay("UNKNOWN_ERROR_CODE");

      expect(result).toEqual(ORDER_ERROR_MESSAGES.EDIT_NOT_ALLOWED);
      expect(result.title).toBe("Cannot Edit Order");
      expect(result.message).toBe("This order cannot be modified at this time.");
    });

    it("should return EDIT_NOT_ALLOWED for undefined", () => {
      const result = getErrorDisplay(undefined);

      expect(result).toEqual(ORDER_ERROR_MESSAGES.EDIT_NOT_ALLOWED);
    });

    it("should return EDIT_NOT_ALLOWED for null", () => {
      const result = getErrorDisplay(null);

      expect(result).toEqual(ORDER_ERROR_MESSAGES.EDIT_NOT_ALLOWED);
    });

    it("should return EDIT_NOT_ALLOWED for empty string", () => {
      const result = getErrorDisplay("");

      expect(result).toEqual(ORDER_ERROR_MESSAGES.EDIT_NOT_ALLOWED);
    });

    it("should return EDIT_NOT_ALLOWED for non-string types", () => {
      // @ts-expect-error - Testing runtime behavior with invalid types
      const result1 = getErrorDisplay(123);
      // @ts-expect-error - Testing runtime behavior with invalid types
      const result2 = getErrorDisplay({});
      // @ts-expect-error - Testing runtime behavior with invalid types
      const result3 = getErrorDisplay([]);

      expect(result1).toEqual(ORDER_ERROR_MESSAGES.EDIT_NOT_ALLOWED);
      expect(result2).toEqual(ORDER_ERROR_MESSAGES.EDIT_NOT_ALLOWED);
      expect(result3).toEqual(ORDER_ERROR_MESSAGES.EDIT_NOT_ALLOWED);
    });
  });

  describe("error message structure", () => {
    it("should ensure all error messages have title and message", () => {
      Object.values(ORDER_ERROR_MESSAGES).forEach((errorDisplay) => {
        expect(errorDisplay.title).toBeDefined();
        expect(errorDisplay.message).toBeDefined();
        expect(errorDisplay.title.length).toBeGreaterThan(0);
        expect(errorDisplay.message.length).toBeGreaterThan(0);
      });
    });

    it("should ensure action is optional but when present is a string", () => {
      Object.values(ORDER_ERROR_MESSAGES).forEach((errorDisplay) => {
        if (errorDisplay.action !== undefined) {
          expect(typeof errorDisplay.action).toBe("string");
          expect(errorDisplay.action!.length).toBeGreaterThan(0);
        }
      });
    });

    it("should ensure error messages don't expose internal details", () => {
      Object.values(ORDER_ERROR_MESSAGES).forEach((errorDisplay) => {
        // Should not contain timestamps
        expect(errorDisplay.message).not.toMatch(/\d{4}-\d{2}-\d{2}/);
        // Should not contain technical error codes in message
        expect(errorDisplay.message).not.toMatch(/[A-Z_]{3,}/);
        // Should not contain amounts (currency symbols)
        expect(errorDisplay.message).not.toMatch(/\$|€|£|¥/);
      });
    });

    it("should ensure error messages are user-friendly", () => {
      Object.values(ORDER_ERROR_MESSAGES).forEach((errorDisplay) => {
        // Messages should be readable (not too short, not too long)
        expect(errorDisplay.message.length).toBeGreaterThan(10);
        expect(errorDisplay.message.length).toBeLessThan(500);
        // Should not contain stack traces or technical jargon
        expect(errorDisplay.message.toLowerCase()).not.toContain("stack");
        expect(errorDisplay.message.toLowerCase()).not.toContain("trace");
        expect(errorDisplay.message.toLowerCase()).not.toContain("exception");
      });
    });
  });

  describe("case sensitivity", () => {
    it("should be case-sensitive for error codes", () => {
      const result1 = getErrorDisplay("UNAUTHORIZED");
      const result2 = getErrorDisplay("unauthorized");
      const result3 = getErrorDisplay("Unauthorized");

      expect(result1).toEqual(ORDER_ERROR_MESSAGES.UNAUTHORIZED);
      expect(result2).toEqual(ORDER_ERROR_MESSAGES.EDIT_NOT_ALLOWED); // Fallback
      expect(result3).toEqual(ORDER_ERROR_MESSAGES.EDIT_NOT_ALLOWED); // Fallback
    });
  });

  describe("edge cases", () => {
    it("should handle whitespace-only error codes", () => {
      const result = getErrorDisplay("   ");

      expect(result).toEqual(ORDER_ERROR_MESSAGES.EDIT_NOT_ALLOWED);
    });

    it("should handle error codes with special characters", () => {
      const result = getErrorDisplay("ERROR_CODE_123");

      expect(result).toEqual(ORDER_ERROR_MESSAGES.EDIT_NOT_ALLOWED);
    });

    it("should handle very long error codes", () => {
      const longCode = "A".repeat(1000);
      const result = getErrorDisplay(longCode);

      expect(result).toEqual(ORDER_ERROR_MESSAGES.EDIT_NOT_ALLOWED);
    });
  });

  describe("error message coverage", () => {
    it("should have messages for all eligibility error codes", () => {
      const eligibilityCodes = [
        "ORDER_FULFILLED",
        "PAYMENT_CAPTURED",
        "PAYMENT_AUTH_INVALID",
        "PAYMENT_NOT_FOUND",
        "PAYMENT_STATUS_INVALID",
      ];

      eligibilityCodes.forEach((code) => {
        const result = getErrorDisplay(code);
        expect(result).not.toEqual(ORDER_ERROR_MESSAGES.EDIT_NOT_ALLOWED);
        expect(result.title).toBeDefined();
        expect(result.message).toBeDefined();
      });
    });

    it("should have messages for all auth error codes", () => {
      const authCodes = [
        "UNAUTHORIZED",
        "TOKEN_EXPIRED",
        "TOKEN_INVALID",
        "TOKEN_MISMATCH",
        "TOKEN_REQUIRED",
      ];

      authCodes.forEach((code) => {
        const result = getErrorDisplay(code);
        expect(result).not.toEqual(ORDER_ERROR_MESSAGES.EDIT_NOT_ALLOWED);
      });
    });

    it("should have messages for rate limiting", () => {
      const result = getErrorDisplay("RATE_LIMITED");
      expect(result).not.toEqual(ORDER_ERROR_MESSAGES.EDIT_NOT_ALLOWED);
    });
  });
});
