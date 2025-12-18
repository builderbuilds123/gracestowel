import { describe, it, expect, vi, beforeEach } from "vitest";
import { action } from "./api.shipping-rates";

// Define mock functions
const mockGetCart = vi.fn();
const mockGetOrCreateCart = vi.fn();
const mockSyncCartItems = vi.fn();
const mockUpdateShippingAddress = vi.fn();
const mockGetShippingOptions = vi.fn();

// Mock MedusaCartService
vi.mock("../services/medusa-cart", () => {
  return {
    MedusaCartService: class {
        constructor() {}
        getCart = mockGetCart;
        getOrCreateCart = mockGetOrCreateCart;
        syncCartItems = mockSyncCartItems;
        updateShippingAddress = mockUpdateShippingAddress;
        getShippingOptions = mockGetShippingOptions;
    }
  };
});

// Mock monitoredFetch
const mockMonitoredFetchFn = vi.fn();
vi.mock("../utils/monitored-fetch", () => ({
  monitoredFetch: (...args: any[]) => mockMonitoredFetchFn(...args),
}));

describe("API Shipping Rates", () => {
  let context: any;

  beforeEach(() => {
    vi.clearAllMocks();
    context = {
      cloudflare: {
        env: {
          MEDUSA_BACKEND_URL: "http://medusa",
          MEDUSA_PUBLISHABLE_KEY: "pk_123",
        },
      },
    };
  });

  it("should use existing cart if cartId provided", async () => {
    const request = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({
        cartId: "cart_123",
        currency: "USD",
        cartItems: [],
        shippingAddress: {}
      }),
    });

    mockGetCart.mockResolvedValue({ id: "cart_123" });
    mockSyncCartItems.mockResolvedValue({});
    mockUpdateShippingAddress.mockResolvedValue({});
    mockGetShippingOptions.mockResolvedValue([
      { id: "opt_1", name: "Std", amount: 1000 }
    ]);

    const response: any = await action({ request, params: {}, context });
    expect(response.shippingOptions).toHaveLength(1);
    expect(response.cartId).toBe("cart_123");
    expect(mockGetCart).toHaveBeenCalledWith("cart_123");
  });

  it("should create new cart if cartId invalid/missing", async () => {
    const request = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({
        currency: "USD",
        cartItems: [],
      }),
    });

    // Mock region fetch
    mockMonitoredFetchFn.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ regions: [{ id: "reg_1", currency_code: "USD" }] }),
    });

    mockGetOrCreateCart.mockResolvedValue("cart_new");
    mockSyncCartItems.mockResolvedValue({});
    mockGetShippingOptions.mockResolvedValue([]);

    const response: any = await action({ request, params: {}, context });
    expect(response.cartId).toBe("cart_new");
    expect(mockGetOrCreateCart).toHaveBeenCalledWith("reg_1", "USD");
  });

  it("should return error response if service fails (no fallback)", async () => {
    const request = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({
        cartId: "cart_broken",
        currency: "USD",
        cartItems: [],
      }),
    });

    mockGetCart.mockRejectedValue(new Error("Service error"));

    // Mock regions fetch (happens during cart creation attempt)
    mockMonitoredFetchFn.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ regions: [{ id: "reg_1", currency_code: "USD" }] }),
    });

    // Make cart creation also fail to trigger the error path
    mockGetOrCreateCart.mockRejectedValue(new Error("Cart creation failed"));

    const response = await action({ request, params: {}, context });

    // Should return error response (status 500)
    expect(response).toHaveProperty("data");
    const responseData = (response as any).data;
    expect(responseData.message).toBe("Unable to calculate shipping rates. Please try again.");
    expect(responseData.error).toBe("Cart creation failed");
  });

  it("should return 400 when cartItems is missing", async () => {
    const request = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({
        currency: "USD",
        shippingAddress: { country_code: "US" },
      }),
    });

    const response = await action({ request, params: {}, context });
    expect(response).toHaveProperty("data");
    const responseData = (response as any).data;
    expect(responseData.message).toBe("cartItems array is required");
  });

  it("should return 400 when cartItems is not an array", async () => {
    const request = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({
        cartItems: "not-an-array",
        currency: "USD",
      }),
    });

    const response = await action({ request, params: {}, context });
    expect(response).toHaveProperty("data");
    const responseData = (response as any).data;
    expect(responseData.message).toBe("cartItems array is required");
  });

  it("should return 405 for non-POST requests", async () => {
    const request = new Request("http://localhost", { method: "GET" });
    const response = await action({ request, params: {}, context });
    expect(response).toHaveProperty("data");
    const responseData = (response as any).data;
    expect(responseData.message).toBe("Method not allowed");
  });
});
