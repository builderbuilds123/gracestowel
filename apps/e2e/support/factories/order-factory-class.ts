import { APIRequestContext } from "@playwright/test";
import { createOrder, Order } from "./order-factory";
import { apiRequest } from "../helpers/api-request";

export class OrderFactory {
  private readonly createdOrderIds: string[] = [];

  constructor(private readonly request: APIRequestContext) {}

  async createOrder(overrides: Partial<Order> = {}): Promise<Order> {
    const order = createOrder(overrides);

    try {
      const created = await apiRequest<{ order?: { id: string } }>({
        request: this.request,
        method: "POST",
        url: "/admin/orders",
        data: {
          ...order,
          email: order.user.email,
          items: order.items.map((item) => ({
            title: item.product.title,
            quantity: item.quantity,
            unit_price: item.product.price,
            product_id: item.product.id,
          })),
        },
      });

      if (created.order?.id) {
        this.createdOrderIds.push(created.order.id);
        return { ...order, id: created.order.id };
      }
    } catch (error) {
      console.warn("Order seeding skipped; using generated data.");
    }

    return order;
  }

  async cleanup(): Promise<void> {
    for (const orderId of this.createdOrderIds) {
      try {
        await apiRequest({
          request: this.request,
          method: "DELETE",
          url: `/admin/orders/${orderId}`,
        });
      } catch (error) {
        console.warn(`Order cleanup skipped for ${orderId}.`);
      }
    }
    this.createdOrderIds.length = 0;
  }
}
