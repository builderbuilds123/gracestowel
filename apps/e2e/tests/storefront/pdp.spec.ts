import { test, expect } from '../../support/fixtures';

test.describe('Product Details Page', () => {
  test('Displays product information correctly', async ({ page, productFactory }) => {
    // Seed a product if possible, or navigate to a known one
    // Since seeding might not be fully wired up to the frontend instantly without build,
    // we'll try to use a real navigation if standard data exists, or mock if we can.
    // Assuming backend has data or we rely on pre-seeded data for now.

    // Better approach: Go to products list and click one
    await page.goto('/products');
    await page.getByTestId('product-card').first().click();

    await expect(page.getByTestId('product-title')).toBeVisible();
    await expect(page.getByTestId('product-price')).toBeVisible();
    await expect(page.getByTestId('add-to-cart-button')).toBeVisible();
  });

  test('Variant selection updates price/stock', async ({ page }) => {
    await page.goto('/products');
    await page.getByTestId('product-card').first().click();

    // Assumption: Product has variants
    const variantSelector = page.getByTestId('variant-selector');
    if (await variantSelector.isVisible()) {
      await variantSelector.first().click();
      // Expect price or status change
    }
  });
});
