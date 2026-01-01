/**
 * SEC-05: Storage Migration Utility Tests
 * Tests the actual migrateStorageItem utility function
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { migrateStorageItem } from "../app/lib/storage-migration";
import { createLogger } from "../app/lib/logger";

describe("SEC-05: Storage Migration Utility", () => {
  let logger: ReturnType<typeof createLogger>;

  beforeEach(() => {
    // Clear storage before each test
    sessionStorage.clear();
    localStorage.clear();
    logger = createLogger();
  });

  describe("migrateStorageItem", () => {
    it("should return sessionStorage value if already exists", () => {
      const testValue = "test_value";
      sessionStorage.setItem("testKey", testValue);

      const result = migrateStorageItem("testKey", logger);

      expect(result).toBe(testValue);
      expect(sessionStorage.getItem("testKey")).toBe(testValue);
    });

    it("should migrate from localStorage to sessionStorage", () => {
      const testValue = "test_value";
      localStorage.setItem("testKey", testValue);

      const result = migrateStorageItem("testKey", logger);

      expect(result).toBe(testValue);
      expect(sessionStorage.getItem("testKey")).toBe(testValue);
      expect(localStorage.getItem("testKey")).toBeNull();
    });

    it("should clean up localStorage when value already in sessionStorage", () => {
      const testValue = "test_value";
      sessionStorage.setItem("testKey", testValue);
      localStorage.setItem("testKey", "legacy_value");

      const result = migrateStorageItem("testKey", logger);

      expect(result).toBe(testValue);
      expect(sessionStorage.getItem("testKey")).toBe(testValue);
      expect(localStorage.getItem("testKey")).toBeNull();
    });

    it("should handle sessionStorage.setItem failure gracefully", () => {
      const testValue = "test_value";
      localStorage.setItem("testKey", testValue);

      // Mock sessionStorage.setItem to throw
      const originalSetItem = sessionStorage.setItem;
      vi.spyOn(sessionStorage, "setItem").mockImplementation(() => {
        const error = new Error("QuotaExceededError");
        error.name = "QuotaExceededError";
        throw error;
      });

      const result = migrateStorageItem("testKey", logger);

      // Should fall back to localStorage value
      expect(result).toBe(testValue);
      expect(localStorage.getItem("testKey")).toBe(testValue);

      // Restore original implementation
      sessionStorage.setItem = originalSetItem;
    });

    it("should handle sessionStorage.getItem failure gracefully", () => {
      const testValue = "test_value";
      localStorage.setItem("testKey", testValue);

      // Mock sessionStorage.getItem to throw
      const originalGetItem = sessionStorage.getItem;
      vi.spyOn(sessionStorage, "getItem").mockImplementation(() => {
        throw new Error("SecurityError");
      });

      const result = migrateStorageItem("testKey", logger);

      // Should still migrate from localStorage
      expect(result).toBe(testValue);

      // Restore original implementation
      sessionStorage.getItem = originalGetItem;
    });

    it("should return null if no value exists in either storage", () => {
      const result = migrateStorageItem("nonexistentKey", logger);

      expect(result).toBeNull();
    });
  });
});

