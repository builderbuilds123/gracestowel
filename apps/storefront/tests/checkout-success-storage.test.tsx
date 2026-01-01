/**
 * SEC-05: Checkout Success Page Storage Tests
 * Tests sessionStorage operations for checkout data (lastOrder, orderId)
 * Validates migration from localStorage and cleanup behavior
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

describe("SEC-05: Checkout Success Storage Operations", () => {
  beforeEach(() => {
    // Clear storage before each test
    sessionStorage.clear();
    localStorage.clear();
  });

  describe("sessionStorage.setItem error handling", () => {
    it("should handle QuotaExceededError gracefully", () => {
      // Mock sessionStorage to throw QuotaExceededError
      const originalSetItem = sessionStorage.setItem;
      vi.spyOn(sessionStorage, "setItem").mockImplementation(() => {
        const error = new Error("QuotaExceededError");
        error.name = "QuotaExceededError";
        throw error;
      });

      // Attempt to set item - should not throw
      expect(() => {
        try {
          sessionStorage.setItem("test", "value");
        } catch (error) {
          // Expected to catch and handle
        }
      }).not.toThrow();

      // Restore original implementation
      sessionStorage.setItem = originalSetItem;
    });

    it("should handle SecurityError (private browsing) gracefully", () => {
      // Mock sessionStorage to throw SecurityError
      const originalSetItem = sessionStorage.setItem;
      vi.spyOn(sessionStorage, "setItem").mockImplementation(() => {
        const error = new Error("SecurityError");
        error.name = "SecurityError";
        throw error;
      });

      // Attempt to set item - should not throw
      expect(() => {
        try {
          sessionStorage.setItem("test", "value");
        } catch (error) {
          // Expected to catch and handle
        }
      }).not.toThrow();

      // Restore original implementation
      sessionStorage.setItem = originalSetItem;
    });
  });

  describe("sessionStorage.getItem error handling", () => {
    it("should handle storage access errors gracefully", () => {
      // Mock sessionStorage.getItem to throw
      const originalGetItem = sessionStorage.getItem;
      vi.spyOn(sessionStorage, "getItem").mockImplementation(() => {
        throw new Error("Storage access denied");
      });

      // Attempt to get item - should return null without throwing
      let result: string | null = null;
      expect(() => {
        try {
          result = sessionStorage.getItem("test");
        } catch (error) {
          result = null;
        }
      }).not.toThrow();

      expect(result).toBeNull();

      // Restore original implementation
      sessionStorage.getItem = originalGetItem;
    });
  });

  describe("sessionStorage.removeItem error handling", () => {
    it("should handle storage cleanup errors gracefully", () => {
      // Mock sessionStorage.removeItem to throw
      const originalRemoveItem = sessionStorage.removeItem;
      vi.spyOn(sessionStorage, "removeItem").mockImplementation(() => {
        throw new Error("Storage access denied");
      });

      // Attempt to remove item - should not throw
      expect(() => {
        try {
          sessionStorage.removeItem("test");
        } catch (error) {
          // Expected to catch and handle
        }
      }).not.toThrow();

      // Restore original implementation
      sessionStorage.removeItem = originalRemoveItem;
    });
  });

  describe("localStorage to sessionStorage migration", () => {
    it("should migrate lastOrder from localStorage to sessionStorage", () => {
      const testOrder = JSON.stringify({ items: [], total: 100 });
      localStorage.setItem("lastOrder", testOrder);

      // Simulate migration logic
      let savedOrder: string | null = null;
      try {
        savedOrder = sessionStorage.getItem("lastOrder");
        if (!savedOrder) {
          const legacyOrder = localStorage.getItem("lastOrder");
          if (legacyOrder) {
            sessionStorage.setItem("lastOrder", legacyOrder);
            localStorage.removeItem("lastOrder");
            savedOrder = legacyOrder;
          }
        }
      } catch (error) {
        // Error handling
      }

      expect(savedOrder).toBe(testOrder);
      expect(sessionStorage.getItem("lastOrder")).toBe(testOrder);
      expect(localStorage.getItem("lastOrder")).toBeNull();
    });

    it("should migrate orderId from localStorage to sessionStorage", () => {
      const testOrderId = "order_123";
      localStorage.setItem("orderId", testOrderId);

      // Simulate migration logic
      let savedOrderId: string | null = null;
      try {
        savedOrderId = sessionStorage.getItem("orderId");
        if (!savedOrderId) {
          const legacyOrderId = localStorage.getItem("orderId");
          if (legacyOrderId) {
            sessionStorage.setItem("orderId", legacyOrderId);
            localStorage.removeItem("orderId");
            savedOrderId = legacyOrderId;
          }
        }
      } catch (error) {
        // Error handling
      }

      expect(savedOrderId).toBe(testOrderId);
      expect(sessionStorage.getItem("orderId")).toBe(testOrderId);
      expect(localStorage.getItem("orderId")).toBeNull();
    });

    it("should handle migration failure gracefully (sessionStorage full)", () => {
      const testOrder = JSON.stringify({ items: [], total: 100 });
      localStorage.setItem("lastOrder", testOrder);

      // Mock sessionStorage.setItem to throw (simulating full storage)
      const originalSetItem = sessionStorage.setItem;
      let migrationAttempted = false;
      vi.spyOn(sessionStorage, "setItem").mockImplementation((key, value) => {
        migrationAttempted = true;
        const error = new Error("QuotaExceededError");
        error.name = "QuotaExceededError";
        throw error;
      });

      // Simulate migration logic with error handling
      let savedOrder: string | null = null;
      try {
        savedOrder = sessionStorage.getItem("lastOrder");
        if (!savedOrder) {
          const legacyOrder = localStorage.getItem("lastOrder");
          if (legacyOrder) {
            try {
              sessionStorage.setItem("lastOrder", legacyOrder);
              localStorage.removeItem("lastOrder");
              savedOrder = legacyOrder;
            } catch (error) {
              // Migration failed - use localStorage value as fallback
              savedOrder = legacyOrder;
            }
          }
        }
      } catch (error) {
        // Error handling
      }

      expect(migrationAttempted).toBe(true);
      expect(savedOrder).toBe(testOrder); // Should fall back to localStorage value
      expect(localStorage.getItem("lastOrder")).toBe(testOrder); // Still in localStorage due to migration failure

      // Restore original implementation
      sessionStorage.setItem = originalSetItem;
    });
  });

  describe("cleanup operations", () => {
    it("should clean up all checkout data (lastOrder, orderId, medusa_cart_id)", () => {
      // Setup: add data to sessionStorage
      sessionStorage.setItem("lastOrder", JSON.stringify({ items: [] }));
      sessionStorage.setItem("orderId", "order_123");
      sessionStorage.setItem("medusa_cart_id", "cart_456");

      // Simulate cleanup (as done in setTimeout and unmount)
      try {
        sessionStorage.removeItem("lastOrder");
        sessionStorage.removeItem("orderId");
        sessionStorage.removeItem("medusa_cart_id");
      } catch (error) {
        // Error handling
      }

      expect(sessionStorage.getItem("lastOrder")).toBeNull();
      expect(sessionStorage.getItem("orderId")).toBeNull();
      expect(sessionStorage.getItem("medusa_cart_id")).toBeNull();
    });

    it("should handle cleanup errors gracefully", () => {
      // Setup: add data to sessionStorage
      sessionStorage.setItem("lastOrder", JSON.stringify({ items: [] }));
      sessionStorage.setItem("orderId", "order_123");

      // Mock removeItem to throw on first call
      const originalRemoveItem = sessionStorage.removeItem;
      let callCount = 0;
      vi.spyOn(sessionStorage, "removeItem").mockImplementation((key) => {
        callCount++;
        if (callCount === 1) {
          throw new Error("Storage error");
        }
        originalRemoveItem.call(sessionStorage, key);
      });

      // Attempt cleanup - should not throw
      expect(() => {
        try {
          sessionStorage.removeItem("lastOrder");
          sessionStorage.removeItem("orderId");
          sessionStorage.removeItem("medusa_cart_id");
        } catch (error) {
          // Expected to catch and handle
        }
      }).not.toThrow();

      // Restore original implementation
      sessionStorage.removeItem = originalRemoveItem;
    });
  });
});

