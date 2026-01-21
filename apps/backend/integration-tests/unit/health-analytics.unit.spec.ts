import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/utils/analytics", () => ({
  trackEvent: vi.fn(),
}));

import { trackEvent } from "../../src/utils/analytics";
import * as healthRoute from "../../src/api/health/route";

describe("health route analytics", () => {
  it("tracks system.health_check", async () => {
    const query = { graph: vi.fn().mockResolvedValue({ data: [{ id: "r_1" }] }) };
    const req = {
      scope: { resolve: vi.fn().mockReturnValue(query) },
    } as any;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as any;

    delete process.env.REDIS_URL;

    await healthRoute.GET(req, res);

    expect(trackEvent).toHaveBeenCalledWith(
      req.scope,
      "system.health_check",
      expect.objectContaining({
        properties: expect.objectContaining({
          service: "medusa-backend",
        }),
      })
    );
  });
});
