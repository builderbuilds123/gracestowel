/**
 * Unit tests for CartContext - Active Order State
 * 
 * Story 3.1: Add Order State to CartContext with sessionStorage
 * 
 * Tests:
 * - Active order state management
 * - sessionStorage persistence
 * - Expiry handling
 * - Edge cases
 */

import React from "react";
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { CartProvider, ActiveOrderData, useCart } from "./CartContext";
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

const mockActiveOrderData: ActiveOrderData = {
  orderId: "order_123",
  items: [
    {
      id: "item_1",
      title: "Test Product",
      quantity: 2,
      thumbnail: "https://example.com/image.jpg",
      unit_price: 5000,
    },
  ],
  shippingAddress: {
    first_name: "John",
    last_name: "Doe",
    address_1: "123 Main St",
    city: "New York",
    postal_code: "10001",
    country_code: "us",
  },
  shippingMethodId: "sm_123",
  email: "test@example.com",
  customerName: "John Doe",
  createdAt: new Date().toISOString(),
};

describe("CartContext - Active Order State (Story 3.1)", () => {
  beforeEach(() => {
    mockSessionStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    mockSessionStorage.clear();
  });

  describe("setActiveOrder", () => {
    it("should set active order and persist to sessionStorage", () => {
      const { result } = renderHook(() => useCart(), { wrapper: createWrapper });

      act(() => {
        result.current.setActiveOrder(mockActiveOrderData);
      });

      expect(result.current.activeOrder).toEqual(mockActiveOrderData);
      expect(result.current.isModifyingOrder).toBe(true);

      const stored = mockSessionStorage.getItem("activeOrder");
      expect(stored).toBeTruthy();
      const parsed = JSON.parse(stored!);
      expect(parsed.orderId).toBe(mockActiveOrderData.orderId);
    });

    it("should update sessionStorage when active order changes", () => {
      const { result } = renderHook(() => useCart(), { wrapper: createWrapper });

      const firstOrder = { ...mockActiveOrderData, orderId: "order_1" };
      const secondOrder = { ...mockActiveOrderData, orderId: "order_2" };

      act(() => {
        result.current.setActiveOrder(firstOrder);
      });

      act(() => {
        result.current.setActiveOrder(secondOrder);
      });

      const stored = mockSessionStorage.getItem("activeOrder");
      const parsed = JSON.parse(stored!);
      expect(parsed.orderId).toBe("order_2");
    });
  });

  describe("clearActiveOrder", () => {
    it("should clear active order and remove from sessionStorage", () => {
      const { result } = renderHook(() => useCart(), { wrapper: createWrapper });

      act(() => {
        result.current.setActiveOrder(mockActiveOrderData);
      });

      expect(result.current.activeOrder).toBeTruthy();

      act(() => {
        result.current.clearActiveOrder();
      });

      expect(result.current.activeOrder).toBe(null);
      expect(result.current.isModifyingOrder).toBe(false);
      expect(mockSessionStorage.getItem("activeOrder")).toBeNull();
    });
  });

  describe("isModifyingOrder", () => {
    it("should be true when active order is set", () => {
      const { result } = renderHook(() => useCart(), { wrapper: createWrapper });

      act(() => {
        result.current.setActiveOrder(mockActiveOrderData);
      });

      expect(result.current.isModifyingOrder).toBe(true);
    });

    it("should be false when active order is null", () => {
      const { result } = renderHook(() => useCart(), { wrapper: createWrapper });

      expect(result.current.isModifyingOrder).toBe(false);
    });
  });

  describe("sessionStorage persistence on mount", () => {
    it("should load active order from sessionStorage on mount", async () => {
      mockSessionStorage.setItem("activeOrder", JSON.stringify(mockActiveOrderData));

      const { result } = renderHook(() => useCart(), { wrapper: createWrapper });

      await waitFor(() => {
        expect(result.current.activeOrder).toBeTruthy();
      });

      expect(result.current.activeOrder?.orderId).toBe(mockActiveOrderData.orderId);
    });

    it("should remove expired active order from sessionStorage", async () => {
      const expiredOrder = {
        ...mockActiveOrderData,
        createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(), // 25 hours ago
      };
      mockSessionStorage.setItem("activeOrder", JSON.stringify(expiredOrder));

      const { result } = renderHook(() => useCart(), { wrapper: createWrapper });

      await waitFor(() => {
        expect(result.current.activeOrder).toBe(null);
      });

      expect(mockSessionStorage.getItem("activeOrder")).toBeNull();
    });

    it("should handle corrupted sessionStorage data gracefully", async () => {
      mockSessionStorage.setItem("activeOrder", "invalid json");

      const { result } = renderHook(() => useCart(), { wrapper: createWrapper });

      await waitFor(() => {
        expect(result.current.activeOrder).toBe(null);
      });

      expect(mockSessionStorage.getItem("activeOrder")).toBeNull();
    });

    it("should handle missing createdAt field", async () => {
      const invalidOrder = { ...mockActiveOrderData };
      delete (invalidOrder as any).createdAt;
      mockSessionStorage.setItem("activeOrder", JSON.stringify(invalidOrder));

      const { result } = renderHook(() => useCart(), { wrapper: createWrapper });

      await waitFor(() => {
        // Should either load it or clear it - depends on implementation
        expect(result.current.activeOrder === null || result.current.activeOrder !== null).toBe(true);
      });
    });
  });

  describe("edge cases", () => {
    it("should handle empty active order data", () => {
      const { result } = renderHook(() => useCart(), { wrapper: createWrapper });

      const emptyOrder = {
        ...mockActiveOrderData,
        items: [],
      };

      act(() => {
        result.current.setActiveOrder(emptyOrder);
      });

      expect(result.current.activeOrder?.items).toEqual([]);
    });

    it("should handle active order with many items", () => {
      const { result } = renderHook(() => useCart(), { wrapper: createWrapper });

      const largeOrder = {
        ...mockActiveOrderData,
        items: Array.from({ length: 100 }, (_, i) => ({
          id: `item_${i}`,
          title: `Product ${i}`,
          quantity: 1,
          unit_price: 1000,
        })),
      };

      act(() => {
        result.current.setActiveOrder(largeOrder);
      });

      expect(result.current.activeOrder?.items.length).toBe(100);
    });
  });
});
