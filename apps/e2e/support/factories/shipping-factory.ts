import { faker } from '@faker-js/faker';

export type ShippingOption = {
  id?: string;
  name: string;
  amount: number;
  provider_id?: string;
  data?: Record<string, unknown>;
  price_type?: 'flat_rate' | 'calculated';
};

export const createShippingOption = (overrides: Partial<ShippingOption> = {}): ShippingOption => ({
  id: faker.string.uuid(),
  name: 'Standard Shipping',
  amount: 1000, // 10.00
  provider_id: 'manual',
  price_type: 'flat_rate',
  ...overrides,
});
