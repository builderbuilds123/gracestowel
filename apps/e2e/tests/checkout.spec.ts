import { test, expect } from "@playwright/test";

/**
 * Guest Checkout Flow E2E Tests
 * Critical path: Browse -> Add to Cart -> Checkout -> Payment
 */
test.describe("Guest Checkout Flow", () => {
  test.beforeEach(async ({ page }) => {
    // Start from the homepage
    await page.goto("/");
  });

  test("should display homepage with products", async ({ page }) => {
    // Verify homepage loads
    await expect(page).toHaveTitle(/Grace Stowel/i);

    // Check for product sections
    await expect(page.getByRole("heading", { name: /towels/i })).toBeVisible();
  });

  test("should navigate to product page and view details", async ({ page }) => {
    // Navigate to towels page
    await page.goto("/towels");

    // Click on first product
    const firstProduct = page.locator('[data-testid="product-card"]').first();
    await firstProduct.click();

    // Verify product page loads with details
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("button", { name: /add to cart/i })).toBeVisible();
  });

  test("should add product to cart", async ({ page }) => {
    // Navigate to a product page
    await page.goto("/towels");
    const firstProduct = page.locator('[data-testid="product-card"]').first();
    await firstProduct.click();

    // Add to cart
    await page.getByRole("button", { name: /add to cart/i }).click();

    // Verify cart drawer opens or cart count updates
    await expect(page.locator('[data-testid="cart-drawer"]')).toBeVisible();
    await expect(page.locator('[data-testid="cart-item"]')).toHaveCount(1);
  });

  test("should update cart quantity", async ({ page }) => {
    // Add product to cart first
    await page.goto("/towels");
    const firstProduct = page.locator('[data-testid="product-card"]').first();
    await firstProduct.click();
    await page.getByRole("button", { name: /add to cart/i }).click();

    // Increase quantity
    await page.getByRole("button", { name: /increase quantity/i }).click();

    // Verify quantity updated
    await expect(page.locator('[data-testid="cart-item-quantity"]')).toHaveText("2");
  });

  test("should remove item from cart", async ({ page }) => {
    // Add product to cart first
    await page.goto("/towels");
    const firstProduct = page.locator('[data-testid="product-card"]').first();
    await firstProduct.click();
    await page.getByRole("button", { name: /add to cart/i }).click();

    // Remove item
    await page.getByRole("button", { name: /remove/i }).click();

    // Verify cart is empty
    await expect(page.locator('[data-testid="cart-item"]')).toHaveCount(0);
    await expect(page.getByText(/your cart is empty/i)).toBeVisible();
  });

  test("should proceed to checkout", async ({ page }) => {
    // Add product to cart
    await page.goto("/towels");
    const firstProduct = page.locator('[data-testid="product-card"]').first();
    await firstProduct.click();
    await page.getByRole("button", { name: /add to cart/i }).click();

    // Click checkout button
    await page.getByRole("link", { name: /checkout/i }).click();

    // Verify checkout page loads
    await expect(page).toHaveURL(/\/checkout/);
    await expect(page.getByRole("heading", { name: /checkout/i })).toBeVisible();
  });

  test("should fill shipping information", async ({ page }) => {
    // Navigate to checkout with item in cart
    await page.goto("/towels");
    const firstProduct = page.locator('[data-testid="product-card"]').first();
    await firstProduct.click();
    await page.getByRole("button", { name: /add to cart/i }).click();
    await page.getByRole("link", { name: /checkout/i }).click();

    // Fill shipping form
    await page.getByLabel(/first name/i).fill("Test");
    await page.getByLabel(/last name/i).fill("User");
    await page.getByLabel(/email/i).fill("test@example.com");
    await page.getByLabel(/address/i).fill("123 Test Street");
    await page.getByLabel(/city/i).fill("Test City");
    await page.getByLabel(/state/i).fill("CA");
    await page.getByLabel(/zip/i).fill("12345");

    // Verify form is filled
    await expect(page.getByLabel(/first name/i)).toHaveValue("Test");
  });

  test("should display order summary on checkout", async ({ page }) => {
    // Add product and go to checkout
    await page.goto("/towels");
    const firstProduct = page.locator('[data-testid="product-card"]').first();
    await firstProduct.click();
    await page.getByRole("button", { name: /add to cart/i }).click();
    await page.getByRole("link", { name: /checkout/i }).click();

    // Verify order summary is visible
    await expect(page.getByText(/order summary/i)).toBeVisible();
    await expect(page.locator('[data-testid="order-total"]')).toBeVisible();
  });
});

test.describe("Cart Persistence", () => {
  test("should persist cart across page reloads", async ({ page }) => {
    // Add product to cart
    await page.goto("/towels");
    const firstProduct = page.locator('[data-testid="product-card"]').first();
    await firstProduct.click();
    await page.getByRole("button", { name: /add to cart/i }).click();

    // Reload page
    await page.reload();

    // Open cart and verify item is still there
    await page.getByRole("button", { name: /cart/i }).click();
    await expect(page.locator('[data-testid="cart-item"]')).toHaveCount(1);
  });
});

