import { describe, expect, it, vi } from "vitest";
import { logger, setAnalyticsServiceForLogger } from "../../src/utils/logger";

describe("logger analytics adapter", () => {
  it("sends info logs to analytics", () => {
    const track = vi.fn();
    setAnalyticsServiceForLogger({ track } as { track: typeof track });

    logger.info("test", "hello", { order_id: "o_1" });

    expect(track).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "log.info",
        properties: expect.objectContaining({
          component: "test",
          message: "hello",
        }),
      })
    );
  });
});
