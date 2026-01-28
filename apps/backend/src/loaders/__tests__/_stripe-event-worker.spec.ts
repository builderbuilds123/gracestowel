import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import stripeEventWorkerLoader from "../stripe-event-worker";

const { mockStartStripeEventWorker } = vi.hoisted(() => ({
  mockStartStripeEventWorker: vi.fn(),
}));

vi.mock("../../workers/stripe-event-worker", () => ({
  startStripeEventWorker: mockStartStripeEventWorker,
}));

describe("stripeEventWorkerLoader", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("skips starting the worker during integration tests", async () => {
    process.env.TEST_TYPE = "integration:http";
    process.env.REDIS_URL = "redis://localhost:6379";

    await stripeEventWorkerLoader({} as never);

    expect(mockStartStripeEventWorker).not.toHaveBeenCalled();
  });
});
