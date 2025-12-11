import { Page } from '@playwright/test';

/**
 * Network-first testing helpers
 * Always intercept BEFORE navigation to prevent race conditions
 */

/**
 * Intercept and wait for a specific API response
 * Use this pattern: intercept → navigate → await → assert
 */
export async function waitForApiResponse(
  page: Page,
  urlPattern: string | RegExp | ((url: URL) => boolean),
  options?: { status?: number; timeout?: number },
): Promise<{ url: string; status: number; body: unknown }> {
  const responsePromise = page.waitForResponse(
    (response) => {
      const url = response.url();
      const matchesUrl =
        typeof urlPattern === 'string'
          ? url.includes(urlPattern)
          : typeof urlPattern === 'function'
            ? urlPattern(new URL(url))
            : urlPattern.test(url);

      const matchesStatus = options?.status ? response.status() === options.status : true;

      return matchesUrl && matchesStatus;
    },
    { timeout: options?.timeout || 30000 },
  );

  const response = await responsePromise;
  const body = await response.json().catch(() => null);

  return {
    url: response.url(),
    status: response.status(),
    body,
  };
}

/**
 * Mock an API response before navigation
 * Returns a promise that resolves when the mocked request is made
 */
export async function mockApiResponse(
  page: Page,
  urlPattern: string | RegExp,
  mockResponse: { status?: number; body: unknown },
): Promise<void> {
  await page.route(urlPattern, (route) => {
    route.fulfill({
      status: mockResponse.status || 200,
      contentType: 'application/json',
      body: JSON.stringify(mockResponse.body),
    });
  });
}
