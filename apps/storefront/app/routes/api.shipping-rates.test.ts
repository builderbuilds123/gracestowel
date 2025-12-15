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

  it("should fallback to region-based fetch if service fails", async () => {
    const request = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({
        cartId: "cart_broken",
        currency: "USD",
        cartItems: [],
      }),
    });

    mockGetCart.mockRejectedValue(new Error("Service error"));

    // Fallback mocks
    mockMonitoredFetchFn
      // First call is in step 2 (getOrCreateCart requires regions).
      // Wait, let's trace the execution.
      // 1. service.getCart throws Error("Service error")
      // 2. Catch block
      // 3. Fallback logic starts
      //    - Fetch regions
      //    - Fetch options

      .mockResolvedValueOnce({ // Regions for fallback
        ok: true,
        json: async () => ({ regions: [{ id: "reg_1", currency_code: "USD" }] }),
      })
      .mockResolvedValueOnce({ // Options for fallback
        ok: true,
        json: async () => ({ shipping_options: [{ id: "opt_fallback", name: "Fallback", amount: 500 }] }),
      });

    const response: any = await action({ request, params: {}, context });

    // Check if we hit the fallback
    // Note: The code calls fetch regions inside the "If no valid cartId" block too, but ONLY if we haven't tried to get cart or if we want to create one.
    // In this test case:
    // 1. We have cartId "cart_broken".
    // 2. service.getCart("cart_broken") throws.
    // 3. cartId becomes undefined.
    // 4. "If no valid cartId, create one" block executes.
    //    - Fetches regions (mockMonitoredFetchFn call 1)
    //    - calls getOrCreateCart -> returns undefined or throws?
    //    - Wait, if getCart throws, we set cartId = undefined.
    //    - Then we enter step 2: if (!cartId).
    //    - We fetch regions.
    //    - We call getOrCreateCart.
    //    - If getOrCreateCart succeeds, we have a new cartId.
    //    - Then syncItems/updateAddress/getOptions.
    //    - If THOSE fail, we go to catch block.

    // But in my test setup:
    // mockGetCart rejects. -> cartId = undefined.
    // Step 2: fetch regions. (Call 1) -> success.
    // calls getOrCreateCart -> I mocked it to resolve "cart_new" in previous test, but here I didn't set a return value, so it returns undefined by default.
    // So cartId remains undefined.
    // Then "if (!cartId) throw Error('Failed to initialize cart')".
    // This throws.
    // Catch block.
    // Fallback logic.
    // Fetch regions (Call 2).
    // Fetch options (Call 3).

    // So we expect 3 calls if getOrCreateCart fails/returns nothing.

    // Let's adjust expectations or mocks.
    // If I want to test "Service error" triggers fallback, I should make the service error bubble up or happen in a way that triggers catch.

    // In the code:
    // if (cartId) { try { getCart } catch { cartId = undefined } }
    // So getCart failure just means we try to create a new cart.
    // It doesn't go to catch block immediately.

    // To trigger the MAIN catch block (and thus fallback), something must throw that isn't caught.
    // E.g. getOrCreateCart throws, or syncCartItems throws.

    // Let's make getOrCreateCart throw.
    mockGetOrCreateCart.mockRejectedValue(new Error("Creation failed"));

    // Reset mocks count
    mockMonitoredFetchFn.mockReset();

    // Setup fetch mocks again
    mockMonitoredFetchFn
      .mockResolvedValueOnce({ // Regions (attempted during creation)
        ok: true,
        json: async () => ({ regions: [{ id: "reg_1", currency_code: "USD" }] }),
      })
      .mockResolvedValueOnce({ // Regions (fallback)
        ok: true,
        json: async () => ({ regions: [{ id: "reg_1", currency_code: "USD" }] }),
      })
      .mockResolvedValueOnce({ // Options (fallback)
        ok: true,
        json: async () => ({ shipping_options: [{ id: "opt_fallback", name: "Fallback", amount: 500 }] }),
      });

    const response2: any = await action({ request, params: {}, context });

    expect(response2.shippingOptions).toHaveLength(1);
    expect(response2.shippingOptions[0].id).toBe("opt_fallback");
    expect(response2.cartId).toBeUndefined();
  });
});
