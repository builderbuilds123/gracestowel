/**
 * Unit tests for CartContext - Basic Cart Operations
 *
 * Tests:
 * - Cart item management (add, remove, update)
 * - sessionStorage persistence
 * - Cart total calculation
 */

import React from "react";
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { CartProvider, useCart } from "./CartContext";
import { MedusaCartProvider } from "./MedusaCartContext";
import { LocaleProvider } from "./LocaleContext";
import { CustomerProvider } from "./CustomerContext";

// Mock sessionStorage
const mockSessionStorage = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, "sessionStorage", {
  value: mockSessionStorage,
  writable: true,
});

// Mock MedusaCartContext
vi.mock("./MedusaCartContext", () => ({
  MedusaCartProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useMedusaCart: () => ({
    cartId: null,
    cart: null,
    setCartId: vi.fn(),
    isLoading: false,
    refreshCart: vi.fn(),
  }),
}));

// Mock LocaleContext
vi.mock("./LocaleContext", () => ({
  LocaleProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useLocale: () => ({
    regionId: "reg_test",
  }),
}));

// Mock CustomerContext
vi.mock("./CustomerContext", () => ({
  CustomerProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const createWrapper = ({ children }: { children: React.ReactNode }) => (
  <LocaleProvider>
    <CustomerProvider>
      <MedusaCartProvider>
        <CartProvider>{children}</CartProvider>
      </MedusaCartProvider>
    </CustomerProvider>
  </LocaleProvider>
);

const mockCartItem = {
  id: "prod_123",
  variantId: "var_123",
  title: "Test Product",
  price: "$50.00",
  image: "https://example.com/image.jpg",
  quantity: 1,
};

describe("CartContext - Basic Cart Operations", () => {
  beforeEach(() => {
    mockSessionStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    mockSessionStorage.clear();
  });

  describe("addToCart", () => {
    it("should add an item to the cart", () => {
      const { result } = renderHook(() => useCart(), { wrapper: createWrapper });

      act(() => {
        result.current.addToCart(mockCartItem);
      });

      expect(result.current.items).toHaveLength(1);
      expect(result.current.items[0].title).toBe("Test Product");
    });

    it("should increment quantity when adding the same item", () => {
      const { result } = renderHook(() => useCart(), { wrapper: createWrapper });

      act(() => {
        result.current.addToCart(mockCartItem);
      });

      act(() => {
        result.current.addToCart(mockCartItem);
      });

      expect(result.current.items).toHaveLength(1);
      expect(result.current.items[0].quantity).toBe(2);
    });

    it("should add different items separately", () => {
      const { result } = renderHook(() => useCart(), { wrapper: createWrapper });

      act(() => {
        result.current.addToCart(mockCartItem);
      });

      act(() => {
        result.current.addToCart({
          ...mockCartItem,
          id: "prod_456",
          variantId: "var_456",
          title: "Another Product",
        });
      });

      expect(result.current.items).toHaveLength(2);
    });

    it("should open cart drawer when adding item", () => {
      const { result } = renderHook(() => useCart(), { wrapper: createWrapper });

      expect(result.current.isOpen).toBe(false);

      act(() => {
        result.current.addToCart(mockCartItem);
      });

      expect(result.current.isOpen).toBe(true);
    });

    it("should not open cart drawer when adding with silent option", () => {
      const { result } = renderHook(() => useCart(), { wrapper: createWrapper });

      expect(result.current.isOpen).toBe(false);

      act(() => {
        result.current.addToCart(mockCartItem, { silent: true });
      });

      expect(result.current.isOpen).toBe(false);
    });
  });

  describe("removeFromCart", () => {
    it("should remove an item from the cart", () => {
      const { result } = renderHook(() => useCart(), { wrapper: createWrapper });

      act(() => {
        result.current.addToCart(mockCartItem);
      });

      expect(result.current.items).toHaveLength(1);

      act(() => {
        result.current.removeFromCart(mockCartItem.id, undefined, mockCartItem.variantId);
      });

      expect(result.current.items).toHaveLength(0);
    });
  });

  describe("updateQuantity", () => {
    it("should update item quantity", () => {
      const { result } = renderHook(() => useCart(), { wrapper: createWrapper });

      act(() => {
        result.current.addToCart(mockCartItem);
      });

      act(() => {
        result.current.updateQuantity(mockCartItem.id, 5, undefined, mockCartItem.variantId);
      });

      expect(result.current.items[0].quantity).toBe(5);
    });

    it("should remove item when quantity is set to 0", () => {
      const { result } = renderHook(() => useCart(), { wrapper: createWrapper });

      act(() => {
        result.current.addToCart(mockCartItem);
      });

      act(() => {
        result.current.updateQuantity(mockCartItem.id, 0, undefined, mockCartItem.variantId);
      });

      expect(result.current.items).toHaveLength(0);
    });
  });

  describe("clearCart", () => {
    it("should clear all items from the cart", () => {
      const { result } = renderHook(() => useCart(), { wrapper: createWrapper });

      act(() => {
        result.current.addToCart(mockCartItem);
        result.current.addToCart({
          ...mockCartItem,
          id: "prod_456",
          variantId: "var_456",
        });
      });

      expect(result.current.items).toHaveLength(2);

      act(() => {
        result.current.clearCart();
      });

      expect(result.current.items).toHaveLength(0);
    });

    it("should close the cart drawer when clearing", () => {
      const { result } = renderHook(() => useCart(), { wrapper: createWrapper });

      act(() => {
        result.current.addToCart(mockCartItem);
      });

      expect(result.current.isOpen).toBe(true);

      act(() => {
        result.current.clearCart();
      });

      expect(result.current.isOpen).toBe(false);
    });
  });

  describe("toggleCart", () => {
    it("should toggle cart open/closed", () => {
      const { result } = renderHook(() => useCart(), { wrapper: createWrapper });

      expect(result.current.isOpen).toBe(false);

      act(() => {
        result.current.toggleCart();
      });

      expect(result.current.isOpen).toBe(true);

      act(() => {
        result.current.toggleCart();
      });

      expect(result.current.isOpen).toBe(false);
    });
  });

  describe("cartTotal", () => {
    it("should calculate cart total correctly", () => {
      const { result } = renderHook(() => useCart(), { wrapper: createWrapper });

      act(() => {
        result.current.addToCart({
          ...mockCartItem,
          price: "$25.00",
          quantity: 2,
        });
      });

      expect(result.current.cartTotal).toBe(50);
    });
  });
});
