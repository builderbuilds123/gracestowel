import { test, expect } from "@playwright/test";

/**
 * Resilience Tests: Network Failure Scenarios
 * Tests critical flows under real-world failure conditions
 */
test.describe("Network Resilience", () => {
  test("should handle slow network gracefully", async ({ page }) => {
    // Simulate slow network
    await page.route("**/*", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.continue();
    });

    await page.goto("/");

    // Page should still load with loading indicators
    await expect(page).toHaveTitle(/Grace Stowel/i);
  });

  test("should show error state when API fails", async ({ page }) => {
    // Intercept API calls and return errors
    await page.route("**/store/products**", (route) => {
      route.fulfill({
        status: 500,
        body: JSON.stringify({ error: "Internal Server Error" }),
      });
    });

    await page.goto("/towels");

    // Should show error message or fallback UI
    await expect(
      page.getByText(/error|something went wrong|try again/i)
    ).toBeVisible();
  });

  test("should retry failed requests", async ({ page }) => {
    let requestCount = 0;

    // Fail first request, succeed on retry
    await page.route("**/store/products**", (route) => {
      requestCount++;
      if (requestCount === 1) {
        route.fulfill({
          status: 503,
          body: JSON.stringify({ error: "Service Unavailable" }),
        });
      } else {
        route.continue();
      }
    });

    await page.goto("/towels");

    // Should eventually show products after retry
    await expect(page.locator('[data-testid="product-card"]').first()).toBeVisible({
      timeout: 10000,
    });
  });

  test("should preserve cart during network interruption", async ({ page }) => {
    // Add item to cart
    await page.goto("/towels");
    const firstProduct = page.locator('[data-testid="product-card"]').first();
    await firstProduct.click();
    await page.getByRole("button", { name: /add to cart/i }).click();

    // Simulate network failure
    await page.route("**/*", (route) => {
      route.abort("failed");
    });

    // Try to navigate (will fail)
    await page.goto("/").catch(() => {});

    // Restore network
    await page.unroute("**/*");

    // Reload and check cart is preserved (from localStorage)
    await page.goto("/");
    await page.getByRole("button", { name: /cart/i }).click();

    await expect(page.locator('[data-testid="cart-item"]')).toHaveCount(1);
  });

  test("should handle checkout API timeout", async ({ page }) => {
    // Add item and go to checkout
    await page.goto("/towels");
    const firstProduct = page.locator('[data-testid="product-card"]').first();
    await firstProduct.click();
    await page.getByRole("button", { name: /add to cart/i }).click();
    await page.getByRole("link", { name: /checkout/i }).click();

    // Simulate slow checkout API
    await page.route("**/store/carts/**", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      await route.continue();
    });

    // Fill form and submit
    await page.getByLabel(/email/i).fill("test@example.com");

    // Should show loading state
    await expect(page.getByText(/processing|loading/i)).toBeVisible();
  });
});

test.describe("Offline Mode", () => {
  test("should show offline indicator when network is lost", async ({ page, context }) => {
    await page.goto("/");

    // Go offline
    await context.setOffline(true);

    // Try to navigate
    await page.goto("/towels").catch(() => {});

    // Should show offline message
    await expect(page.getByText(/offline|no connection/i)).toBeVisible();
  });

  test("should recover when network is restored", async ({ page, context }) => {
    await page.goto("/");

    // Go offline then online
    await context.setOffline(true);
    await page.goto("/towels").catch(() => {});
    await context.setOffline(false);

    // Reload should work
    await page.reload();
    await expect(page.locator('[data-testid="product-card"]').first()).toBeVisible();
  });
});

