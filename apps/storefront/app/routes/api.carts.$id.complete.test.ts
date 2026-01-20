
import { describe, it, expect, vi, beforeEach } from "vitest";
import { action } from "./api.carts.$id.complete";

// Mock functions
const mockGetCart = vi.fn();
const mockCompleteCart = vi.fn();
const mockUpdateCart = vi.fn();

// Mock MedusaCartService
vi.mock("../services/medusa-cart", () => ({
  MedusaCartService: class {
    constructor() {}
    getCart = mockGetCart;
    completeCart = mockCompleteCart;
    updateCart = mockUpdateCart;
  },
}));

// Mock monitoredFetch
const mockMonitoredFetchFn = vi.fn();
vi.mock("../utils/monitored-fetch", () => ({
    monitoredFetch: (...args: any[]) => mockMonitoredFetchFn(...args),
}));

// Mock validateCSRFToken
const mockValidateCSRFToken = vi.fn();
vi.mock("../utils/csrf.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../utils/csrf.server")>();
  return {
    ...actual,
    validateCSRFToken: (...args: any[]) => mockValidateCSRFToken(...args),
    resolveCSRFSecret: vi.fn(() => "test-secret"),
  };
});

describe("API POST /api/carts/:id/complete", () => {
  let context: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockValidateCSRFToken.mockResolvedValue(true);
    context = {
      cloudflare: {
        env: {
          MEDUSA_BACKEND_URL: "http://localhost:9000",
          MEDUSA_PUBLISHABLE_KEY: "pk_test_123",
          JWT_SECRET: "test-secret",
        },
      },
    };
  });

  it("should return 405 for non-POST requests", async () => {
    const request = new Request("http://localhost/api/carts/cart_123/complete", {
      method: "GET",
    });

    const response = await action({ request, params: { id: "cart_123" }, context } as any);
    const data = (response as any).data;
    expect(data.error).toBe("Method not allowed");
  });

  it("should return 403 if CSRF token is invalid", async () => {
    mockValidateCSRFToken.mockResolvedValue(false);
    const request = new Request("http://localhost/api/carts/cart_123/complete", {
        method: "POST",
    });

    const response = await action({ request, params: { id: "cart_123" }, context } as any);
    const data = (response as any).data;
    expect((response as any).init.status).toBe(403);
    expect(data.error).toBe("Invalid CSRF token");
  });

  it("should return 400 when cart ID is missing", async () => {
    const request = new Request("http://localhost/api/carts//complete", {
      method: "POST",
    });

    const response = await action({ request, params: {}, context } as any);
    const data = (response as any).data;
    expect(data.error).toBe("Cart ID is required");
  });

  it("should return 404 when cart not found", async () => {
    mockMonitoredFetchFn.mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ message: "Cart not found" }),
    });

    const request = new Request("http://localhost/api/carts/cart_999/complete", {
      method: "POST",
    });

    const response = await action({ request, params: { id: "cart_999" }, context } as any);
    const data = (response as any).data;
    expect(data.error).toBe("Cart not found");
  });

  it("should complete cart successfully", async () => {
      mockMonitoredFetchFn.mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({ type: "order", order: { id: "order_123", display_id: 1001 } }),
      });

      const request = new Request("http://localhost/api/carts/cart_123/complete", {
          method: "POST",
      });

      const response = await action({ request, params: { id: "cart_123" }, context } as any);
      const data = (response as any).data;
      
      expect(data.success).toBe(true);
      expect(data.orderId).toBe("order_123");
      expect(data.orderNumber).toBe(1001);
  });
});
