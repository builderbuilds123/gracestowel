import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { usePromoCode } from "./usePromoCode";

const mockMonitoredFetch = vi.hoisted(() => vi.fn());

vi.mock("../utils/monitored-fetch", () => ({
  monitoredFetch: (...args: unknown[]) => mockMonitoredFetch(...args),
}));

function jsonResponse(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("usePromoCode", () => {
  const mockCartId = "cart_123";

  const defaultCart = {
    id: mockCartId,
    discount_total: 10,
    promotions: [{ code: "TEST10", is_automatic: false, id: "promo_1" }],
    items: [] as object[],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockMonitoredFetch.mockReset();
  });

  describe("applyPromoCode", () => {
    it("should apply a valid promo code successfully", async () => {
      mockMonitoredFetch.mockResolvedValue(jsonResponse({ cart: defaultCart }));

      const { result } = renderHook(() =>
        usePromoCode({ cartId: mockCartId })
      );

      await act(async () => {
        const success = await result.current.applyPromoCode("TEST10");
        expect(success).toBe(true);
      });

      expect(result.current.appliedCodes).toHaveLength(1);
      expect(result.current.appliedCodes[0].code).toBe("TEST10");
      expect(result.current.successMessage).toBe('Promo code "TEST10" applied!');
      expect(result.current.error).toBeNull();
    });

    it("should normalize code to uppercase", async () => {
      mockMonitoredFetch.mockResolvedValue(jsonResponse({ cart: defaultCart }));

      const { result } = renderHook(() =>
        usePromoCode({ cartId: mockCartId })
      );

      await act(async () => {
        await result.current.applyPromoCode("test10");
      });

      expect(mockMonitoredFetch).toHaveBeenCalledWith(
        `/api/carts/${mockCartId}`,
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ promo_codes: ["TEST10"] }),
        })
      );
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
      expect(mockMonitoredFetch).not.toHaveBeenCalled();
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
      expect(mockMonitoredFetch).not.toHaveBeenCalled();
    });

    it("should prevent duplicate promo codes", async () => {
      mockMonitoredFetch.mockResolvedValueOnce(jsonResponse({ cart: defaultCart }));

      const { result } = renderHook(() =>
        usePromoCode({ cartId: mockCartId })
      );

      await act(async () => {
        await result.current.applyPromoCode("TEST10");
      });

      await act(async () => {
        const success = await result.current.applyPromoCode("TEST10");
        expect(success).toBe(false);
      });

      expect(result.current.error).toBe("This promo code is already applied");
    });

    it("should handle API errors gracefully", async () => {
      mockMonitoredFetch.mockResolvedValue(
        jsonResponse({ error: "Promotion not found" }, 404)
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
      mockMonitoredFetch.mockResolvedValue(jsonResponse({ cart: defaultCart }));

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
      mockMonitoredFetch
        .mockResolvedValueOnce(jsonResponse({ cart: defaultCart }))
        .mockResolvedValueOnce(
          jsonResponse({
            cart: {
              id: mockCartId,
              discount_total: 0,
              promotions: [],
              items: [],
            },
          })
        );

      const { result } = renderHook(() =>
        usePromoCode({ cartId: mockCartId })
      );

      await act(async () => {
        await result.current.applyPromoCode("TEST10");
      });

      expect(result.current.appliedCodes).toHaveLength(1);

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
      mockMonitoredFetch.mockResolvedValue(jsonResponse({ cart: defaultCart }));

      const { result } = renderHook(() =>
        usePromoCode({ cartId: mockCartId })
      );

      await act(async () => {
        await result.current.applyPromoCode("TEST10");
      });

      expect(result.current.successMessage).toBe('Promo code "TEST10" applied!');

      act(() => {
        result.current.clearMessages();
      });

      expect(result.current.successMessage).toBeNull();
      expect(result.current.error).toBeNull();
    });
  });

  describe("loading state", () => {
    it("should set isLoading during API calls", async () => {
      let resolvePromise!: (value: unknown) => void;
      const promise = new Promise((resolve) => {
        resolvePromise = resolve;
      });

      mockMonitoredFetch.mockReturnValue(promise);

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
        resolvePromise(jsonResponse({ cart: defaultCart }));
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });
  });

  describe("stacking and campaign errors", () => {
    it("should handle stacking error gracefully", async () => {
      mockMonitoredFetch.mockResolvedValue(
        jsonResponse({ error: "Promotions cannot be combined" }, 400)
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
      mockMonitoredFetch.mockResolvedValue(
        jsonResponse({ error: "Promotion has ended" }, 400)
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
      mockMonitoredFetch.mockResolvedValue(
        jsonResponse({ error: "Promotion has not started yet" }, 400)
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
      mockMonitoredFetch.mockResolvedValue(
        jsonResponse({ error: "Budget exceeded for this promotion" }, 400)
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
      mockMonitoredFetch
        .mockResolvedValueOnce(
          jsonResponse({
            cart: {
              id: mockCartId,
              discount_total: 5,
              promotions: [{ code: "CODE1", is_automatic: false, id: "p1" }],
              items: [],
            },
          })
        )
        .mockResolvedValueOnce(
          jsonResponse({
            cart: {
              id: mockCartId,
              discount_total: 15,
              promotions: [
                { code: "CODE1", is_automatic: false, id: "p1" },
                { code: "CODE2", is_automatic: false, id: "p2" },
              ],
              items: [],
            },
          })
        );

      const { result } = renderHook(() =>
        usePromoCode({ cartId: mockCartId })
      );

      await act(async () => {
        await result.current.applyPromoCode("CODE1");
      });

      await act(async () => {
        await result.current.applyPromoCode("CODE2");
      });

      const lastCall = mockMonitoredFetch.mock.calls[mockMonitoredFetch.mock.calls.length - 1];
      const body = JSON.parse((lastCall[1] as RequestInit).body as string);
      expect(body.promo_codes).toEqual(["CODE1", "CODE2"]);
    });

    it("should send remaining codes when removing one", async () => {
      mockMonitoredFetch
        .mockResolvedValueOnce(
          jsonResponse({
            cart: {
              id: mockCartId,
              discount_total: 10,
              promotions: [{ code: "CODE1", is_automatic: false, id: "p1" }],
              items: [],
            },
          })
        )
        .mockResolvedValueOnce(
          jsonResponse({
            cart: {
              id: mockCartId,
              discount_total: 15,
              promotions: [
                { code: "CODE1", is_automatic: false, id: "p1" },
                { code: "CODE2", is_automatic: false, id: "p2" },
              ],
              items: [],
            },
          })
        )
        .mockResolvedValueOnce(
          jsonResponse({
            cart: {
              id: mockCartId,
              discount_total: 5,
              promotions: [{ code: "CODE2", is_automatic: false, id: "p2" }],
              items: [],
            },
          })
        );

      const { result } = renderHook(() =>
        usePromoCode({ cartId: mockCartId })
      );

      await act(async () => {
        await result.current.applyPromoCode("CODE1");
      });
      await act(async () => {
        await result.current.applyPromoCode("CODE2");
      });

      await act(async () => {
        const success = await result.current.removePromoCode("CODE1");
        expect(success).toBe(true);
      });

      const removeCall = mockMonitoredFetch.mock.calls[2];
      const body = JSON.parse((removeCall[1] as RequestInit).body as string);
      expect(body.promo_codes).toEqual(["CODE2"]);

      expect(result.current.appliedCodes).toHaveLength(1);
      expect(result.current.appliedCodes[0].code).toBe("CODE2");
    });
  });
});
