import { describe, it, expect, vi, beforeEach } from "vitest";
import { action } from "./api.carts.$id.shipping-methods";

// Mock functions
const mockGetCart = vi.fn();
const mockAddShippingMethod = vi.fn();

// Mock MedusaCartService (follow existing pattern from api.carts.$id.test.ts)
vi.mock("../services/medusa-cart", () => ({
  MedusaCartService: class {
    constructor() {}
    getCart = mockGetCart;
    addShippingMethod = mockAddShippingMethod;
  },
}));

describe("API POST /api/carts/:id/shipping-methods", () => {
  let context: any;

  beforeEach(() => {
    vi.clearAllMocks();
    context = {
      cloudflare: {
        env: {
          MEDUSA_BACKEND_URL: "http://localhost:9000",
          MEDUSA_PUBLISHABLE_KEY: "pk_test_123",
        },
      },
    };
  });

  it("should return 405 for non-POST requests", async () => {
    const request = new Request("http://localhost/api/carts/cart_123/shipping-methods", {
      method: "GET",
    });

    const response = await action({ request, params: { id: "cart_123" }, context });
    const data = (response as any).data;
    expect(data.error).toBe("Method not allowed");
  });

  it("should return 400 when cart ID is missing", async () => {
    const request = new Request("http://localhost/api/carts//shipping-methods", {
      method: "POST",
      body: JSON.stringify({ option_id: "so_test" }),
    });

    const response = await action({ request, params: {}, context });
    const data = (response as any).data;
    expect(data.error).toBe("Cart ID is required");
  });

  it("should return 400 when option_id is missing", async () => {
    const request = new Request("http://localhost/api/carts/cart_123/shipping-methods", {
      method: "POST",
      body: JSON.stringify({}),
    });

    const response = await action({ request, params: { id: "cart_123" }, context });
    const data = (response as any).data;
    expect(data.error).toBe("'option_id' is required");
  });

  it("should return 400 when option_id has invalid format", async () => {
    const request = new Request("http://localhost/api/carts/cart_123/shipping-methods", {
      method: "POST",
      body: JSON.stringify({ option_id: "invalid_id" }),
    });

    const response = await action({ request, params: { id: "cart_123" }, context });
    const data = (response as any).data;
    expect(data.error).toBe("Invalid shipping option ID format");
    expect(data.details).toBe("Shipping option IDs must start with 'so_'");
  });

  it("should return 404 when cart not found", async () => {
    mockGetCart.mockResolvedValue(null);

    const request = new Request("http://localhost/api/carts/cart_123/shipping-methods", {
      method: "POST",
      body: JSON.stringify({ option_id: "so_test123" }),
    });

    const response = await action({ request, params: { id: "cart_123" }, context });
    const data = (response as any).data;
    expect(data.error).toBe("Cart not found");
  });

  it("should successfully add shipping method to cart", async () => {
    const mockCart = {
      id: "cart_123",
      shipping_methods: [{ id: "sm_abc", shipping_option_id: "so_test123" }],
    };
    mockGetCart.mockResolvedValue({ id: "cart_123" });
    mockAddShippingMethod.mockResolvedValue(mockCart);

    const request = new Request("http://localhost/api/carts/cart_123/shipping-methods", {
      method: "POST",
      body: JSON.stringify({ option_id: "so_test123" }),
    });

    const response = await action({ request, params: { id: "cart_123" }, context });
    const data = (response as any).data;

    expect(data.success).toBe(true);
    expect(data.cart_id).toBe("cart_123");
    expect(data.shipping_method_id).toBe("so_test123");
    expect(data.shipping_methods).toEqual(mockCart.shipping_methods);
  });

  it("should return 400 for invalid JSON body", async () => {
    const request = new Request("http://localhost/api/carts/cart_123/shipping-methods", {
      method: "POST",
      // Empty body - will cause JSON parse error  
    });
    Object.defineProperty(request, "json", {
      value: () => Promise.reject(new Error("Invalid JSON")),
    });

    const response = await action({ request, params: { id: "cart_123" }, context });
    const data = (response as any).data;
    expect(data.error).toBe("Invalid JSON body");
  });

  it("should forward upstream 4xx errors", async () => {
    mockGetCart.mockResolvedValue({ id: "cart_123" });
    mockAddShippingMethod.mockRejectedValue({ status: 422, message: "Invalid shipping option" });

    const request = new Request("http://localhost/api/carts/cart_123/shipping-methods", {
      method: "POST",
      body: JSON.stringify({ option_id: "so_test123" }),
    });

    const response = await action({ request, params: { id: "cart_123" }, context });
    const data = (response as any).data;
    expect(data.error).toBe("Invalid shipping option");
  });

  it("should return 502 for upstream server errors", async () => {
    mockGetCart.mockResolvedValue({ id: "cart_123" });
    mockAddShippingMethod.mockRejectedValue(new Error("Upstream failed"));

    const request = new Request("http://localhost/api/carts/cart_123/shipping-methods", {
      method: "POST",
      body: JSON.stringify({ option_id: "so_test123" }),
    });

    const response = await action({ request, params: { id: "cart_123" }, context });
    const data = (response as any).data;
    expect(data.error).toBe("Failed to add shipping method");
  });

  // SHP-01 Review Fix: Add AC validation tests
  it("should return shipping_methods array in response (AC verification)", async () => {
    const mockCart = {
      id: "cart_123",
      shipping_methods: [
        {
          id: "sm_abc",
          shipping_option_id: "so_test123",
          name: "Express Shipping",
          amount: 1500,
          data: { service_code: "UPS_EXPRESS" }
        }
      ],
    };
    mockGetCart.mockResolvedValue({ id: "cart_123" });
    mockAddShippingMethod.mockResolvedValue(mockCart);

    const request = new Request("http://localhost/api/carts/cart_123/shipping-methods", {
      method: "POST",
      body: JSON.stringify({ option_id: "so_test123" }),
    });

    const response = await action({ request, params: { id: "cart_123" }, context });
    const data = (response as any).data;

    // Verify response includes shipping_methods array
    expect(data.shipping_methods).toBeDefined();
    expect(Array.isArray(data.shipping_methods)).toBe(true);
    expect(data.shipping_methods[0].shipping_option_id).toBe("so_test123");
  });

  it("should handle expired cart with CART_EXPIRED code", async () => {
    mockGetCart.mockResolvedValue(null);

    const request = new Request("http://localhost/api/carts/cart_expired/shipping-methods", {
      method: "POST",
      body: JSON.stringify({ option_id: "so_test123" }),
    });

    const response = await action({ request, params: { id: "cart_expired" }, context });
    const data = (response as any).data;

    expect(data.error).toBe("Cart not found");
    expect(data.code).toBe("CART_EXPIRED");
    expect(data.details).toContain("expired");
  });
});
