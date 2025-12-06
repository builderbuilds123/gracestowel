import { faker } from "@faker-js/faker";

export const createMockProduct = (overrides = {}) => {
  return {
    id: `prod_${faker.string.alphanumeric(10)}`,
    title: faker.commerce.productName(),
    handle: faker.lorem.slug(),
    description: faker.commerce.productDescription(),
    thumbnail: faker.image.url(),
    images: Array.from({ length: 3 }, () => ({
      id: `img_${faker.string.alphanumeric(10)}`,
      url: faker.image.url(),
    })),
    variants: [
      {
        id: `variant_${faker.string.alphanumeric(10)}`,
        title: "Default Variant",
        prices: [
          {
            currency_code: "usd",
            amount: parseInt(faker.commerce.price({ min: 1000, max: 10000 })), // cents
          },
        ],
      },
    ],
    ...overrides,
  };
};
