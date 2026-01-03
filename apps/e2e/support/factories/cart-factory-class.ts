import { APIRequestContext } from "@playwright/test";
import { apiRequest } from "../helpers/api-request";
import { Cart, createCart } from "./cart-factory";

export class CartFactory {
  private readonly createdCartIds: string[] = [];

  constructor(private readonly request: APIRequestContext) {}

  async createCart(overrides: Partial<Cart> = {}): Promise<Cart> {
    const cart = createCart(overrides);
    try {
      const created = await apiRequest<{ cart?: { id: string } }>({
        request: this.request,
        method: "POST",
        url: "/store/carts",
        data: {
          email: cart.email,
          region_id: cart.region_id,
        },
      });

      if (created.cart?.id) {
        this.createdCartIds.push(created.cart.id);
        return { ...cart, id: created.cart.id };
      }
    } catch (error) {
      console.warn("Cart seeding skipped; using generated data.");
    }

    return cart;
  }

  async cleanup(): Promise<void> {
    for (const cartId of this.createdCartIds) {
      try {
        await apiRequest({
          request: this.request,
          method: "DELETE",
          url: `/store/carts/${cartId}`,
        });
      } catch (error) {
        console.warn(`Cart cleanup skipped for ${cartId}.`);
      }
    }
    this.createdCartIds.length = 0;
  }
}
