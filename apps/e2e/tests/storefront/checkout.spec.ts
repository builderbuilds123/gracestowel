import { test, expect } from '../../support/fixtures';

test.describe('Checkout Flow', () => {
  test('Guest Checkout Happy Path', async ({ page }) => {
    // 1. Add to cart
    await page.goto('/products');
    await page.getByTestId('product-card').first().click();
    await page.getByTestId('add-to-cart-button').click();
    await page.getByTestId('checkout-button').click();

    // 2. Address
    await page.getByTestId('email-input').fill('guest@example.com');
    await page.getByTestId('shipping-address-first-name').fill('Guest');
    await page.getByTestId('shipping-address-last-name').fill('User');
    await page.getByTestId('shipping-address-address-1').fill('123 Main St');
    await page.getByTestId('shipping-address-city').fill('New York');
    await page.getByTestId('shipping-address-postal-code').fill('10001');
    // Select country if needed

    await page.getByTestId('continue-to-delivery-button').click();

    // 3. Delivery
    await page.getByTestId('shipping-option').first().click();
    await page.getByTestId('continue-to-payment-button').click();

    // 4. Payment
    // Mock stripe or use test credentials if configured
    await page.getByTestId('payment-method-stripe').click();
    await page.getByTestId('place-order-button').click();

    // 5. Confirmation
    await expect(page).toHaveURL(/\/order\/confirmed/);
    await expect(page.getByTestId('order-confirmation')).toBeVisible();
  });
});
