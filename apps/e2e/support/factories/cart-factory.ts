import { faker } from "@faker-js/faker";
import type { Product } from "./product-factory";

export type CartLineItem = {
  product_id?: string;
  variant_id?: string;
  quantity: number;
  title?: string;
  unit_price?: number;
};

export type Cart = {
  id?: string;
  email?: string;
  currency_code?: string;
  region_id?: string;
  items?: CartLineItem[];
  customer_id?: string;
};

export const createCart = (overrides: Partial<Cart> = {}): Cart => ({
  email: faker.internet.email(),
  currency_code: "usd",
  items:
    overrides.items ?? [
      {
        quantity: 1,
        title: faker.commerce.productName(),
        unit_price: 5000,
      },
    ],
  ...overrides,
});

export const toLineItemPayload = (
  product: Product,
  quantity = 1,
): CartLineItem => ({
  product_id: product.id,
  quantity,
  title: product.title,
  unit_price: product.price,
});
