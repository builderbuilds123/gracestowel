import { test as base } from '@playwright/test';
import { apiRequest, ApiRequestParams } from '../helpers/api-request';

/**
 * API Request Fixture
 * Provides typed API request helper to tests
 */
type ApiFixture = {
  apiRequest: <T = unknown>(params: Omit<ApiRequestParams, 'request'>) => Promise<T>;
};

export const test = base.extend<ApiFixture>({
  apiRequest: async ({ request }, use) => {
    await use(<T = unknown>(params: Omit<ApiRequestParams, 'request'>) => apiRequest<T>({ request, ...params }));
  },
});

export { expect } from '@playwright/test';
