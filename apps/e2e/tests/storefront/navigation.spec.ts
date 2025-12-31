import { test, expect } from '../../support/fixtures';

test.describe('Storefront Navigation', () => {
  test('Homepage loads and displays featured products', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Grace's Towel/);
    await expect(page.getByTestId('hero-banner')).toBeVisible();
    await expect(page.getByTestId('featured-products')).toBeVisible();
  });

  test('Category navigation works', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('nav-category-link').first().click();
    await expect(page).toHaveURL(/\/category\//);
    await expect(page.getByTestId('category-title')).toBeVisible();
  });

  test('Search functionality works', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('search-input').fill('towel');
    await page.getByTestId('search-input').press('Enter');
    await expect(page).toHaveURL(/\/search/);
    await expect(page.getByTestId('search-results')).toBeVisible();
  });
});
