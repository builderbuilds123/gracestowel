import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@medusajs/framework/utils", () => ({
  defineConfig: (config: unknown) => config,
  loadEnv: () => {},
}));

describe("medusa-config event bus", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("uses local event bus in integration tests", async () => {
    process.env.TEST_TYPE = "integration:http";

    const mod = await import("../../medusa-config");
    const config = (mod as { default?: any }).default ?? mod;

    const eventBus = config.modules.find(
      (entry: { key?: string }) => entry.key === "eventBusService"
    );

    expect(eventBus?.resolve).toBe("@medusajs/event-bus-local");
  });
});
