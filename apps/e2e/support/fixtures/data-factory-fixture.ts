import { test as base } from '@playwright/test';
import { UserFactory } from '../factories/user-factory-class';
import { ProductFactory } from '../factories/product-factory-class';
import { CartFactory } from '../factories/cart-factory-class';
import { OrderFactory } from '../factories/order-factory-class';

/**
 * Data Factory Fixture
 * Provides factories with auto-cleanup for test data
 */
type DataFactoryFixture = {
  userFactory: UserFactory;
  productFactory: ProductFactory;
  cartFactory: CartFactory;
  orderFactory: OrderFactory;
};

export const test = base.extend<DataFactoryFixture>({
  userFactory: async ({ request }, use) => {
    const factory = new UserFactory(request);
    await use(factory);
    await factory.cleanup();
  },

  productFactory: async ({ request }, use) => {
    const factory = new ProductFactory(request);
    await use(factory);
    await factory.cleanup();
  },

  cartFactory: async ({ request }, use) => {
    const factory = new CartFactory(request);
    await use(factory);
    await factory.cleanup();
  },

  orderFactory: async ({ request }, use) => {
    const factory = new OrderFactory(request);
    await use(factory);
    await factory.cleanup();
  },
});

export { expect } from '@playwright/test';
