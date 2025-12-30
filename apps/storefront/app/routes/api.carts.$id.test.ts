import { describe, it, expect, vi, beforeEach } from "vitest";
import { action, loader } from "./api.carts.$id";

// Mock functions
const mockGetCart = vi.fn();
const mockSyncCartItems = vi.fn();
const mockUpdateShippingAddress = vi.fn();

// Mock MedusaCartService
vi.mock("../services/medusa-cart", () => ({
  MedusaCartService: class {
    constructor() {}
    getCart = mockGetCart;
    syncCartItems = mockSyncCartItems;
    updateShippingAddress = mockUpdateShippingAddress;
  },
}));

describe("API Carts - PATCH /api/carts/:id", () => {
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

  it("should update cart items", async () => {
    const request = new Request("http://localhost/api/carts/cart_123", {
      method: "PATCH",
      body: JSON.stringify({
        items: [
          { variantId: "variant_01ABC123DEF456", quantity: 2, title: "Test Towel" },
        ],
      }),
    });

    mockGetCart.mockResolvedValue({ id: "cart_123", items: [] });
    mockSyncCartItems.mockResolvedValue({ id: "cart_123", items: [] });

    const response = await action({ request, params: { id: "cart_123" }, context });
    const data = (response as any).data;
    
    expect(data.success).toBe(true);
    expect(data.items_synced).toBe(1);
    expect(mockSyncCartItems).toHaveBeenCalled();
  });

  it("should update shipping address", async () => {
    const request = new Request("http://localhost/api/carts/cart_123", {
      method: "PATCH",
      body: JSON.stringify({
        shipping_address: {
          first_name: "John",
          last_name: "Doe",
          address_1: "123 Test St",
          city: "San Francisco",
          country_code: "US",
          postal_code: "94102",
        },
      }),
    });

    mockGetCart.mockResolvedValue({ id: "cart_123", items: [] });
    mockUpdateShippingAddress.mockResolvedValue({ id: "cart_123" });

    const response = await action({ request, params: { id: "cart_123" }, context });
    const data = (response as any).data;
    
    expect(data.success).toBe(true);
    expect(data.address_updated).toBe(true);
    expect(mockUpdateShippingAddress).toHaveBeenCalled();
  });

  it("should update both items and address", async () => {
    const request = new Request("http://localhost/api/carts/cart_123", {
      method: "PATCH",
      body: JSON.stringify({
        items: [{ variantId: "variant_01ABC123DEF456", quantity: 1, title: "Towel" }],
        shipping_address: {
          first_name: "Jane",
          last_name: "Doe",
          address_1: "456 Main St",
          city: "Los Angeles",
          country_code: "US",
          postal_code: "90001",
        },
      }),
    });

    mockGetCart.mockResolvedValue({ id: "cart_123", items: [] });
    mockSyncCartItems.mockResolvedValue({});
    mockUpdateShippingAddress.mockResolvedValue({});

    const response = await action({ request, params: { id: "cart_123" }, context });
    const data = (response as any).data;
    
    expect(data.success).toBe(true);
    expect(data.items_synced).toBe(1);
    expect(data.address_updated).toBe(true);
  });

  it("should return 404 when cart not found", async () => {
    const request = new Request("http://localhost/api/carts/cart_999", {
      method: "PATCH",
      body: JSON.stringify({
        items: [{ variantId: "variant_01ABC123", quantity: 1, title: "Test" }],
      }),
    });

    mockGetCart.mockResolvedValue(null);

    const response = await action({ request, params: { id: "cart_999" }, context });
    const data = (response as any).data;
    expect(data.error).toBe("Cart not found");
  });

  it("should return 400 when cart ID is missing", async () => {
    const request = new Request("http://localhost/api/carts/", {
      method: "PATCH",
      body: JSON.stringify({ items: [] }),
    });

    const response = await action({ request, params: {}, context });
    const data = (response as any).data;
    expect(data.error).toBe("Cart ID is required");
  });

  it("should return 400 when neither items nor address provided", async () => {
    const request = new Request("http://localhost/api/carts/cart_123", {
      method: "PATCH",
      body: JSON.stringify({}),
    });

    const response = await action({ request, params: { id: "cart_123" }, context });
    const data = (response as any).data;
    expect(data.error).toBe("At least one of 'items' or 'shipping_address' is required");
  });

  it("should return 405 for non-PATCH requests", async () => {
    const request = new Request("http://localhost/api/carts/cart_123", {
      method: "PUT",
    });

    const response = await action({ request, params: { id: "cart_123" }, context });
    const data = (response as any).data;
    expect(data.error).toBe("Method not allowed");
  });

  it("should filter out items with invalid variant IDs", async () => {
    const request = new Request("http://localhost/api/carts/cart_123", {
      method: "PATCH",
      body: JSON.stringify({
        items: [
          { variantId: "variant_01ABC123DEF456", quantity: 1, title: "Valid" },
          { variantId: "invalid-id", quantity: 1, title: "Invalid" },
          { variantId: null, quantity: 1, title: "Null ID" },
        ],
      }),
    });

    mockGetCart.mockResolvedValue({ id: "cart_123", items: [] });
    mockSyncCartItems.mockResolvedValue({});

    const response = await action({ request, params: { id: "cart_123" }, context });
    const data = (response as any).data;
    
    expect(data.items_synced).toBe(1); // Only the valid one
  });
});

describe("API Carts - GET /api/carts/:id", () => {
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

  it("should return cart details", async () => {
    mockGetCart.mockResolvedValue({
      id: "cart_123",
      region_id: "reg_us",
      items: [{ id: "item_1", title: "Towel", quantity: 1 }],
      shipping_address: { city: "NYC" },
    });

    const response = await loader({ request: new Request("http://localhost"), params: { id: "cart_123" }, context });
    const data = (response as any).data;
    
    expect(data.id).toBe("cart_123");
    expect(data.region_id).toBe("reg_us");
    expect(data.items).toHaveLength(1);
  });

  it("should return 404 when cart not found", async () => {
    mockGetCart.mockResolvedValue(null);

    const response = await loader({ request: new Request("http://localhost"), params: { id: "cart_999" }, context });
    const data = (response as any).data;
    expect(data.error).toBe("Cart not found");
  });

  it("should return 400 when cart ID is missing", async () => {
    const response = await loader({ request: new Request("http://localhost"), params: {}, context });
    const data = (response as any).data;
    expect(data.error).toBe("Cart ID is required");
  });
});
