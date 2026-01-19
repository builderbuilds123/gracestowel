import { describe, it, expect, vi, beforeEach } from "vitest";
import { action } from "./api.carts";

// Mock functions
const mockGetOrCreateCart = vi.fn();

// Mock MedusaCartService
vi.mock("../services/medusa-cart", () => ({
  MedusaCartService: class {
    constructor() {}
    getOrCreateCart = mockGetOrCreateCart;
  },
}));

// Mock monitoredFetch
const mockMonitoredFetchFn = vi.fn();
vi.mock("../utils/monitored-fetch", () => ({
  monitoredFetch: (...args: any[]) => mockMonitoredFetchFn(...args),
}));

// Mock validateCSRFToken
const mockValidateCSRFToken = vi.fn();
vi.mock("../utils/csrf.server", () => ({
  validateCSRFToken: (...args: any[]) => mockValidateCSRFToken(...args),
}));

describe("API Carts - POST /api/carts", () => {
  let context: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockValidateCSRFToken.mockResolvedValue(true);
    context = {
      cloudflare: {
        env: {
          MEDUSA_BACKEND_URL: "http://localhost:9000",
          MEDUSA_PUBLISHABLE_KEY: "pk_test_123",
        },
      },
    };
  });

  it("should create cart with default currency (CAD)", async () => {
    const request = new Request("http://localhost/api/carts", {
      method: "POST",
      body: JSON.stringify({}),
    });

    mockMonitoredFetchFn.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        regions: [
          { id: "reg_ca", name: "Canada", currency_code: "CAD", countries: [{ iso_2: "ca" }] },
        ],
      }),
    });

    mockGetOrCreateCart.mockResolvedValue("cart_test_123");

    const response = await action({ request, params: {}, context });
    expect(response).toHaveProperty("data");
    const data = (response as any).data;
    expect(data.cart_id).toBe("cart_test_123");
    expect(data.region_id).toBe("reg_ca");
  });

  it("should create cart with specified country code", async () => {
    const request = new Request("http://localhost/api/carts", {
      method: "POST",
      body: JSON.stringify({ country_code: "US" }),
    });

    mockMonitoredFetchFn.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        regions: [
          { id: "reg_ca", name: "Canada", currency_code: "CAD", countries: [{ iso_2: "ca" }] },
          { id: "reg_us", name: "United States", currency_code: "USD", countries: [{ iso_2: "us" }] },
        ],
      }),
    });

    mockGetOrCreateCart.mockResolvedValue("cart_us_123");

    const response = await action({ request, params: {}, context });
    const data = (response as any).data;
    expect(data.cart_id).toBe("cart_us_123");
    expect(data.region_id).toBe("reg_us");
  });

  it("should return 405 for non-POST requests", async () => {
    const request = new Request("http://localhost/api/carts", {
      method: "GET",
    });

    const response = await action({ request, params: {}, context });
    const data = (response as any).data;
    expect(data.error).toBe("Method not allowed");
  });

  it("should return 500 when MEDUSA_PUBLISHABLE_KEY is missing", async () => {
    const request = new Request("http://localhost/api/carts", {
      method: "POST",
      body: JSON.stringify({}),
    });

    context.cloudflare.env.MEDUSA_PUBLISHABLE_KEY = undefined;

    const response = await action({ request, params: {}, context });
    const data = (response as any).data;
    expect(data.error).toBe("Missing MEDUSA_PUBLISHABLE_KEY");
  });

  it("should return 400 when no valid region found", async () => {
    const request = new Request("http://localhost/api/carts", {
      method: "POST",
      body: JSON.stringify({ country_code: "XX" }),
    });

    mockMonitoredFetchFn.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ regions: [] }),
    });

    const response = await action({ request, params: {}, context });
    const data = (response as any).data;
    expect(data.error).toBe("No valid region found");
  });

  it("should handle region fetch failure", async () => {
    const request = new Request("http://localhost/api/carts", {
      method: "POST",
      body: JSON.stringify({}),
    });

    mockMonitoredFetchFn.mockResolvedValueOnce({
      ok: false,
      text: async () => "Server error",
    });

    const response = await action({ request, params: {}, context });
    const data = (response as any).data;
    expect(data.error).toBe("Failed to fetch regions");
  });
});
