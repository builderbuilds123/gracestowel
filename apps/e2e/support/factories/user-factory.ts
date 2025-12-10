import { faker } from '@faker-js/faker';

/**
 * User factory for creating test users
 * Uses faker for parallel-safe, unique data generation
 */
export type User = {
  id?: string;
  email: string;
  password?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  role?: 'customer' | 'admin';
};

export const createUser = (overrides: Partial<User> = {}): User => ({
  id: faker.string.uuid(),
  email: faker.internet.email(),
  password: faker.internet.password({ length: 12 }),
  firstName: faker.person.firstName(),
  lastName: faker.person.lastName(),
  phone: faker.phone.number(),
  role: 'customer',
  ...overrides,
});

export const createAdminUser = (overrides: Partial<User> = {}): User =>
  createUser({ role: 'admin', ...overrides });
