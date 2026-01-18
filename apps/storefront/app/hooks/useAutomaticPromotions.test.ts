import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useAutomaticPromotions } from "./useAutomaticPromotions";

// Create mock function
const mockPromotionList = vi.fn();

vi.mock("../lib/medusa", () => ({
  getMedusaClient: () => ({
    store: {
      promotion: {
        list: mockPromotionList,
      },
    },
  }),
}));

describe("useAutomaticPromotions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPromotionList.mockReset();
  });

  const createMockPromotion = (overrides = {}) => ({
    id: "promo_123",
    code: null,
    type: "standard",
    is_automatic: true,
    status: "active",
    application_method: {
      id: "app_123",
      type: "percentage",
      target_type: "shipping",
      value: 100,
    },
    rules: [
      {
        id: "rule_123",
        attribute: "cart.total",
        operator: "gte",
        values: [{ id: "val_123", value: "75" }],
      },
    ],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  });

  describe("fetching promotions", () => {
    it("should fetch automatic promotions on mount", async () => {
      mockPromotionList.mockResolvedValue({
        promotions: [createMockPromotion()],
      });

      const { result } = renderHook(() =>
        useAutomaticPromotions({ cartSubtotal: 50 })
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockPromotionList).toHaveBeenCalledWith({
        is_automatic: true,
      });
      expect(result.current.promotions).toHaveLength(1);
    });

    it("should not fetch when disabled", async () => {
      const { result } = renderHook(() =>
        useAutomaticPromotions({ cartSubtotal: 50, enabled: false })
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockPromotionList).not.toHaveBeenCalled();
    });

    it("should handle API errors gracefully", async () => {
      mockPromotionList.mockRejectedValue(new Error("API Error"));

      const { result } = renderHook(() =>
        useAutomaticPromotions({ cartSubtotal: 50 })
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBe("Failed to load promotions");
      expect(result.current.promotions).toHaveLength(0);
    });
  });

  describe("free shipping threshold", () => {
    it("should calculate amount remaining for free shipping", async () => {
      mockPromotionList.mockResolvedValue({
        promotions: [createMockPromotion()],
      });

      const { result } = renderHook(() =>
        useAutomaticPromotions({ cartSubtotal: 50 })
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.freeShippingThreshold).toBe(75);
      expect(result.current.amountToFreeShipping).toBe(25);
      expect(result.current.hasFreeShipping).toBe(false);
    });

    it("should indicate free shipping is applied when threshold met", async () => {
      mockPromotionList.mockResolvedValue({
        promotions: [createMockPromotion()],
      });

      const { result } = renderHook(() =>
        useAutomaticPromotions({ cartSubtotal: 80 })
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.hasFreeShipping).toBe(true);
      expect(result.current.amountToFreeShipping).toBe(0);
    });

    it("should show correct message when threshold not met", async () => {
      mockPromotionList.mockResolvedValue({
        promotions: [createMockPromotion()],
      });

      const { result } = renderHook(() =>
        useAutomaticPromotions({ cartSubtotal: 65 })
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.promotions[0].message).toBe(
        "Add $10.00 more for free shipping!"
      );
    });

    it("should show celebration message when threshold met", async () => {
      mockPromotionList.mockResolvedValue({
        promotions: [createMockPromotion()],
      });

      const { result } = renderHook(() =>
        useAutomaticPromotions({ cartSubtotal: 100 })
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.promotions[0].message).toBe(
        "🎉 Free shipping applied!"
      );
    });
  });

  describe("progress calculation", () => {
    it("should calculate progress percentage correctly", async () => {
      mockPromotionList.mockResolvedValue({
        promotions: [createMockPromotion()],
      });

      const { result } = renderHook(() =>
        useAutomaticPromotions({ cartSubtotal: 56.25 })
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // 56.25 / 75 = 75%
      expect(result.current.promotions[0].progressPercent).toBe(75);
    });

    it("should cap progress at 100%", async () => {
      mockPromotionList.mockResolvedValue({
        promotions: [createMockPromotion()],
      });

      const { result } = renderHook(() =>
        useAutomaticPromotions({ cartSubtotal: 150 })
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.promotions[0].progressPercent).toBe(100);
    });
  });

  describe("discount promotions", () => {
    it("should handle percentage discount promotions", async () => {
      mockPromotionList.mockResolvedValue({
        promotions: [
          createMockPromotion({
            application_method: {
              id: "app_123",
              type: "percentage",
              target_type: "order",
              value: 10,
            },
          }),
        ],
      });

      const { result } = renderHook(() =>
        useAutomaticPromotions({ cartSubtotal: 100 })
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.promotions[0].type).toBe("discount");
      expect(result.current.promotions[0].message).toBe(
        "🎉 10% discount applied!"
      );
    });
  });

  describe("inactive promotions", () => {
    it("should filter out inactive promotions", async () => {
      mockPromotionList.mockResolvedValue({
        promotions: [
          createMockPromotion({ status: "inactive" }),
          createMockPromotion({ id: "promo_456", status: "active" }),
        ],
      });

      const { result } = renderHook(() =>
        useAutomaticPromotions({ cartSubtotal: 50 })
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.promotions).toHaveLength(1);
      expect(result.current.promotions[0].id).toBe("promo_456");
    });
  });
});
