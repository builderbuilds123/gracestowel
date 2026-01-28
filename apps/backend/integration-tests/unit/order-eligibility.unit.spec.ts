/**
 * Unit tests for order-eligibility.ts
 * 
 * Story 1.4: Order Edit Eligibility Check
 * 
 * Tests:
 * - Fulfillment status checks
 * - Payment status checks
 * - Stripe PaymentIntent status validation
 * - Error handling and edge cases
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import Stripe from "stripe";
import { checkOrderEditEligibility, EligibilityErrorCode } from "../../../src/utils/order-eligibility";

// Mock Stripe - need to create a proper class mock
const mockStripeRetrieve = vi.fn();

vi.mock("stripe", () => {
  // Create mock function inside the factory
  const retrieveFn = vi.fn();
  
  // Store reference globally for test access
  (global as any).__mockStripeRetrieve = retrieveFn;
  
  return {
    default: class MockStripe {
      paymentIntents: {
        retrieve: typeof retrieveFn;
      };
      
      constructor(apiKey: string, options?: any) {
        this.paymentIntents = {
          retrieve: retrieveFn,
        };
      }
    },
  };
});

// Get the mock retrieve function
const getMockRetrieve = () => (global as any).__mockStripeRetrieve || mockStripeRetrieve;

// Mock logger
vi.mock("../../../src/utils/logger", () => ({
  logger: {
    error: vi.fn(),
  },
}));

describe("checkOrderEditEligibility", () => {
  const mockOrderBase = {
    id: "order_123",
    created_at: new Date().toISOString(),
    fulfillment_status: "not_fulfilled",
    payment_collections: [
      {
        payments: [
          {
            data: { id: "pi_test123" },
            captured_at: null,
          },
        ],
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_API_KEY = "sk_test_mock";
  });

  describe("fulfillment status checks", () => {
    const blockedStatuses = [
      "fulfilled",
      "partially_fulfilled",
      "shipped",
      "partially_shipped",
      "delivered",
      "partially_delivered",
    ];

    blockedStatuses.forEach((status) => {
      it(`should return ORDER_FULFILLED for fulfillment_status: ${status}`, async () => {
        const order = {
          ...mockOrderBase,
          fulfillment_status: status,
        };

        const result = await checkOrderEditEligibility(order);

        expect(result.eligible).toBe(false);
        expect(result.errorCode).toBe("ORDER_FULFILLED");
        expect(result.debugContext?.fulfillmentStatus).toBe(status);
        expect(getMockRetrieve()).not.toHaveBeenCalled();
      });
    });

    it("should allow editing for not_fulfilled status", async () => {
      const order = {
        ...mockOrderBase,
        fulfillment_status: "not_fulfilled",
      };

      getMockRetrieve().mockResolvedValue({
        status: "requires_capture",
      });

      const result = await checkOrderEditEligibility(order);

      expect(result.eligible).toBe(true);
      expect(result.errorCode).toBeUndefined();
    });

    it("should allow editing for null fulfillment_status", async () => {
      const order = {
        ...mockOrderBase,
        fulfillment_status: null as any,
      };

      getMockRetrieve().mockResolvedValue({
        status: "requires_capture",
      });

      const result = await checkOrderEditEligibility(order);

      expect(result.eligible).toBe(true);
    });
  });

  describe("payment collection checks", () => {
    it("should return PAYMENT_NOT_FOUND when payment_collections is missing", async () => {
      const order = {
        ...mockOrderBase,
        payment_collections: undefined,
      };

      const result = await checkOrderEditEligibility(order);

      expect(result.eligible).toBe(false);
      expect(result.errorCode).toBe("PAYMENT_NOT_FOUND");
      expect(result.debugContext?.hasPaymentCollections).toBe(false);
      expect(getMockRetrieve()).not.toHaveBeenCalled();
    });

    it("should return PAYMENT_NOT_FOUND when payment_collections is empty", async () => {
      const order = {
        ...mockOrderBase,
        payment_collections: [],
      };

      const result = await checkOrderEditEligibility(order);

      expect(result.eligible).toBe(false);
      expect(result.errorCode).toBe("PAYMENT_NOT_FOUND");
      expect(result.debugContext?.hasPaymentCollections).toBe(false); // Empty array has length 0
    });

    it("should return PAYMENT_NOT_FOUND when payments array is missing", async () => {
      const order = {
        ...mockOrderBase,
        payment_collections: [{}],
      };

      const result = await checkOrderEditEligibility(order);

      expect(result.eligible).toBe(false);
      expect(result.errorCode).toBe("PAYMENT_NOT_FOUND");
    });

    it("should return PAYMENT_NOT_FOUND when payments array is empty", async () => {
      const order = {
        ...mockOrderBase,
        payment_collections: [{ payments: [] }],
      };

      const result = await checkOrderEditEligibility(order);

      expect(result.eligible).toBe(false);
      expect(result.errorCode).toBe("PAYMENT_NOT_FOUND");
    });

    it("should return PAYMENT_NOT_FOUND when payment data.id is missing", async () => {
      const order = {
        ...mockOrderBase,
        payment_collections: [
          {
            payments: [{ data: {} }],
          },
        ],
      };

      const result = await checkOrderEditEligibility(order);

      expect(result.eligible).toBe(false);
      expect(result.errorCode).toBe("PAYMENT_NOT_FOUND");
    });
  });

  describe("captured payment checks", () => {
    it("should return PAYMENT_CAPTURED when payment.captured_at is set", async () => {
      const capturedAt = new Date().toISOString();
      const order = {
        ...mockOrderBase,
        payment_collections: [
          {
            payments: [
              {
                data: { id: "pi_test123" },
                captured_at: capturedAt,
              },
            ],
          },
        ],
      };

      const result = await checkOrderEditEligibility(order);

      expect(result.eligible).toBe(false);
      expect(result.errorCode).toBe("PAYMENT_CAPTURED");
      expect(result.debugContext?.capturedAt).toBe(capturedAt);
      expect(getMockRetrieve()).not.toHaveBeenCalled();
    });

    it("should allow editing when captured_at is null", async () => {
      const order = {
        ...mockOrderBase,
        payment_collections: [
          {
            payments: [
              {
                data: { id: "pi_test123" },
                captured_at: null,
              },
            ],
          },
        ],
      };

      getMockRetrieve().mockResolvedValue({
        status: "requires_capture",
      });

      const result = await checkOrderEditEligibility(order);

      expect(result.eligible).toBe(true);
    });
  });

  describe("Stripe PaymentIntent status checks", () => {
    it("should return eligible for requires_capture status", async () => {
      const order = { ...mockOrderBase };
      getMockRetrieve().mockResolvedValue({
        status: "requires_capture",
      });

      const result = await checkOrderEditEligibility(order);

      expect(result.eligible).toBe(true);
      expect(result.errorCode).toBeUndefined();
      expect(getMockRetrieve()).toHaveBeenCalledWith("pi_test123");
    });

    it("should return PAYMENT_CAPTURED for succeeded status", async () => {
      const order = { ...mockOrderBase };
      getMockRetrieve().mockResolvedValue({
        status: "succeeded",
      });

      const result = await checkOrderEditEligibility(order);

      expect(result.eligible).toBe(false);
      expect(result.errorCode).toBe("PAYMENT_CAPTURED");
      expect(result.debugContext?.paymentStatus).toBe("succeeded");
    });

    it("should return PAYMENT_AUTH_INVALID for canceled status", async () => {
      const order = {
        ...mockOrderBase,
        created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
      };
      getMockRetrieve().mockResolvedValue({
        status: "canceled",
      });

      const result = await checkOrderEditEligibility(order);

      expect(result.eligible).toBe(false);
      expect(result.errorCode).toBe("PAYMENT_AUTH_INVALID");
      expect(result.debugContext?.paymentStatus).toBe("canceled");
      expect(result.debugContext?.daysSinceOrder).toBe(2);
    });

    it("should return PAYMENT_STATUS_INVALID for other statuses", async () => {
      const invalidStatuses = [
        "requires_payment_method",
        "requires_confirmation",
        "processing",
        "requires_action",
      ];

      for (const status of invalidStatuses) {
        vi.clearAllMocks();
        const order = { ...mockOrderBase };
        getMockRetrieve().mockResolvedValue({ status });

        const result = await checkOrderEditEligibility(order);

        expect(result.eligible).toBe(false);
        expect(result.errorCode).toBe("PAYMENT_STATUS_INVALID");
        expect(result.debugContext?.paymentStatus).toBe(status);
      }
    });
  });

  describe("error handling", () => {
    it("should return PAYMENT_NOT_FOUND when Stripe API call fails", async () => {
      const order = { ...mockOrderBase };
      const stripeError = new Error("Stripe API error");
      getMockRetrieve().mockRejectedValue(stripeError);

      const result = await checkOrderEditEligibility(order);

      expect(result.eligible).toBe(false);
      expect(result.errorCode).toBe("PAYMENT_NOT_FOUND");
      expect(result.debugContext?.error).toBe("Stripe API error");
    });

    it("should handle network errors gracefully", async () => {
      const order = { ...mockOrderBase };
      getMockRetrieve().mockRejectedValue(new Error("Network timeout"));

      const result = await checkOrderEditEligibility(order);

      expect(result.eligible).toBe(false);
      expect(result.errorCode).toBe("PAYMENT_NOT_FOUND");
    });

    it("should handle non-Error exceptions", async () => {
      const order = { ...mockOrderBase };
      getMockRetrieve().mockRejectedValue("String error");

      const result = await checkOrderEditEligibility(order);

      expect(result.eligible).toBe(false);
      expect(result.errorCode).toBe("PAYMENT_NOT_FOUND");
      expect(result.debugContext?.error).toBe("String error");
    });
  });

  describe("edge cases", () => {
    it("should handle Date objects for created_at", async () => {
      const order = {
        ...mockOrderBase,
        created_at: new Date(),
      };
      getMockRetrieve().mockResolvedValue({
        status: "requires_capture",
      });

      const result = await checkOrderEditEligibility(order);

      expect(result.eligible).toBe(true);
    });

    it("should handle multiple payment collections (uses first)", async () => {
      const order = {
        ...mockOrderBase,
        payment_collections: [
          {
            payments: [
              {
                data: { id: "pi_first" },
                captured_at: null,
              },
            ],
          },
          {
            payments: [
              {
                data: { id: "pi_second" },
                captured_at: null,
              },
            ],
          },
        ],
      };
      getMockRetrieve().mockResolvedValue({
        status: "requires_capture",
      });

      const result = await checkOrderEditEligibility(order);

      expect(result.eligible).toBe(true);
      expect(getMockRetrieve()).toHaveBeenCalledWith("pi_first");
    });

    it("should handle multiple payments in collection (uses first)", async () => {
      const order = {
        ...mockOrderBase,
        payment_collections: [
          {
            payments: [
              {
                data: { id: "pi_first" },
                captured_at: null,
              },
              {
                data: { id: "pi_second" },
                captured_at: null,
              },
            ],
          },
        ],
      };
      getMockRetrieve().mockResolvedValue({
        status: "requires_capture",
      });

      const result = await checkOrderEditEligibility(order);

      expect(result.eligible).toBe(true);
      expect(getMockRetrieve()).toHaveBeenCalledWith("pi_first");
    });
  });
});
