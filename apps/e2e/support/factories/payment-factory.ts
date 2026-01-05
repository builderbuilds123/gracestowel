import { faker } from "@faker-js/faker";

export type PaymentIntent = {
  id?: string;
  amount: number;
  currency_code: string;
  provider_id?: string;
  cart_id?: string;
  capture?: boolean;
};

export const createPaymentIntent = (
  overrides: Partial<PaymentIntent> = {},
): PaymentIntent => ({
  amount: faker.number.int({ min: 1000, max: 10000 }),
  currency_code: "usd",
  provider_id: "test-provider",
  capture: false,
  ...overrides,
});
