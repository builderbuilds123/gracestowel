import { faker } from '@faker-js/faker';

/**
 * Product factory for creating test products
 * Used for seeding product data via API before UI tests
 */
export type Product = {
  id?: string;
  title: string;
  description?: string;
  handle?: string;
  price?: number;
  stock?: number;
  category?: string;
  images?: string[];
};

export const createProduct = (overrides: Partial<Product> = {}): Product => ({
  id: faker.string.uuid(), // Generate ID for API payloads that need product_id
  title: faker.commerce.productName(),
  description: faker.commerce.productDescription(),
  handle: faker.helpers.slugify(faker.commerce.productName()).toLowerCase(),
  price: parseFloat(faker.commerce.price({ min: 10, max: 1000 })),
  stock: faker.number.int({ min: 0, max: 100 }),
  category: faker.commerce.department(),
  images: [faker.image.url()],
  ...overrides,
});
