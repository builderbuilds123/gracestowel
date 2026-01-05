import { faker } from "@faker-js/faker";

export type ShippingOption = {
  id?: string;
  name: string;
  region_id?: string;
  price_type?: "flat" | "calculated";
  amount?: number;
  requirements?: Array<{
    type: "min_subtotal" | "max_subtotal";
    amount: number;
  }>;
};

export const createShippingOption = (
  overrides: Partial<ShippingOption> = {},
): ShippingOption => ({
  name: `Ship-${faker.commerce.productAdjective()}`,
  price_type: "flat",
  amount: faker.number.int({ min: 500, max: 2500 }),
  requirements: [],
  ...overrides,
});
