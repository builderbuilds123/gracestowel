import { describe, expect, it } from "vitest";
import { isRetryableError } from "../../src/workers/email-worker";

describe("Email Worker helpers", () => {
  describe("isRetryableError", () => {
    it("returns false for 4xx errors except 429", () => {
      expect(isRetryableError({ statusCode: 400 })).toBe(false);
      expect(isRetryableError({ statusCode: 401 })).toBe(false);
      expect(isRetryableError({ statusCode: 403 })).toBe(false);
      expect(isRetryableError({ statusCode: 404 })).toBe(false);
      expect(isRetryableError({ status: 400 })).toBe(false);
      expect(isRetryableError({ response: { status: 401 } })).toBe(false);
    });

    it("returns true for 429 (rate limit)", () => {
      expect(isRetryableError({ statusCode: 429 })).toBe(true);
    });

    it("returns true for 5xx errors", () => {
      expect(isRetryableError({ statusCode: 500 })).toBe(true);
      expect(isRetryableError({ statusCode: 503 })).toBe(true);
    });

    it("returns false for invalid email messages", () => {
      expect(isRetryableError({ message: "Invalid email" })).toBe(false);
      expect(isRetryableError({ message: "Invalid recipient" })).toBe(false);
      expect(isRetryableError({ message: "email address is not valid" })).toBe(false);
    });

    it("returns true for other network/generic errors", () => {
      expect(isRetryableError(new Error("Connection timeout"))).toBe(true);
      expect(isRetryableError({})).toBe(true);
    });
  });
});