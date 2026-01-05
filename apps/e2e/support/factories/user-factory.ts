import { faker } from '@faker-js/faker';

/**
 * User factory for creating test users
 * Uses faker for parallel-safe, unique data generation
 */
export type User = {
  id?: string;
  email: string;
  password?: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
};

export const createUser = (overrides: Partial<User> = {}): User => ({
  email: faker.internet.email(),
  first_name: faker.person.firstName(),
  last_name: faker.person.lastName(),
  phone: faker.phone.number(),
  ...overrides,
});

export const createAdminUser = (overrides: Partial<User> = {}): User =>
  createUser(overrides);
