import { test, expect } from "@playwright/test";

/**
 * Visual Regression Tests
 * Captures screenshots of critical pages to detect unintended UI changes
 */
test.describe("Visual Regression", () => {
  test.describe("Homepage", () => {
    test("should match homepage snapshot", async ({ page }) => {
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
      await page.goto("/towels");
      const firstProduct = page.locator('[data-testid="product-card"]').first();
      await firstProduct.click();
      await page.waitForLoadState("networkidle");

      await expect(page).toHaveScreenshot("product-page.png", {
        fullPage: true,
        maxDiffPixelRatio: 0.05,
      });
    });
  });

  test.describe("Cart", () => {
    test("should match cart drawer snapshot", async ({ page }) => {
      // Add item to cart
      await page.goto("/towels");
      const firstProduct = page.locator('[data-testid="product-card"]').first();
      await firstProduct.click();
      await page.getByRole("button", { name: /add to cart/i }).click();

      // Wait for cart drawer animation
      await page.waitForTimeout(300);

      await expect(page.locator('[data-testid="cart-drawer"]')).toHaveScreenshot(
        "cart-drawer.png",
        { maxDiffPixelRatio: 0.05 }
      );
    });

    test("should match empty cart snapshot", async ({ page }) => {
      await page.goto("/");
      await page.getByRole("button", { name: /cart/i }).click();

      await expect(page.locator('[data-testid="cart-drawer"]')).toHaveScreenshot(
        "cart-empty.png",
        { maxDiffPixelRatio: 0.05 }
      );
    });
  });

  test.describe("Checkout", () => {
    test("should match checkout page snapshot", async ({ page }) => {
      // Add item and go to checkout
      await page.goto("/towels");
      const firstProduct = page.locator('[data-testid="product-card"]').first();
      await firstProduct.click();
      await page.getByRole("button", { name: /add to cart/i }).click();
      await page.getByRole("link", { name: /checkout/i }).click();

      await page.waitForLoadState("networkidle");

      await expect(page).toHaveScreenshot("checkout-page.png", {
        fullPage: true,
        maxDiffPixelRatio: 0.05,
      });
    });
  });

  test.describe("Error States", () => {
    test("should match 404 page snapshot", async ({ page }) => {
      await page.goto("/non-existent-page");
      await page.waitForLoadState("networkidle");

      await expect(page).toHaveScreenshot("404-page.png", {
        fullPage: true,
        maxDiffPixelRatio: 0.05,
      });
    });
  });
});

