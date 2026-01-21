import { describe, expect, it, vi } from "vitest";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

vi.mock("../../src/utils/analytics", () => ({
  trackEvent: vi.fn(),
}));

vi.mock("../../src/lib/payment-capture-queue", () => ({
  schedulePaymentCapture: vi.fn().mockResolvedValue(undefined),
  formatModificationWindow: vi.fn().mockReturnValue("60m"),
}));

vi.mock("../../src/lib/email-queue", () => ({
  enqueueEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../src/loaders/stripe-event-worker", () => ({
  ensureStripeWorkerStarted: vi.fn(),
}));

vi.mock("../../src/workers/payment-capture-worker", () => ({
  startPaymentCaptureWorker: vi.fn(),
}));

vi.mock("../../src/workers/email-worker", () => ({
  startEmailWorker: vi.fn(),
}));

vi.mock("../../src/lib/admin-notifications", () => ({
  sendAdminNotification: vi.fn().mockResolvedValue(undefined),
  AdminNotificationType: { ORDER_PLACED: "ORDER_PLACED" },
}));

import { trackEvent } from "../../src/utils/analytics";
import orderPlacedHandler from "../../src/subscribers/order-placed";

describe("order placed analytics", () => {
  it("tracks order.placed event", async () => {
    const order = {
      id: "order_1",
      display_id: "123",
      email: "buyer@example.com",
      metadata: {},
      currency_code: "usd",
      total: 1000,
      subtotal: 900,
      shipping_total: 50,
      tax_total: 50,
      customer_id: "cust_1",
      created_at: new Date().toISOString(),
      items: [
        { product_id: "prod_1", title: "Towel", quantity: 1, unit_price: 1000 },
      ],
      payment_collections: [
        { payments: [{ data: { id: "pi_test_1" } }] },
      ],
    };

    const query = {
      graph: vi.fn().mockResolvedValue({ data: [order] }),
    };

    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    const container = {
      resolve: vi.fn((key: string) => {
        if (key === ContainerRegistrationKeys.LOGGER) return logger;
        if (key === "query") return query;
        return {};
      }),
    } as any;

    await orderPlacedHandler({ event: { data: { id: "order_1" } }, container } as any);

    expect(trackEvent).toHaveBeenCalledWith(
      container,
      "order.placed",
      expect.objectContaining({
        properties: expect.objectContaining({
          order_id: "order_1",
        }),
      })
    );
  });
});
