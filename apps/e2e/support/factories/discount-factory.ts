import { faker } from "@faker-js/faker";

/**
 * Promotion factory for Medusa v2
 */
export type PromotionRule = {
  operator: "eq" | "ne" | "gt" | "lt" | "gte" | "lte" | "in";
  attribute: string;
  values: string | string[];
};

export type ApplicationMethod = {
  type: "percentage" | "fixed";
  target_type: "order" | "item" | "shipping";
  value: number;
  currency_code?: string;
  allocation?: "total" | "across";
};

export type Discount = {
  id?: string;
  code: string;
  type: "standard" | "buyget";
  status?: string;
  is_automatic?: boolean;
  application_method: ApplicationMethod;
  rules?: PromotionRule[];
};

export const createDiscount = (overrides: Partial<Discount> = {}): Discount => {
  return {
    code: faker.string.alphanumeric({ length: 8 }).toUpperCase(),
    type: "standard",
    status: "active",
    is_automatic: false,
    application_method: {
      type: "percentage",
      target_type: "order",
      value: 10,
      ...overrides.application_method,
    },
    ...overrides,
  };
};
