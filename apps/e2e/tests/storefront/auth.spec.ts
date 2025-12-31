import { test, expect } from '../../support/fixtures';

test.describe('Authentication', () => {
  test('User Signup and Login', async ({ page }) => {
    const email = `test-${Date.now()}@example.com`;
    const password = 'Password123!';

    // Signup
    await page.goto('/account/login');
    await page.getByTestId('register-button').click();
    await page.getByTestId('email-input').fill(email);
    await page.getByTestId('password-input').fill(password);
    await page.getByTestId('first-name-input').fill('Test');
    await page.getByTestId('last-name-input').fill('User');
    await page.getByTestId('submit-register-button').click();

    await expect(page.getByTestId('account-overview')).toBeVisible();

    // Logout
    await page.getByTestId('logout-button').click();
    await expect(page.getByTestId('login-form')).toBeVisible();

    // Login
    await page.getByTestId('email-input').fill(email);
    await page.getByTestId('password-input').fill(password);
    await page.getByTestId('submit-login-button').click();
    await expect(page.getByTestId('account-overview')).toBeVisible();
  });
});
