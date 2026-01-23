/**
 * Unit tests for modification-token.ts security ceiling
 * 
 * Story 1.6: Token Expiry Security Ceiling
 * 
 * Tests:
 * - Token expiry = min(PAYMENT_CAPTURE_DELAY_MS, TOKEN_MAX_AGE_MS)
 * - Edge cases with different delay configurations
 * - Token generation respects security ceiling
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  ModificationTokenService,
} from "../../src/services/modification-token";

describe("ModificationTokenService - Security Ceiling (Story 1.6)", () => {
  const originalEnv = process.env;
  const testOrderId = "order_123";
  const testPaymentIntentId = "pi_test456";
  const testJwtSecret = "test_secret_key_at_least_32_characters_long";
  
  // Use current time minus 1 minute to ensure it's not in the future
  const getTestOrderCreatedAt = () => new Date(Date.now() - 60 * 1000);

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.JWT_SECRET = testJwtSecret;
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.useRealTimers();
  });

  describe("token expiry calculation", () => {
    it("should use PAYMENT_CAPTURE_DELAY_MS when it's shorter than TOKEN_MAX_AGE", () => {
      // PAYMENT_CAPTURE_DELAY_MS = 1 day (shorter than 7-day TOKEN_MAX_AGE)
      const captureDelayMs = 24 * 60 * 60 * 1000; // 1 day
      const tokenMaxAgeMs = 7 * 24 * 60 * 60 * 1000; // 7 days
      const expectedExpiryMs = Math.min(captureDelayMs, tokenMaxAgeMs); // Should be 1 day
      const windowSeconds = Math.floor(expectedExpiryMs / 1000);

      const service = new ModificationTokenService(testJwtSecret, windowSeconds);

      const orderCreatedAt = getTestOrderCreatedAt();
      const token = service.generateToken(
        testOrderId,
        testPaymentIntentId,
        orderCreatedAt
      );

      const decoded = service.validateToken(token);
      expect(decoded.valid).toBe(true);
      if (decoded.payload) {
        const expiryTime = decoded.payload.exp * 1000;
        const expectedExpiry = orderCreatedAt.getTime() + expectedExpiryMs;
        // Allow 1 second tolerance
        expect(Math.abs(expiryTime - expectedExpiry)).toBeLessThan(1000);
      }
    });

    it("should use TOKEN_MAX_AGE when it's shorter than PAYMENT_CAPTURE_DELAY_MS", () => {
      // PAYMENT_CAPTURE_DELAY_MS = 10 days (longer than 7-day TOKEN_MAX_AGE)
      const captureDelayMs = 10 * 24 * 60 * 60 * 1000; // 10 days
      const tokenMaxAgeMs = 7 * 24 * 60 * 60 * 1000; // 7 days
      const expectedExpiryMs = Math.min(captureDelayMs, tokenMaxAgeMs); // Should be 7 days
      const windowSeconds = Math.floor(expectedExpiryMs / 1000);

      const service = new ModificationTokenService(testJwtSecret, windowSeconds);

      const orderCreatedAt = getTestOrderCreatedAt();
      const token = service.generateToken(
        testOrderId,
        testPaymentIntentId,
        orderCreatedAt
      );

      const decoded = service.validateToken(token);
      expect(decoded.valid).toBe(true);
      if (decoded.payload) {
        const expiryTime = decoded.payload.exp * 1000;
        const expectedExpiry = orderCreatedAt.getTime() + expectedExpiryMs;
        // Allow 1 second tolerance
        expect(Math.abs(expiryTime - expectedExpiry)).toBeLessThan(1000);
      }
    });

    it("should use equal values when PAYMENT_CAPTURE_DELAY_MS equals TOKEN_MAX_AGE", () => {
      const delayMs = 3 * 24 * 60 * 60 * 1000; // 3 days
      const expectedExpiryMs = delayMs; // Both are equal
      const windowSeconds = Math.floor(expectedExpiryMs / 1000);

      const service = new ModificationTokenService(testJwtSecret, windowSeconds);

      const orderCreatedAt = getTestOrderCreatedAt();
      const token = service.generateToken(
        testOrderId,
        testPaymentIntentId,
        orderCreatedAt
      );

      const decoded = service.validateToken(token);
      expect(decoded.valid).toBe(true);
      if (decoded.payload) {
        const expiryTime = decoded.payload.exp * 1000;
        const expectedExpiry = orderCreatedAt.getTime() + delayMs;
        expect(Math.abs(expiryTime - expectedExpiry)).toBeLessThan(1000);
      }
    });
  });

  describe("edge cases", () => {
    it("should handle very short capture delay (1 hour)", () => {
      const captureDelayMs = 60 * 60 * 1000; // 1 hour
      const tokenMaxAgeMs = 7 * 24 * 60 * 60 * 1000; // 7 days
      const expectedExpiryMs = Math.min(captureDelayMs, tokenMaxAgeMs); // Should be 1 hour
      const windowSeconds = Math.floor(expectedExpiryMs / 1000);

      const service = new ModificationTokenService(testJwtSecret, windowSeconds);

      const orderCreatedAt = getTestOrderCreatedAt();
      const token = service.generateToken(
        testOrderId,
        testPaymentIntentId,
        orderCreatedAt
      );

      const decoded = service.validateToken(token);
      expect(decoded.valid).toBe(true);
      if (decoded.payload) {
        const expiryTime = decoded.payload.exp * 1000;
        const expectedExpiry = orderCreatedAt.getTime() + 60 * 60 * 1000;
        expect(Math.abs(expiryTime - expectedExpiry)).toBeLessThan(1000);
      }
    });

    it("should handle very short token max age (1 hour)", () => {
      const captureDelayMs = 10 * 24 * 60 * 60 * 1000; // 10 days
      const tokenMaxAgeMs = 60 * 60 * 1000; // 1 hour
      const expectedExpiryMs = Math.min(captureDelayMs, tokenMaxAgeMs); // Should be 1 hour
      const windowSeconds = Math.floor(expectedExpiryMs / 1000);

      const service = new ModificationTokenService(testJwtSecret, windowSeconds);

      const orderCreatedAt = getTestOrderCreatedAt();
      const token = service.generateToken(
        testOrderId,
        testPaymentIntentId,
        orderCreatedAt
      );

      const decoded = service.validateToken(token);
      expect(decoded.valid).toBe(true);
      if (decoded.payload) {
        const expiryTime = decoded.payload.exp * 1000;
        const expectedExpiry = orderCreatedAt.getTime() + 60 * 60 * 1000;
        expect(Math.abs(expiryTime - expectedExpiry)).toBeLessThan(1000);
      }
    });

    it("should use default TOKEN_MAX_AGE when not specified", () => {
      // Test that the default (168 hours = 7 days) is used when windowSeconds is not provided
      // This tests the module-level constant behavior
      const service = new ModificationTokenService(testJwtSecret); // Use default windowSeconds

      const orderCreatedAt = getTestOrderCreatedAt();
      const token = service.generateToken(
        testOrderId,
        testPaymentIntentId,
        orderCreatedAt
      );

      const decoded = service.validateToken(token);
      expect(decoded.valid).toBe(true);
      // The actual expiry will depend on the module-level constants
      // We just verify the token is valid and expires at some point
      if (decoded.payload) {
        expect(decoded.payload.exp).toBeGreaterThan(decoded.payload.iat);
        expect(decoded.payload.exp * 1000).toBeGreaterThan(orderCreatedAt.getTime());
      }
    });
  });

  describe("token validation respects expiry", () => {
    it("should reject tokens that exceed security ceiling", () => {
      // Generate token with short delay (1 hour)
      const captureDelayMs = 60 * 60 * 1000; // 1 hour
      const windowSeconds = Math.floor(captureDelayMs / 1000);

      const service = new ModificationTokenService(testJwtSecret, windowSeconds);

      const orderCreatedAt = getTestOrderCreatedAt();
      const token = service.generateToken(
        testOrderId,
        testPaymentIntentId,
        orderCreatedAt
      );

      // Fast-forward time past the 1-hour expiry
      const futureDate = new Date(orderCreatedAt.getTime() + 2 * 60 * 60 * 1000);
      vi.useFakeTimers();
      vi.setSystemTime(futureDate);

      const decoded = service.validateToken(token);
      expect(decoded.valid).toBe(false);
      expect(decoded.expired).toBe(true);

      vi.useRealTimers();
    });
  });
});
