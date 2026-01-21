import { describe, expect, it, vi } from "vitest";
import { Modules } from "@medusajs/framework/utils";

vi.mock("../../src/utils/logger", async () => {
  return {
    setAnalyticsServiceForLogger: vi.fn(),
  };
});

import analyticsLoggerLoader from "../../src/loaders/analytics-logger";
import { setAnalyticsServiceForLogger } from "../../src/utils/logger";

describe("analytics logger loader", () => {
  it("registers analytics service for logger", async () => {
    const analyticsService = { track: vi.fn() };
    const container = {
      resolve: vi.fn().mockReturnValue(analyticsService),
    };

    await analyticsLoggerLoader(container as unknown as { resolve: typeof container.resolve });

    expect(container.resolve).toHaveBeenCalledWith(Modules.ANALYTICS);
    expect(setAnalyticsServiceForLogger).toHaveBeenCalledWith(analyticsService);
  });
});
