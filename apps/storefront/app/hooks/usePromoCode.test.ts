import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { usePromoCode } from "./usePromoCode";

// Create mock functions that persist across getMedusaClient calls
const mockCartUpdate = vi.fn();

// Mock the Medusa client - returns same mock functions each time
vi.mock("../lib/medusa", () => ({
  getMedusaClient: () => ({
    store: {
      cart: {
        update: mockCartUpdate,
      },
    },
  }),
}));

describe("usePromoCode", () => {
  const mockCartId = "cart_123";

  beforeEach(() => {
    vi.clearAllMocks();
    mockCartUpdate.mockReset();
  });

  describe("applyPromoCode", () => {
    it("should apply a valid promo code successfully", async () => {
      mockCartUpdate.mockResolvedValue({
        cart: {
          id: mockCartId,
          discount_total: 10,
        },
      });

      const { result } = renderHook(() =>
        usePromoCode({ cartId: mockCartId })
      );

      await act(async () => {
        const success = await result.current.applyPromoCode("TEST10");
        expect(success).toBe(true);
      });

      expect(result.current.appliedCodes).toHaveLength(1);
      expect(result.current.appliedCodes[0].code).toBe("TEST10");
      expect(result.current.successMessage).toBe("Promo code applied!");
      expect(result.current.error).toBeNull();
    });

    it("should normalize code to uppercase", async () => {
      mockCartUpdate.mockResolvedValue({
        cart: { id: mockCartId, discount_total: 5 },
      });

      const { result } = renderHook(() =>
        usePromoCode({ cartId: mockCartId })
      );

      await act(async () => {
        await result.current.applyPromoCode("test10");
      });

      expect(mockCartUpdate).toHaveBeenCalledWith(mockCartId, {
        promo_codes: ["TEST10"],
      });
    });

    it("should return error for empty code", async () => {
      const { result } = renderHook(() =>
        usePromoCode({ cartId: mockCartId })
      );

      await act(async () => {
        const success = await result.current.applyPromoCode("   ");
        expect(success).toBe(false);
      });

      expect(result.current.error).toBe("Please enter a promo code");
    });

    it("should return error when cart is not available", async () => {
      const { result } = renderHook(() =>
        usePromoCode({ cartId: undefined })
      );

      await act(async () => {
        const success = await result.current.applyPromoCode("TEST10");
        expect(success).toBe(false);
      });

      expect(result.current.error).toBe("Cart not available");
    });

    it("should prevent duplicate promo codes", async () => {
      mockCartUpdate.mockResolvedValue({
        cart: { id: mockCartId, discount_total: 10 },
      });

      const { result } = renderHook(() =>
        usePromoCode({ cartId: mockCartId })
      );

      // Apply first time
      await act(async () => {
        await result.current.applyPromoCode("TEST10");
      });

      // Try to apply same code again
      await act(async () => {
        const success = await result.current.applyPromoCode("TEST10");
        expect(success).toBe(false);
      });

      expect(result.current.error).toBe("This promo code is already applied");
    });

    it("should handle API errors gracefully", async () => {
      mockCartUpdate.mockRejectedValue(
        new Error("Promotion not found")
      );

      const { result } = renderHook(() =>
        usePromoCode({ cartId: mockCartId })
      );

      await act(async () => {
        const success = await result.current.applyPromoCode("INVALID");
        expect(success).toBe(false);
      });

      expect(result.current.error).toBe("Invalid or expired promo code");
    });

    it("should call onCartUpdate callback on success", async () => {
      mockCartUpdate.mockResolvedValue({
        cart: { id: mockCartId, discount_total: 10 },
      });

      const onCartUpdate = vi.fn();
      const { result } = renderHook(() =>
        usePromoCode({ cartId: mockCartId, onCartUpdate })
      );

      await act(async () => {
        await result.current.applyPromoCode("TEST10");
      });

      expect(onCartUpdate).toHaveBeenCalledTimes(1);
    });
  });

  describe("removePromoCode", () => {
    it("should remove an applied promo code", async () => {
      mockCartUpdate.mockResolvedValue({
        cart: { id: mockCartId, discount_total: 0 },
      });

      const { result } = renderHook(() =>
        usePromoCode({ cartId: mockCartId })
      );

      // First apply a code
      await act(async () => {
        await result.current.applyPromoCode("TEST10");
      });

      expect(result.current.appliedCodes).toHaveLength(1);

      // Then remove it
      await act(async () => {
        const success = await result.current.removePromoCode("TEST10");
        expect(success).toBe(true);
      });

      expect(result.current.appliedCodes).toHaveLength(0);
      expect(result.current.successMessage).toBe("Promo code removed");
    });

    it("should return error when cart is not available", async () => {
      const { result } = renderHook(() =>
        usePromoCode({ cartId: undefined })
      );

      await act(async () => {
        const success = await result.current.removePromoCode("TEST10");
        expect(success).toBe(false);
      });

      expect(result.current.error).toBe("Cart not available");
    });
  });

  describe("clearMessages", () => {
    it("should clear error and success messages", async () => {
      mockCartUpdate.mockResolvedValue({
        cart: { id: mockCartId, discount_total: 10 },
      });

      const { result } = renderHook(() =>
        usePromoCode({ cartId: mockCartId })
      );

      await act(async () => {
        await result.current.applyPromoCode("TEST10");
      });

      expect(result.current.successMessage).toBe("Promo code applied!");

      act(() => {
        result.current.clearMessages();
      });

      expect(result.current.successMessage).toBeNull();
      expect(result.current.error).toBeNull();
    });
  });

  describe("loading state", () => {
    it("should set isLoading during API calls", async () => {
      let resolvePromise: (value: unknown) => void;
      const promise = new Promise((resolve) => {
        resolvePromise = resolve;
      });

      mockCartUpdate.mockReturnValue(promise);

      const { result } = renderHook(() =>
        usePromoCode({ cartId: mockCartId })
      );

      expect(result.current.isLoading).toBe(false);

      act(() => {
        result.current.applyPromoCode("TEST10");
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(true);
      });

      await act(async () => {
        resolvePromise!({ cart: { id: mockCartId, discount_total: 10 } });
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });
  });

  describe("stacking and campaign errors", () => {
    it("should handle stacking error gracefully", async () => {
      mockCartUpdate.mockRejectedValue(
        new Error("Promotions cannot be combined")
      );

      const { result } = renderHook(() =>
        usePromoCode({ cartId: mockCartId })
      );

      await act(async () => {
        const success = await result.current.applyPromoCode("NOSTACK");
        expect(success).toBe(false);
      });

      expect(result.current.error).toBe(
        "This code cannot be combined with other promotions"
      );
    });

    it("should handle expired campaign error", async () => {
      mockCartUpdate.mockRejectedValue(
        new Error("Promotion has ended")
      );

      const { result } = renderHook(() =>
        usePromoCode({ cartId: mockCartId })
      );

      await act(async () => {
        const success = await result.current.applyPromoCode("EXPIRED");
        expect(success).toBe(false);
      });

      expect(result.current.error).toBe("This promo code has expired");
    });

    it("should handle not-yet-started campaign error", async () => {
      mockCartUpdate.mockRejectedValue(
        new Error("Promotion has not started yet")
      );

      const { result } = renderHook(() =>
        usePromoCode({ cartId: mockCartId })
      );

      await act(async () => {
        const success = await result.current.applyPromoCode("FUTURE");
        expect(success).toBe(false);
      });

      expect(result.current.error).toBe("This promotion has not started yet");
    });

    it("should handle usage limit exceeded error", async () => {
      mockCartUpdate.mockRejectedValue(
        new Error("Budget exceeded for this promotion")
      );

      const { result } = renderHook(() =>
        usePromoCode({ cartId: mockCartId })
      );

      await act(async () => {
        const success = await result.current.applyPromoCode("MAXED");
        expect(success).toBe(false);
      });

      expect(result.current.error).toBe(
        "This promo code has reached its usage limit"
      );
    });
  });

  describe("multiple codes", () => {
    it("should send all codes when adding new one", async () => {
      mockCartUpdate.mockResolvedValue({
        cart: { id: mockCartId, discount_total: 15 },
      });

      const { result } = renderHook(() =>
        usePromoCode({ cartId: mockCartId })
      );

      // Apply first code
      await act(async () => {
        await result.current.applyPromoCode("CODE1");
      });

      // Apply second code
      await act(async () => {
        await result.current.applyPromoCode("CODE2");
      });

      // Second call should include both codes
      expect(mockCartUpdate).toHaveBeenLastCalledWith(mockCartId, {
        promo_codes: ["CODE1", "CODE2"],
      });
    });

    it("should send remaining codes when removing one", async () => {
      mockCartUpdate.mockResolvedValue({
        cart: { id: mockCartId, discount_total: 10 },
      });

      const { result } = renderHook(() =>
        usePromoCode({ cartId: mockCartId })
      );

      // Apply two codes
      await act(async () => {
        await result.current.applyPromoCode("CODE1");
      });
      await act(async () => {
        await result.current.applyPromoCode("CODE2");
      });

      // Remove first code
      await act(async () => {
        await result.current.removePromoCode("CODE1");
      });

      // Should only send CODE2
      expect(mockCartUpdate).toHaveBeenLastCalledWith(mockCartId, {
        promo_codes: ["CODE2"],
      });

      expect(result.current.appliedCodes).toHaveLength(1);
      expect(result.current.appliedCodes[0].code).toBe("CODE2");
    });
  });
});
