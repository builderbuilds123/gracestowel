import { describe, it, expect, vi, beforeEach } from "vitest";
import { MedusaCartService } from "./medusa-cart";

// Mock the getMedusaClient with Medusa v2 SDK structure
const mockCartCreate = vi.fn();
const mockCartRetrieve = vi.fn();
const mockCartUpdate = vi.fn();
const mockCartCreateLineItem = vi.fn();
const mockCartUpdateLineItem = vi.fn();
const mockCartDeleteLineItem = vi.fn();
const mockFulfillmentListCartOptions = vi.fn();

vi.mock("../lib/medusa", () => ({
  getMedusaClient: () => ({
    store: {
      cart: {
        create: mockCartCreate,
        retrieve: mockCartRetrieve,
        update: mockCartUpdate,
        createLineItem: mockCartCreateLineItem,
        updateLineItem: mockCartUpdateLineItem,
        deleteLineItem: mockCartDeleteLineItem,
      },
      fulfillment: {
        listCartOptions: mockFulfillmentListCartOptions,
      },
    },
  }),
}));

describe("MedusaCartService", () => {
  let service: MedusaCartService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new MedusaCartService();
  });

  describe("getOrCreateCart", () => {
    it("should create a new cart and return its ID", async () => {
      const mockCart = { id: "cart_123" };
      mockCartCreate.mockResolvedValue({ cart: mockCart });

      const result = await service.getOrCreateCart("reg_123", "usd");

      expect(mockCartCreate).toHaveBeenCalledWith({ region_id: "reg_123" });
      expect(result).toBe("cart_123");
    });
  });

  describe("getCart", () => {
    it("should return the cart if it exists", async () => {
      const mockCart = { id: "cart_123" };
      mockCartRetrieve.mockResolvedValue({ cart: mockCart });

      const result = await service.getCart("cart_123");

      expect(mockCartRetrieve).toHaveBeenCalledWith("cart_123", {
        fields: "+promotions,+items.adjustments,+shipping_methods.adjustments",
      });
      expect(result).toEqual(mockCart);
    });

    it("should return null if cart not found (404 via response)", async () => {
      const error: any = new Error("Not found");
      error.response = { status: 404 };
      mockCartRetrieve.mockRejectedValue(error);

      const result = await service.getCart("cart_123");

      expect(result).toBeNull();
    });

    it("should return null if cart not found (404 via status)", async () => {
      const error: any = new Error("Not found");
      error.status = 404;
      mockCartRetrieve.mockRejectedValue(error);

      const result = await service.getCart("cart_123");

      expect(result).toBeNull();
    });

    it("should throw other errors", async () => {
      const error = new Error("Server error");
      mockCartRetrieve.mockRejectedValue(error);

      await expect(service.getCart("cart_123")).rejects.toThrow("Server error");
    });
  });

  describe("syncCartItems", () => {
    it("should add new items to the cart", async () => {
      // Setup initial empty cart
      mockCartRetrieve
        .mockResolvedValueOnce({ cart: { id: "cart_123", items: [] } })
        .mockResolvedValueOnce({ cart: { id: "cart_123", items: [{ id: "li_1", variant_id: "var_1", quantity: 1 }] } });

      mockCartCreateLineItem.mockResolvedValue({ cart: {} });

      const localItems = [
        { id: 1, variantId: "var_1", quantity: 1, title: "Item 1", price: "10", image: "img" }
      ];

      await service.syncCartItems("cart_123", localItems);

      expect(mockCartCreateLineItem).toHaveBeenCalledWith("cart_123", {
        variant_id: "var_1",
        quantity: 1,
        metadata: undefined
      });
    });

    it("should update existing items with different quantity (using variant_id)", async () => {
      mockCartRetrieve
        .mockResolvedValueOnce({
          cart: {
            id: "cart_123",
            items: [{ id: "li_1", variant_id: "var_1", quantity: 1 }]
          }
        })
        .mockResolvedValueOnce({ cart: { id: "cart_123", items: [] } });

      mockCartUpdateLineItem.mockResolvedValue({ cart: {} });

      const localItems = [
        { id: 1, variantId: "var_1", quantity: 2, title: "Item 1", price: "10", image: "img" }
      ];

      await service.syncCartItems("cart_123", localItems);

      expect(mockCartUpdateLineItem).toHaveBeenCalledWith("cart_123", "li_1", {
        quantity: 2,
      });
    });

    it("should update existing items with different quantity (using variant.id fallback)", async () => {
      mockCartRetrieve
        .mockResolvedValueOnce({
          cart: {
            id: "cart_123",
            items: [{ id: "li_1", variant: { id: "var_1" }, quantity: 1 }]
          }
        })
        .mockResolvedValueOnce({ cart: { id: "cart_123", items: [] } });

      mockCartUpdateLineItem.mockResolvedValue({ cart: {} });

      const localItems = [
        { id: 1, variantId: "var_1", quantity: 2, title: "Item 1", price: "10", image: "img" }
      ];

      await service.syncCartItems("cart_123", localItems);

      expect(mockCartUpdateLineItem).toHaveBeenCalledWith("cart_123", "li_1", {
        quantity: 2,
      });
    });

    it("should remove items not in local cart", async () => {
      mockCartRetrieve
        .mockResolvedValueOnce({
          cart: {
            id: "cart_123",
            items: [{ id: "li_1", variant_id: "var_1", quantity: 1 }]
          }
        })
        .mockResolvedValueOnce({ cart: { id: "cart_123", items: [] } });

      mockCartDeleteLineItem.mockResolvedValue({ cart: {} });

      const localItems: any[] = [];

      await service.syncCartItems("cart_123", localItems);

      expect(mockCartDeleteLineItem).toHaveBeenCalledWith("cart_123", "li_1");
    });
  });

  describe("updateShippingAddress", () => {
    it("should update shipping address", async () => {
      const address = {
        first_name: "John",
        last_name: "Doe",
        address_1: "123 St",
        city: "City",
        country_code: "us",
        postal_code: "12345"
      };

      mockCartUpdate.mockResolvedValue({ cart: { id: "cart_123", shipping_address: address } });

      await service.updateShippingAddress("cart_123", address);

      expect(mockCartUpdate).toHaveBeenCalledWith("cart_123", { shipping_address: address });
    });
  });

  describe("getShippingOptions", () => {
    it("should return shipping options", async () => {
      const mockOptions = [
        { id: "opt_1", name: "Standard", amount: 1000, price_type: "flat_rate", provider_id: "manual", is_return: false }
      ];
      mockFulfillmentListCartOptions.mockResolvedValue({ shipping_options: mockOptions });

      const result = await service.getShippingOptions("cart_123");

      expect(mockFulfillmentListCartOptions).toHaveBeenCalledWith({ cart_id: "cart_123" });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("opt_1");
    });

    it("should handle empty shipping options", async () => {
      mockFulfillmentListCartOptions.mockResolvedValue({ shipping_options: [] });

      const result = await service.getShippingOptions("cart_123");

      expect(result).toHaveLength(0);
    });

    it("should handle undefined shipping options", async () => {
      mockFulfillmentListCartOptions.mockResolvedValue({});

      const result = await service.getShippingOptions("cart_123");

      expect(result).toHaveLength(0);
    });
  });
});
