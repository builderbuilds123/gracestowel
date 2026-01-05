import { test as base } from '@playwright/test';
import { UserFactory } from '../factories/user-factory-class';
import { ProductFactory } from '../factories/product-factory-class';

/**
 * Data Factory Fixture
 * Provides factories with auto-cleanup for test data
 */
type DataFactoryFixture = {
  userFactory: UserFactory;
  productFactory: ProductFactory;
};

export const test = base.extend<DataFactoryFixture>({
  userFactory: async ({ request }, use) => {
    const factory = new UserFactory(request);
    await use(factory);
    await factory.cleanup(); // Auto-cleanup after test
  },

  productFactory: async ({ request }, use) => {
    const factory = new ProductFactory(request);
    await use(factory);
    await factory.cleanup(); // Auto-cleanup after test
  },
});

export { expect } from '@playwright/test';
