import { faker } from '@faker-js/faker';

export type Discount = {
  id?: string;
  code: string;
  rule: {
    type: 'percentage' | 'fixed';
    value: number;
    allocation: 'total' | 'item';
  };
  is_dynamic?: boolean;
  starts_at?: string;
  ends_at?: string;
};

export const createDiscount = (overrides: Partial<Discount> = {}): Discount => ({
  id: faker.string.uuid(),
  code: faker.string.alphanumeric(8).toUpperCase(),
  rule: {
    type: 'percentage',
    value: 10,
    allocation: 'total',
  },
  is_dynamic: false,
  starts_at: new Date().toISOString(),
  ...overrides,
});
