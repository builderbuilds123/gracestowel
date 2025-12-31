import { faker } from '@faker-js/faker';

export type Payment = {
  id?: string;
  currency_code: string;
  amount: number;
  provider_id: string;
  data?: Record<string, unknown>;
  captured_at?: string;
};

export const createPayment = (overrides: Partial<Payment> = {}): Payment => ({
  id: faker.string.uuid(),
  currency_code: 'usd',
  amount: 5000,
  provider_id: 'stripe',
  ...overrides,
});
