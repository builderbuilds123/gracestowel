import { test, expect } from "@playwright/test";

/**
 * Visual Regression Tests
 * Captures screenshots of critical pages to detect unintended UI changes
 *
 * Note: These tests navigate directly to known pages to ensure consistency.
 * Visual regression tests require baseline screenshots to be generated first.
 */
test.describe("Visual Regression", () => {
  test.describe("Homepage", () => {
    test.skip("should match homepage snapshot", async ({ page }) => {
      await page.goto("/");
      await page.waitForLoadState("networkidle");

      // Wait for any animations to complete
      await page.waitForTimeout(500);

      await expect(page).toHaveScreenshot("homepage.png", {
        fullPage: true,
        maxDiffPixelRatio: 0.05,
      });
    });

    test("should match homepage mobile snapshot", async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto("/");
      await page.waitForLoadState("networkidle");

      await expect(page).toHaveScreenshot("homepage-mobile.png", {
        fullPage: true,
        maxDiffPixelRatio: 0.05,
      });
    });
  });

  test.describe("Product Page", () => {
    test("should match product page snapshot", async ({ page }) => {
      // Navigate directly to a known product page
      await page.goto("/products/the-nuzzle");
      await page.waitForLoadState("networkidle");

      await expect(page).toHaveScreenshot("product-page.png", {
        fullPage: true,
        maxDiffPixelRatio: 0.05,
      });
    });
  });

  test.describe("Cart", () => {
    test("should match cart drawer snapshot", async ({ page }) => {
      // Add item to cart by going to product page directly
      await page.goto("/products/the-nuzzle");
      await page.waitForLoadState("networkidle");
      await page
        .getByRole("button", { name: /hang it up|add to cart/i })
        .click();

      // Wait for cart drawer to be visible
      await expect(page.getByRole("heading", { name: /towel rack/i })).toBeVisible();

      // Screenshot the visible cart drawer area
      await expect(page).toHaveScreenshot("cart-drawer.png", {
        maxDiffPixelRatio: 0.05,
      });
    });

    test("should match empty cart snapshot", async ({ page }) => {
      await page.goto("/");
      await page.waitForLoadState("networkidle");

      // Open cart via button
      const cartButton = page.getByRole("button", { name: /cart/i });
      
      await expect(cartButton).toBeVisible();
      await cartButton.click();
      
      // Wait for cart drawer to be visible before screenshot
      await expect(page.getByRole("heading", { name: /towel rack/i })).toBeVisible();

      await expect(page).toHaveScreenshot("cart-empty.png", {
        maxDiffPixelRatio: 0.05,
      });
    });
  });

  test.describe("Checkout", () => {
    test("should match checkout page snapshot", async ({ page }) => {
      // Navigate directly to checkout
      await page.goto("/checkout");
      await page.waitForLoadState("networkidle");

      await expect(page).toHaveScreenshot("checkout-page.png", {
        fullPage: true,
        maxDiffPixelRatio: 0.05,
      });
    });
  });

  test.describe("Error States", () => {
    test("should match 404 page snapshot", async ({ page }) => {
      await page.goto("/non-existent-page-12345");
      await page.waitForLoadState("networkidle");

      await expect(page).toHaveScreenshot("404-page.png", {
        fullPage: true,
        maxDiffPixelRatio: 0.05,
      });
    });
  });
});
