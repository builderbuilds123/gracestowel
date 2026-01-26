import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/utils/analytics", () => ({
  trackEvent: vi.fn(),
}));



vi.mock("../../src/lib/payment-capture-queue", () => ({
  cancelPaymentCaptureJob: vi.fn().mockResolvedValue(true),
}));

vi.mock("../../src/lib/email-queue", () => ({
  enqueueEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../src/workers/email-worker", () => ({
  startEmailWorker: vi.fn(),
}));



vi.mock("../../src/lib/admin-notifications", () => ({
  sendAdminNotification: vi.fn().mockResolvedValue(undefined),
  AdminNotificationType: {
    ORDER_CANCELED: "ORDER_CANCELED",
    CUSTOMER_CREATED: "CUSTOMER_CREATED",
    FULFILLMENT_CREATED: "FULFILLMENT_CREATED",
    INVENTORY_BACKORDER: "INVENTORY_BACKORDER",
  },
}));

import { trackEvent } from "../../src/utils/analytics";
import orderCanceledHandler from "../../src/subscribers/order-canceled";
import customerCreatedHandler from "../../src/subscribers/customer-created";
import inventoryBackorderedSubscriber from "../../src/subscribers/inventory-backordered";

describe("subscriber analytics", () => {
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const query = { graph: vi.fn().mockResolvedValue({ data: [{ id: "order_1", email: "buyer@example.com", total: 100, currency_code: "usd", items: [] }] }) };
  const container = {
    resolve: vi.fn((key: string) => {
      if (key === "logger") return logger;
      if (key === "query") return query;
      return {};
    }),
  } as any;

  it("tracks order.canceled", async () => {
    await orderCanceledHandler({ event: { data: { id: "order_1", reason: "customer" } }, container } as any);
    expect(trackEvent).toHaveBeenCalledWith(
      container,
      "order.canceled",
      expect.objectContaining({
        properties: expect.objectContaining({ order_id: "order_1" }),
      })
    );
  });

  it("tracks customer.created", async () => {
    await customerCreatedHandler({ event: { data: { id: "cust_1" } }, container } as any);
    expect(trackEvent).toHaveBeenCalledWith(
      container,
      "customer.created",
      expect.objectContaining({
        actorId: "cust_1",
      })
    );
  });

  it("tracks inventory.backordered", async () => {
    await inventoryBackorderedSubscriber({
      event: {
        data: {
          order_id: "order_2",
          items: [
            {
              variant_id: "var_1",
              inventory_item_id: "inv_1",
              location_id: "loc_1",
              delta: -1,
              new_stock: -1,
              previous_stocked_quantity: 0,
              available_quantity: 0,
            },
          ],
        },
      },
      container,
    } as any);

    expect(trackEvent).toHaveBeenCalledWith(
      container,
      "inventory.backordered",
      expect.objectContaining({
        properties: expect.objectContaining({ order_id: "order_2" }),
      })
    );
  });
});
