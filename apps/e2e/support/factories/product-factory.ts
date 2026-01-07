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
  status?: string;
  images?: { url: string }[];
  options?: { title: string; values: string[] }[];
  variants?: Array<{
    id?: string;
    title: string;
    sku?: string;
    options: Record<string, string>;
    prices: { amount: number; currency_code: string }[];
    manage_inventory: boolean;
    allow_backorder?: boolean;
  }>;
  variant_id?: string;
  sales_channel_id?: string;
};

export const createProduct = (overrides: Partial<Product> = {}): Product => ({
  id: faker.string.uuid(),
  title: faker.commerce.productName(),
  description: faker.commerce.productDescription(),
  handle: faker.helpers.slugify(faker.commerce.productName()).toLowerCase(),
  status: 'published',
  images: [{ url: faker.image.url() }],
  options: [
    { title: 'Size', values: ['Default'] }
  ],
  variants: [
    {
      title: 'Default',
      sku: faker.string.alphanumeric(10),
      options: { 'Size': 'Default' },
      prices: [
        { amount: 2500, currency_code: 'usd' },
        { amount: 3500, currency_code: 'cad' }
      ],
      allow_backorder: true,
      manage_inventory: false,
    }
  ],
  ...overrides,
});
