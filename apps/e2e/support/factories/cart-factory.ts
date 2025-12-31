import { faker } from '@faker-js/faker';
import { Product, createProduct } from './product-factory';

export type CartItem = {
  id?: string;
  title: string;
  quantity: number;
  unit_price: number;
  variant_id?: string;
  product_id?: string;
};

export type Cart = {
  id?: string;
  email?: string;
  region_id?: string;
  items: CartItem[];
  currency_code: string;
};

export const createCartItem = (overrides: Partial<CartItem> = {}): CartItem => {
  const product = createProduct();
  return {
    id: faker.string.uuid(),
    title: product.title,
    quantity: 1,
    unit_price: product.price || 1000,
    variant_id: faker.string.uuid(),
    product_id: product.id,
    ...overrides,
  };
};

export const createCart = (overrides: Partial<Cart> = {}): Cart => ({
  id: faker.string.uuid(),
  email: faker.internet.email(),
  region_id: faker.string.uuid(),
  items: [createCartItem()],
  currency_code: 'usd',
  ...overrides,
});
