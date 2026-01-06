import { faker } from '@faker-js/faker';
import { User, createUser } from './user-factory';
import { Product, createProduct } from './product-factory';

/**
 * Order factory for creating test orders
 * Supports nested relationships (order → user, order → products)
 */
export type OrderItem = {
  product: Product;
  quantity: number;
  price: number;
};

export type Order = {
  id?: string;
  user: User;
  items: OrderItem[];
  total: number;
  status?: 'pending' | 'completed' | 'cancelled';
  shippingAddress?: {
    firstName: string;
    lastName: string;
    address1: string;
    city: string;
    country: string;
    postalCode: string;
  };
};

export const createOrderItem = (overrides: Partial<OrderItem> = {}): OrderItem => {
  const product = overrides.product || createProduct();
  const quantity = overrides.quantity || faker.number.int({ min: 1, max: 5 });

  // Get price from variants (Medusa v2 structure)
  const variantPrice = product.variants?.[0]?.prices?.[0]?.amount ?? 2500;
  
  return {
    product,
    quantity,
    price: variantPrice * quantity,
    ...overrides,
  };
};

export const createOrder = (overrides: Partial<Order> = {}): Order => {
  const items = overrides.items || [createOrderItem(), createOrderItem()];
  const total = items.reduce((sum, item) => sum + item.price, 0);

  return {
    id: faker.string.uuid(),
    user: overrides.user || createUser(),
    items,
    total,
    status: 'pending',
    shippingAddress: {
      firstName: faker.person.firstName(),
      lastName: faker.person.lastName(),
      address1: faker.location.streetAddress(),
      city: faker.location.city(),
      country: faker.location.countryCode(),
      postalCode: faker.location.zipCode(),
    },
    ...overrides,
  };
};
