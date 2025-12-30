import { describe, it, expect, vi, beforeEach } from "vitest";
import { loader } from "./api.carts.$id.shipping-options";

// Mock functions
const mockGetCart = vi.fn();
const mockGetShippingOptions = vi.fn();

// Mock MedusaCartService
vi.mock("../services/medusa-cart", () => ({
  MedusaCartService: class {
    constructor() {}
    getCart = mockGetCart;
    getShippingOptions = mockGetShippingOptions;
  },
}));

describe("API Carts - GET /api/carts/:id/shipping-options", () => {
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

  it("should return shipping options for a valid cart", async () => {
    mockGetCart.mockResolvedValue({
      id: "cart_123",
      region_id: "reg_us",
    });

    mockGetShippingOptions.mockResolvedValue([
      { id: "so_standard", name: "Standard Shipping", amount: 500 },
      { id: "so_express", name: "Express Shipping", amount: 1500 },
      { id: "so_free", name: "Free Shipping", amount: 0 },
    ]);

    const response = await loader({
      request: new Request("http://localhost"),
      params: { id: "cart_123" },
      context,
    });

    const data = (response as any).data;
    expect(data.shipping_options).toHaveLength(3);
    expect(data.cart_id).toBe("cart_123");
    expect(data.region_id).toBe("reg_us");
    
    // Verify formatting
    expect(data.shipping_options[0]).toEqual({
      id: "so_standard",
      displayName: "Standard Shipping",
      amount: 500,
      isFree: false,
      deliveryEstimate: null,
    });
    expect(data.shipping_options[2].isFree).toBe(true);
  });

  it("should return empty array when no shipping options available", async () => {
    mockGetCart.mockResolvedValue({
      id: "cart_123",
      region_id: "reg_us",
    });

    mockGetShippingOptions.mockResolvedValue([]);

    const response = await loader({
      request: new Request("http://localhost"),
      params: { id: "cart_123" },
      context,
    });

    const data = (response as any).data;
    expect(data.shipping_options).toHaveLength(0);
  });

  it("should return 404 when cart not found", async () => {
    mockGetCart.mockResolvedValue(null);

    const response = await loader({
      request: new Request("http://localhost"),
      params: { id: "cart_nonexistent" },
      context,
    });

    const data = (response as any).data;
    expect(data.error).toBe("Cart not found");
  });

  it("should return 400 when cart ID is missing", async () => {
    const response = await loader({
      request: new Request("http://localhost"),
      params: {},
      context,
    });

    const data = (response as any).data;
    expect(data.error).toBe("Cart ID is required");
  });

  it("should include cache headers in response", async () => {
    mockGetCart.mockResolvedValue({
      id: "cart_123",
      region_id: "reg_us",
    });

    mockGetShippingOptions.mockResolvedValue([
      { id: "so_1", name: "Standard", amount: 500 },
    ]);

    const response = await loader({
      request: new Request("http://localhost"),
      params: { id: "cart_123" },
      context,
    });

    // The response should have cache headers set
    expect(response).toHaveProperty("init");
    const init = (response as any).init;
    expect(init.headers["Cache-Control"]).toBe("private, max-age=60");
  });

  it("should handle service errors gracefully", async () => {
    mockGetCart.mockResolvedValue({
      id: "cart_123",
      region_id: "reg_us",
    });

    mockGetShippingOptions.mockRejectedValue(new Error("Fulfillment service unavailable"));

    const response = await loader({
      request: new Request("http://localhost"),
      params: { id: "cart_123" },
      context,
    });

    const data = (response as any).data;
    expect(data.error).toBe("Failed to fetch shipping options");
    expect(data.details).toBe("Fulfillment service unavailable");
  });

  it("should correctly identify free shipping options", async () => {
    mockGetCart.mockResolvedValue({ id: "cart_123", region_id: "reg_us" });
    
    mockGetShippingOptions.mockResolvedValue([
      { id: "so_paid", name: "Paid Shipping", amount: 1000 },
      { id: "so_free", name: "Free Promo Shipping", amount: 0 },
    ]);

    const response = await loader({
      request: new Request("http://localhost"),
      params: { id: "cart_123" },
      context,
    });

    const data = (response as any).data;
    const paidOption = data.shipping_options.find((o: any) => o.id === "so_paid");
    const freeOption = data.shipping_options.find((o: any) => o.id === "so_free");
    
    expect(paidOption.isFree).toBe(false);
    expect(freeOption.isFree).toBe(true);
  });
});
