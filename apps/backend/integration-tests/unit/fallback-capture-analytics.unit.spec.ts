import { describe, expect, it, vi } from "vitest";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

vi.mock("../../src/utils/analytics", () => ({
  trackEvent: vi.fn(),
}));

vi.mock("../../src/lib/payment-capture-queue", () => ({
  getPaymentCaptureQueue: vi.fn().mockReturnValue({ add: vi.fn() }),
  getJobState: vi.fn().mockResolvedValue("missing"),
}));

vi.mock("../../src/utils/stripe", () => ({
  getStripeClient: vi.fn().mockReturnValue({
    paymentIntents: {
      retrieve: vi.fn().mockResolvedValue({ status: "requires_capture" }),
    },
  }),
}));

vi.mock("../../src/repositories/order-recovery", () => ({
  getPendingRecoveryOrders: vi.fn().mockResolvedValue([
    {
      id: "order_recovery",
      metadata: { stripe_payment_intent_id: "pi_recovery", needs_recovery: true, recovery_reason: "redis_failure" },
      created_at: new Date().toISOString(),
      status: "pending",
    },
  ]),
}));

import { trackEvent } from "../../src/utils/analytics";
import fallbackCaptureJob from "../../src/jobs/fallback-capture";


describe("fallback capture analytics", () => {
  it("tracks recovery and fallback events", async () => {
    const query = {
      graph: vi.fn().mockResolvedValue({
        data: [
          {
            id: "order_fallback",
            metadata: { stripe_payment_intent_id: "pi_fallback" },
            created_at: new Date(Date.now() - 70 * 60 * 1000).toISOString(),
            status: "pending",
          },
        ],
      }),
    };

    const orderService = { updateOrders: vi.fn().mockResolvedValue(undefined) };
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

    const container = {
      resolve: vi.fn((key: string) => {
        if (key === "query") return query;
        if (key === "order") return orderService;
        if (key === ContainerRegistrationKeys.PG_CONNECTION) return {};
        if (key === ContainerRegistrationKeys.LOGGER) return logger;
        return {};
      }),
    } as any;

    process.env.REDIS_URL = "redis://localhost:6379";

    await fallbackCaptureJob(container);

    expect(trackEvent).toHaveBeenCalledWith(
      container,
      "recovery.redis_triggered",
      expect.any(Object)
    );
    expect(trackEvent).toHaveBeenCalledWith(
      container,
      "capture.fallback.triggered",
      expect.any(Object)
    );
  });
});
