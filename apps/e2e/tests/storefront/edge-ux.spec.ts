import { test, expect } from '../../support/fixtures';

test.describe('Edge UX & Resilience', () => {
  test('404 Page', async ({ page }) => {
    await page.goto('/non-existent-page-12345');
    await expect(page.getByText('404')).toBeVisible(); // Adjust selector based on actual UI
    await expect(page.getByTestId('404-page')).toBeVisible();
  });

  test('Slow Network UX', async ({ page }) => {
    // Emulate slow network
    const client = await page.context().newCDPSession(page);
    await client.send('Network.emulateNetworkConditions', {
      offline: false,
      downloadThroughput: 50 * 1024 / 8, // 50kbps
      uploadThroughput: 50 * 1024 / 8,
      latency: 500,
    });

    await page.goto('/');
    await expect(page.getByTestId('hero-banner')).toBeVisible({ timeout: 30000 });
  });
});
