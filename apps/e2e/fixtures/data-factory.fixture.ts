import { test as base } from '@playwright/test';
import { DataFactory } from '../helpers/data-factory';

export const test = base.extend<{ dataFactory: DataFactory }>({
  dataFactory: async ({}, use) => {
    const factory = new DataFactory();

    // Use the factory in the test
    await use(factory);

    // Cleanup after test completes
    await factory.cleanup();
  },
});

export { expect } from '@playwright/test';
