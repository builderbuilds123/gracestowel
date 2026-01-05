import { faker } from "@faker-js/faker";

export type DiscountRule = {
  type: "percentage" | "fixed";
  value: number;
  allocation?: "total" | "item";
};

export type Discount = {
  id?: string;
  code: string;
  is_dynamic?: boolean;
  is_disabled?: boolean;
  starts_at?: Date;
  ends_at?: Date | null;
  rule: DiscountRule;
};

export const createDiscount = (overrides: Partial<Discount> = {}): Discount => {
  const { rule, ...rest } = overrides;
  return {
    code: faker.string.alphanumeric({ length: 8 }).toUpperCase(),
    is_dynamic: false,
    is_disabled: false,
    starts_at: new Date(),
    ends_at: null,
    rule: {
      type: "percentage",
      value: 10,
      allocation: "total",
      ...rule,
    },
    ...rest,
  };
};
