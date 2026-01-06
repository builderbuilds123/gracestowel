import { faker } from "@faker-js/faker";

export interface ShippingOption {
  id?: string;
  name: string;
  price_type?: "flat" | "calculated";
  amount?: number;
  service_zone_id?: string;
  shipping_profile_id?: string;
  provider_id?: string;
  data?: Record<string, unknown>;
  requirements?: {
    type: "min_subtotal" | "max_subtotal";
    amount: number;
    id?: string;
  }[];
}

export const createShippingOption = (
  overrides: Partial<ShippingOption> = {}
): ShippingOption => {
  return {
    name: faker.commerce.productName() + " Shipping",
    price_type: "flat",
    amount: 1000,
    ...overrides,
  };
};
