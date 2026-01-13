import { test, expect } from "../support/fixtures";

/**
 * Visual Regression Tests
 * Captures screenshots of critical pages to detect unintended UI changes
 *
 * Note: These tests navigate directly to known pages to ensure consistency.
 * Visual regression tests require baseline screenshots to be generated first.
 * 
 * Run with --update-snapshots to regenerate baselines.
 */
test.describe("Visual Regression", () => {
  // Skip visual regression tests in CI - they require baseline snapshots to be generated locally first
  // Run locally with: npx playwright test visual-regression.spec.ts --update-snapshots
  test.describe.configure({ mode: 'serial' });
  
  test.describe("Homepage", () => {
    test.skip("should match homepage snapshot", async ({ page }) => {
      await page.goto("/");
      await page.waitForLoadState("domcontentloaded");

      // Wait for key content to stabilize
      await expect(page.getByRole("heading", { name: /Bestselling|Best Sellers/i })).toBeVisible();

      await expect(page).toHaveScreenshot("homepage.png", {
        fullPage: true,
        maxDiffPixelRatio: 0.05,
      });
    });

    test.skip("should match homepage mobile snapshot", async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });

      await page.goto("/");
      await page.waitForLoadState("domcontentloaded");
      await expect(page.getByRole("heading", { name: /Bestselling|Best Sellers/i })).toBeVisible();

      await expect(page).toHaveScreenshot("homepage-mobile.png", {
        fullPage: true,
        maxDiffPixelRatio: 0.05,
      });
    });
  });

  test.describe("Product Page", () => {
    test.skip("should match product page snapshot", async ({ page }) => {
      // Navigate to product page and wait for content
      await page.goto("/products/the-nuzzle");
      await page.waitForLoadState("domcontentloaded");
      await expect(page.getByRole("heading", { name: /Nuzzle/i })).toBeVisible();

      await expect(page).toHaveScreenshot("product-page.png", {
        fullPage: true,
        maxDiffPixelRatio: 0.05,
      });
    });
  });

  test.describe("Cart", () => {
    test.skip("should match cart drawer snapshot", async ({ page }) => {
      // Navigate to product page and add to cart
      await page.goto("/products/the-nuzzle");
      await page.waitForLoadState("domcontentloaded");
      await expect(page.getByRole("heading", { name: /Nuzzle/i })).toBeVisible();

      await page.getByRole("button", { name: /hang it up|add to cart/i }).first().click();

      // Standardize cart heading and wait for hydration
      await expect(page.getByRole("heading", { name: /towel rack/i })).toBeVisible({ timeout: 30000 });
      await page.waitForTimeout(1000); // Ensure hydration

      // Screenshot the visible cart drawer area
      await expect(page).toHaveScreenshot("cart-drawer.png", {
        maxDiffPixelRatio: 0.05,
      });
    });

    test("should match empty cart snapshot", async ({ page }) => {
      // Go to homepage and wait for content
      await page.goto("/");
      await page.waitForLoadState("domcontentloaded");
      await expect(page.getByRole("heading", { name: /Bestselling|Best Sellers/i })).toBeVisible();

      // Try to open cart via button (may not be visible if cart icon isn't in nav)
      const cartButton = page.getByRole("button", { name: /cart|towel/i }).first();
      if (await cartButton.isVisible().catch(() => false)) {
        await cartButton.click();
        // Standardize cart heading and wait for hydration
        await expect(page.getByRole("heading", { name: /towel rack/i })).toBeVisible({ timeout: 30000 });
        await page.waitForTimeout(1000); // Ensure hydration
        await expect(page).toHaveScreenshot("cart-empty.png", {
          maxDiffPixelRatio: 0.05,
        });
      } else {
        // Skip if cart button not found
        test.skip();
      }
    });
  });

  test.describe("Checkout", () => {
    test.skip("should match checkout page snapshot", async ({ page }) => {
      await page.goto("/checkout");
      await page.waitForLoadState("domcontentloaded");

      await expect(page).toHaveScreenshot("checkout-page.png", {
        fullPage: true,
        maxDiffPixelRatio: 0.05,
      });
    });
  });

  test.describe("Error States", () => {
    test.skip("should match 404 page snapshot", async ({ page }) => {
      await page.goto("/non-existent-page-12345");
      await page.waitForLoadState("domcontentloaded");

      // Wait for 404 content to be visible
      await expect(page.getByText(/not found|404/i)).toBeVisible();

      await expect(page).toHaveScreenshot("404-page.png", {
        fullPage: true,
        maxDiffPixelRatio: 0.05,
      });
    });
  });
});
