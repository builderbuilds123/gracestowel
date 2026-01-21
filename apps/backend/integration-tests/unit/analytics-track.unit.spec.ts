import { describe, expect, it, vi } from "vitest";
import { trackEvent } from "../../src/utils/analytics";


describe("trackEvent", () => {
  it("normalizes event name and masks properties", async () => {
    const track = vi.fn();
    const container = {
      resolve: vi.fn().mockReturnValue({ track }),
    };

    await trackEvent(container as unknown as { resolve: typeof container.resolve }, "order_placed", {
      actorId: "cust_1",
      properties: {
        email: "a@b.com",
        message: "call 555-123-4567",
      },
    });

    expect(track).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "order.placed",
        actor_id: "cust_1",
        properties: expect.objectContaining({
          email: "[redacted]",
          message: expect.any(String),
        }),
      })
    );
  });
});
