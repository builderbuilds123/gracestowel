import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/utils/analytics", () => ({
  trackEvent: vi.fn(),
}));

import { trackEvent } from "../../src/utils/analytics";
import { errorHandlerMiddleware } from "../../src/api/middlewares";

describe("errorHandlerMiddleware analytics", () => {
  it("tracks backend.error with request context", () => {
    const req = {
      path: "/store/orders",
      method: "POST",
      scope: {},
    } as any;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as any;

    errorHandlerMiddleware(new Error("boom"), req, res, vi.fn());

    expect(trackEvent).toHaveBeenCalledWith(
      req.scope,
      "backend.error",
      expect.objectContaining({
        properties: expect.objectContaining({
          path: "/store/orders",
          method: "POST",
        }),
      })
    );
  });
});
