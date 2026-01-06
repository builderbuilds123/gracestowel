import { faker } from "@faker-js/faker";

export interface PaymentIntent {
  id?: string;
  amount: number;
  currency_code: string;
  status: string;
  cart_id?: string;
  provider_id?: string;
  data?: Record<string, unknown>;
}

export const createPaymentIntent = (
  overrides: Partial<PaymentIntent> = {}
): PaymentIntent => {
  return {
    amount: 1000,
    currency_code: "usd",
    status: "pending",
    provider_id: "manual",
    ...overrides,
  };
};
