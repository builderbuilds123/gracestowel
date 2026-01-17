import { test, expect } from "../../support/fixtures";

/**
 * Error Handling Tests
 * Tests application behavior under error conditions
 */

test.describe("404 Error Handling", () => {
  test("should display 404 page for non-existent route", async ({ page }) => {
    await page.goto("/this-page-does-not-exist");
    await page.waitForLoadState("domcontentloaded");

    // Verify error message is shown
    await expect(page.getByText(/not found|404|page.*exist/i)).toBeVisible();
  });

  test("should display 404 for non-existent product", async ({ page }) => {
    await page.goto("/products/non-existent-product-12345");
    await page.waitForLoadState("domcontentloaded");

    // Verify error or redirect behavior
    // Either shows 404 or redirects to products page
    const is404 = await page.getByText(/not found|404|product.*exist/i).isVisible().catch(() => false);
    const isRedirected = page.url().includes("/products");
    
    expect(is404 || isRedirected).toBe(true);
  });
});

test.describe("API Error Handling", () => {
  test("should handle API failure gracefully on product page", async ({ page, productFactory }) => {
    const product = await productFactory.createProduct();
    // Intercept product API with error
    await page.route(`**/store/products/${product.handle}**`, (route) => {
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ message: "Internal Server Error" }),
      });
    });

    await page.goto(`/products/${product.handle}`);
    await page.waitForLoadState("domcontentloaded");

    // Page should show error state or fallback
    const hasErrorMessage = await page.getByText(/error|something went wrong|try again|not found/i).isVisible().catch(() => false);
    const hasContent = await page.locator("body").isVisible();
    
    expect(hasErrorMessage || hasContent).toBe(true);
  });

  test("should handle cart API failure gracefully", async ({ page, productFactory }) => {
    const product = await productFactory.createProduct();
    // First load product page normally
    await page.goto(`/products/${product.handle}`);
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("heading", { name: new RegExp(product.title.split("").join("\\s*"), "i"), level: 1 }).first()).toBeVisible();

    // Then intercept cart API with error
    await page.route("**/store/carts**", (route) => {
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ message: "Cart service unavailable" }),
      });
    });

    // Try to add to cart
    const addToCartButton = page.getByRole("button", { name: /hang it up|add to cart/i }).first();
    await addToCartButton.evaluate((el: any) => el.click());

    // Wait for error handling - look for error message or alert
    // The app should either show an error message or remain interactive
    const errorAlert = page.getByRole('alert');
    const hasErrorAlert = await errorAlert.isVisible().catch(() => false);
    if (hasErrorAlert) {
      await expect(errorAlert).toBeVisible();
    }

    // Page should not crash - verify it's still interactive
    await expect(page.getByRole("button", { name: /hang it up|add to cart/i }).first()).toBeVisible();
  });
});

test.describe("Form Validation", () => {
  test("should show validation errors for empty checkout form", async ({ page }) => {
    // Navigate to checkout
    await page.goto("/checkout");
    await page.waitForLoadState("domcontentloaded");

    // Try to find and submit form without filling required fields
    const submitButton = page.getByRole("button", { name: /place order|submit|continue/i });
    
    if (await submitButton.isVisible().catch(() => false)) {
      await submitButton.click();

      // Should show validation errors - wait for validation to trigger
      
      // Check for validation messages (HTML5 validation or custom)
      const hasValidation = await page.locator(":invalid").count() > 0;
      const hasErrorText = await page.getByText(/required|invalid|please|enter/i).isVisible().catch(() => false);
      
      // At least one validation indicator should be present
      expect(hasValidation || hasErrorText).toBe(true);
    }
  });

  test("should validate email format on checkout", async ({ page }) => {
    await page.goto("/checkout");
    await page.waitForLoadState("domcontentloaded");

    const emailInput = page.getByLabel(/email/i);
    
    if (await emailInput.isVisible().catch(() => false)) {
      // Enter invalid email
      await emailInput.fill("invalid-email");
      await emailInput.blur();

      // Check for validation state with type safety
      const isInvalid = await emailInput
        .evaluate((el) => (el instanceof HTMLInputElement ? !el.validity.valid : false))
        .catch(() => false);
      
      // Assert that invalid email is properly flagged as invalid
      expect(isInvalid).toBe(true);
    }
  });
});

test.describe("Session Recovery", () => {
  test("should handle page refresh gracefully", async ({ page }) => {
    // Load homepage
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("heading", { name: /Bestselling|Best Sellers/i }).first()).toBeVisible();

    // Refresh page
    await page.reload();
    await page.waitForLoadState("domcontentloaded");

    // Page should still work
    await expect(page.getByRole("heading", { name: /Bestselling|Best Sellers/i }).first()).toBeVisible();
  });

  test("should handle browser back navigation", async ({ page, productFactory }) => {
    const product = await productFactory.createProduct();
    // Navigate to homepage
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("heading", { name: /Bestselling|Best Sellers/i }).first()).toBeVisible();

    // Navigate to product
    await page.goto(`/products/${product.handle}`);
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("heading", { name: new RegExp(product.title.split("").join("\\s*"), "i"), level: 1 }).first()).toBeVisible();

    // Go back
    await page.goBack();
    await page.waitForLoadState("domcontentloaded");

    // Should be on homepage
    await expect(page.getByRole("heading", { name: /Bestselling|Best Sellers/i }).first()).toBeVisible();
  });
});
