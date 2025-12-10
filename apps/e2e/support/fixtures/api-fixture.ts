import { test as base } from '@playwright/test';
import { apiRequest } from '../helpers/api-request';

/**
 * API Request Fixture
 * Provides typed API request helper to tests
 */
type ApiFixture = {
  apiRequest: typeof apiRequest;
};

export const test = base.extend<ApiFixture>({
  apiRequest: async ({ request }, use) => {
    await use((params) => apiRequest({ request, ...params }));
  },
});

export { expect } from '@playwright/test';
