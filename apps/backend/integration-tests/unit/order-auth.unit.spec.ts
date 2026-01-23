/**
 * Unit tests for order-auth.ts
 * 
 * Story 2.3: Unified Order Authentication Utility
 * 
 * Tests:
 * - Customer session authentication (priority 1)
 * - Guest token authentication (priority 2)
 * - Authentication failure cases
 * - Edge cases
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { MedusaRequest } from "@medusajs/framework/http";

// Mock modification-token service first
vi.mock("../../../src/services/modification-token");

// Import after mock
import { authenticateOrderAccess, AuthMethod } from "../../../src/utils/order-auth";
import { modificationTokenService } from "../../../src/services/modification-token";

// Spy on the mocked service method
const mockValidateTokenFn = vi.spyOn(modificationTokenService, "validateToken");

describe("authenticateOrderAccess", () => {
  const testOrderId = "order_123";
  const testCustomerId = "customer_456";
  const testToken = "test_token_123";

  let mockReq: Partial<MedusaRequest>;

  beforeEach(() => {
    vi.clearAllMocks();
    // Ensure the mock is reset for each test
    mockValidateTokenFn.mockClear();
    mockReq = {
      auth_context: undefined,
      headers: {},
    };
  });

  describe("customer session authentication (priority 1)", () => {
    it("should authenticate when customer session matches order customer_id", async () => {
      mockReq.auth_context = {
        auth_identity_id: "auth_identity_123",
        actor_id: testCustomerId,
      };

      const order = {
        id: testOrderId,
        customer_id: testCustomerId,
      };

      const result = await authenticateOrderAccess(mockReq as MedusaRequest, order);

      expect(result.authenticated).toBe(true);
      expect(result.method).toBe("customer_session");
      expect(result.customerId).toBe(testCustomerId);
      expect(mockValidateTokenFn).not.toHaveBeenCalled();
    });

    it("should reject when customer session exists but doesn't own order", async () => {
      mockReq.auth_context = {
        auth_identity_id: "auth_identity_123",
        actor_id: testCustomerId,
      };

      const order = {
        id: testOrderId,
        customer_id: "different_customer_789",
      };

      const result = await authenticateOrderAccess(mockReq as MedusaRequest, order);

      expect(result.authenticated).toBe(false);
      expect(result.method).toBe("none");
      expect(result.customerId).toBe(null);
    });

    it("should reject when auth_context exists but actor_id is missing", async () => {
      mockReq.auth_context = {
        auth_identity_id: "auth_identity_123",
        actor_id: undefined,
      };

      const order = {
        id: testOrderId,
        customer_id: testCustomerId,
      };

      const result = await authenticateOrderAccess(mockReq as MedusaRequest, order);

      expect(result.authenticated).toBe(false);
      expect(result.method).toBe("none");
    });

    it("should reject when auth_context exists but auth_identity_id is missing", async () => {
      mockReq.auth_context = {
        auth_identity_id: undefined,
        actor_id: testCustomerId,
      };

      const order = {
        id: testOrderId,
        customer_id: testCustomerId,
      };

      const result = await authenticateOrderAccess(mockReq as MedusaRequest, order);

      expect(result.authenticated).toBe(false);
      expect(result.method).toBe("none");
    });
  });

  describe("guest token authentication (priority 2)", () => {
    it("should authenticate with valid guest token for order without customer_id", async () => {
      mockReq.headers = {
        "x-modification-token": testToken,
      };

      const order = {
        id: testOrderId,
        customer_id: null,
      };

      // Reset and set up mock - ensure it returns the expected value
      mockValidateTokenFn.mockReset();
      mockValidateTokenFn.mockReturnValue({
        valid: true,
        payload: { order_id: testOrderId },
      });

      // The mock should be applied, but if not, the test will fail on the assertion below

      const result = await authenticateOrderAccess(mockReq as MedusaRequest, order);

      // Verify mock was called
      expect(mockValidateTokenFn).toHaveBeenCalledWith(testToken);
      expect(mockValidateTokenFn).toHaveBeenCalledTimes(1);
      
      // Verify result
      expect(result.authenticated).toBe(true);
      expect(result.method).toBe("guest_token");
      expect(result.customerId).toBe(null);
    });

    it("should authenticate with valid guest token when customer_id is undefined", async () => {
      mockReq.headers = {
        "x-modification-token": testToken,
      };

      const order = {
        id: testOrderId,
        customer_id: undefined,
      };

      mockValidateTokenFn.mockReturnValue({
        valid: true,
        payload: { order_id: testOrderId },
      });

      const result = await authenticateOrderAccess(mockReq as MedusaRequest, order);

      expect(result.authenticated).toBe(true);
      expect(result.method).toBe("guest_token");
    });

    it("should reject when token is invalid", async () => {
      mockReq.headers = {
        "x-modification-token": testToken,
      };

      const order = {
        id: testOrderId,
        customer_id: null,
      };

      mockValidateTokenFn.mockReturnValue({
        valid: false,
        error: "Token expired",
      });

      const result = await authenticateOrderAccess(mockReq as MedusaRequest, order);

      expect(result.authenticated).toBe(false);
      expect(result.method).toBe("none");
    });

    it("should reject when token order_id doesn't match order id", async () => {
      mockReq.headers = {
        "x-modification-token": testToken,
      };

      const order = {
        id: testOrderId,
        customer_id: null,
      };

      mockValidateTokenFn.mockReturnValue({
        valid: true,
        payload: { order_id: "different_order_789" },
      });

      const result = await authenticateOrderAccess(mockReq as MedusaRequest, order);

      expect(result.authenticated).toBe(false);
      expect(result.method).toBe("none");
    });

    it("should reject when token payload is missing", async () => {
      mockReq.headers = {
        "x-modification-token": testToken,
      };

      const order = {
        id: testOrderId,
        customer_id: null,
      };

      mockValidateTokenFn.mockReturnValue({
        valid: true,
        payload: undefined,
      });

      const result = await authenticateOrderAccess(mockReq as MedusaRequest, order);

      expect(result.authenticated).toBe(false);
      expect(result.method).toBe("none");
    });

    it("should not check guest token when order has customer_id", async () => {
      mockReq.headers = {
        "x-modification-token": testToken,
      };

      const order = {
        id: testOrderId,
        customer_id: testCustomerId,
      };

      const result = await authenticateOrderAccess(mockReq as MedusaRequest, order);

      expect(result.authenticated).toBe(false);
      expect(result.method).toBe("none");
      expect(mockValidateTokenFn).not.toHaveBeenCalled();
    });

    it("should not check guest token when token header is missing", async () => {
      mockReq.headers = {};

      const order = {
        id: testOrderId,
        customer_id: null,
      };

      const result = await authenticateOrderAccess(mockReq as MedusaRequest, order);

      expect(result.authenticated).toBe(false);
      expect(result.method).toBe("none");
      expect(mockValidateTokenFn).not.toHaveBeenCalled();
    });
  });

  describe("authentication priority", () => {
    it("should prioritize customer session over guest token", async () => {
      mockReq.auth_context = {
        auth_identity_id: "auth_identity_123",
        actor_id: testCustomerId,
      };
      mockReq.headers = {
        "x-modification-token": testToken,
      };

      const order = {
        id: testOrderId,
        customer_id: testCustomerId,
      };

      const result = await authenticateOrderAccess(mockReq as MedusaRequest, order);

      expect(result.authenticated).toBe(true);
      expect(result.method).toBe("customer_session");
      expect(mockValidateTokenFn).not.toHaveBeenCalled();
    });

    it("should reject when customer session exists but doesn't match order", async () => {
      // When a customer is logged in but doesn't own the order,
      // we should reject (security: don't allow access via guest token if logged in as wrong user)
      mockReq.auth_context = {
        auth_identity_id: "auth_identity_123",
        actor_id: "different_customer", // Logged in as different customer
      };
      mockReq.headers = {
        "x-modification-token": testToken,
      };

      const order = {
        id: testOrderId,
        customer_id: null, // Order has no customer_id
      };

      // Reset and set up mock (should not be called due to early return)
      mockValidateTokenFn.mockReset();

      const result = await authenticateOrderAccess(mockReq as MedusaRequest, order);

      // Should reject because customer session exists but doesn't match
      // (Security: don't fall back to guest token when logged in as wrong user)
      expect(result.authenticated).toBe(false);
      expect(result.method).toBe("none");
      expect(mockValidateTokenFn).not.toHaveBeenCalled();
    });
  });

  describe("no authentication", () => {
    it("should return unauthenticated when no auth methods are available", async () => {
      mockReq.auth_context = undefined;
      mockReq.headers = {};

      const order = {
        id: testOrderId,
        customer_id: null,
      };

      const result = await authenticateOrderAccess(mockReq as MedusaRequest, order);

      expect(result.authenticated).toBe(false);
      expect(result.method).toBe("none");
      expect(result.customerId).toBe(null);
    });

    it("should return unauthenticated for order with customer_id but no session", async () => {
      mockReq.auth_context = undefined;
      mockReq.headers = {};

      const order = {
        id: testOrderId,
        customer_id: testCustomerId,
      };

      const result = await authenticateOrderAccess(mockReq as MedusaRequest, order);

      expect(result.authenticated).toBe(false);
      expect(result.method).toBe("none");
    });
  });

  describe("edge cases", () => {
    it("should handle empty order id", async () => {
      const order = {
        id: "",
        customer_id: null,
      };

      mockReq.headers = {
        "x-modification-token": testToken,
      };

      mockValidateTokenFn.mockReturnValue({
        valid: true,
        payload: { order_id: "" },
      });

      const result = await authenticateOrderAccess(mockReq as MedusaRequest, order);

      expect(result.authenticated).toBe(true);
      expect(result.method).toBe("guest_token");
    });

    it("should handle special characters in order id", async () => {
      const specialOrderId = "order_test-123_abc";
      const order = {
        id: specialOrderId,
        customer_id: null,
      };

      mockReq.headers = {
        "x-modification-token": testToken,
      };

      mockValidateTokenFn.mockReturnValue({
        valid: true,
        payload: { order_id: specialOrderId },
      });

      const result = await authenticateOrderAccess(mockReq as MedusaRequest, order);

      expect(result.authenticated).toBe(true);
    });
  });
});
