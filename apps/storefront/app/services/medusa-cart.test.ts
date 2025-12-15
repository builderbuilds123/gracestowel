import { describe, it, expect, vi, beforeEach } from "vitest";
import { MedusaCartService } from "./medusa-cart";

// Mock the getMedusaClient
const mockCartsCreate = vi.fn();
const mockCartsRetrieve = vi.fn();
const mockCartsUpdate = vi.fn();
const mockLineItemsCreate = vi.fn();
const mockLineItemsUpdate = vi.fn();
const mockLineItemsDelete = vi.fn();
const mockShippingOptionsList = vi.fn();

vi.mock("../lib/medusa", () => ({
  getMedusaClient: () => ({
    carts: {
      create: mockCartsCreate,
      retrieve: mockCartsRetrieve,
      update: mockCartsUpdate,
      lineItems: {
        create: mockLineItemsCreate,
        update: mockLineItemsUpdate,
        delete: mockLineItemsDelete,
      },
    },
    shippingOptions: {
      list: mockShippingOptionsList,
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
      mockCartsCreate.mockResolvedValue({ cart: mockCart });

      const result = await service.getOrCreateCart("reg_123", "usd");

      expect(mockCartsCreate).toHaveBeenCalledWith({ region_id: "reg_123" });
      expect(result).toBe("cart_123");
    });
  });

  describe("getCart", () => {
    it("should return the cart if it exists", async () => {
      const mockCart = { id: "cart_123" };
      mockCartsRetrieve.mockResolvedValue({ cart: mockCart });

      const result = await service.getCart("cart_123");

      expect(mockCartsRetrieve).toHaveBeenCalledWith("cart_123");
      expect(result).toEqual(mockCart);
    });

    it("should return null if cart not found (404)", async () => {
      const error: any = new Error("Not found");
      error.response = { status: 404 };
      mockCartsRetrieve.mockRejectedValue(error);

      const result = await service.getCart("cart_123");

      expect(result).toBeNull();
    });

    it("should throw other errors", async () => {
      const error = new Error("Server error");
      mockCartsRetrieve.mockRejectedValue(error);

      await expect(service.getCart("cart_123")).rejects.toThrow("Server error");
    });
  });

  describe("syncCartItems", () => {
    it("should add new items to the cart", async () => {
      // Setup initial empty cart
      mockCartsRetrieve
        .mockResolvedValueOnce({ cart: { id: "cart_123", items: [] } }) // First call
        .mockResolvedValueOnce({ cart: { id: "cart_123", items: [{ id: "li_1", variant: { id: "var_1" }, quantity: 1 }] } }); // Second call (after sync)

      mockLineItemsCreate.mockResolvedValue({ cart: {} });

      const localItems = [
        { id: 1, variantId: "var_1", quantity: 1, title: "Item 1", price: "10", image: "img" }
      ];

      await service.syncCartItems("cart_123", localItems);

      expect(mockLineItemsCreate).toHaveBeenCalledWith("cart_123", {
        variant_id: "var_1",
        quantity: 1,
        metadata: undefined
      });
    });

    it("should update existing items with different quantity", async () => {
      mockCartsRetrieve
        .mockResolvedValueOnce({
          cart: {
            id: "cart_123",
            items: [{ id: "li_1", variant: { id: "var_1" }, quantity: 1 }]
          }
        })
        .mockResolvedValueOnce({ cart: { id: "cart_123", items: [] } }); // Return doesn't matter much here

      mockLineItemsUpdate.mockResolvedValue({ cart: {} });

      const localItems = [
        { id: 1, variantId: "var_1", quantity: 2, title: "Item 1", price: "10", image: "img" }
      ];

      await service.syncCartItems("cart_123", localItems);

      expect(mockLineItemsUpdate).toHaveBeenCalledWith("cart_123", "li_1", {
        quantity: 2,
      });
    });

    it("should remove items not in local cart", async () => {
      mockCartsRetrieve
        .mockResolvedValueOnce({
          cart: {
            id: "cart_123",
            items: [{ id: "li_1", variant: { id: "var_1" }, quantity: 1 }]
          }
        })
        .mockResolvedValueOnce({ cart: { id: "cart_123", items: [] } });

      mockLineItemsDelete.mockResolvedValue({ cart: {} });

      const localItems: any[] = [];

      await service.syncCartItems("cart_123", localItems);

      expect(mockLineItemsDelete).toHaveBeenCalledWith("cart_123", "li_1");
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

      mockCartsUpdate.mockResolvedValue({ cart: { id: "cart_123", shipping_address: address } });

      await service.updateShippingAddress("cart_123", address);

      expect(mockCartsUpdate).toHaveBeenCalledWith("cart_123", { shipping_address: address });
    });
  });

  describe("getShippingOptions", () => {
    it("should return shipping options", async () => {
      const mockOptions = [
        { id: "opt_1", name: "Standard", amount: 1000, price_type: "flat_rate", provider_id: "manual", is_return: false }
      ];
      mockShippingOptionsList.mockResolvedValue({ shipping_options: mockOptions });

      const result = await service.getShippingOptions("cart_123");

      expect(mockShippingOptionsList).toHaveBeenCalledWith({ cart_id: "cart_123" });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("opt_1");
    });
  });
});
