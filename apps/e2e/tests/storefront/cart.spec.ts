import { test, expect } from '../../support/fixtures';

test.describe('Cart Functionality', () => {
  test('Add to cart from PDP', async ({ page }) => {
    await page.goto('/products');
    await page.getByTestId('product-card').first().click();
    await page.getByTestId('add-to-cart-button').click();

    await expect(page.getByTestId('cart-drawer')).toBeVisible();
    await expect(page.getByTestId('cart-item')).toHaveCount(1);
  });

  test('Update quantity', async ({ page }) => {
    // Add item first
    await page.goto('/products');
    await page.getByTestId('product-card').first().click();
    await page.getByTestId('add-to-cart-button').click();

    // Update
    await page.getByTestId('cart-quantity-plus').click();
    await expect(page.getByTestId('cart-item-quantity')).toContainText('2');
  });

  test('Persistence across reload', async ({ page }) => {
    await page.goto('/products');
    await page.getByTestId('product-card').first().click();
    await page.getByTestId('add-to-cart-button').click();

    await page.reload();
    await page.getByTestId('cart-toggle').click();
    await expect(page.getByTestId('cart-item')).toHaveCount(1);
  });
});
