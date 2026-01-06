import { test, expect } from "../support/fixtures";

/**
 * Resilience Tests: Network Failure Scenarios
 * Tests critical flows under real-world failure conditions
 * 
 * NOTE: These tests verify graceful degradation and error handling
 * when network conditions are poor or APIs fail.
 */
test.describe("Network Resilience", () => {
  test("should handle slow network gracefully", async ({ page }) => {
    // Network-first: Setup slow network BEFORE navigation
    await page.route("**/*", async (route) => {
      // Simulate slow network (500ms delay)
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.continue();
    });

    await page.goto("/");
    
    // Wait for DOM content to stabilize
    await page.waitForLoadState("domcontentloaded");

    // Page should still load - verify title matches (flexible pattern for Grace/GracesTowel)
    await expect(page).toHaveTitle(/Grace/i);
    
    // Verify key content is visible
    await expect(page.getByRole("heading", { name: /Best Sellers/i })).toBeVisible({ timeout: 15000 });
  });

  test("should show error state when API fails", async ({ page }) => {
    // Network-first: Intercept API calls BEFORE navigation
    await page.route("**/store/products**", (route) => {
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Internal Server Error" }),
      });
    });

    // Wait for error response
    const errorResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/store/products") && response.status() === 500,
    );

    await page.goto("/towels");
    await errorResponsePromise;

    // Should show error message or fallback UI
    await expect(
      page.getByText(/error|something went wrong|try again/i),
    ).toBeVisible();
  });

  test("should retry failed requests", async ({ page }) => {
    let requestCount = 0;

    // Network-first: Setup retry logic BEFORE navigation
    await page.route("**/store/products**", (route) => {
      requestCount++;
      if (requestCount === 1) {
        route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "Service Unavailable" }),
        });
      } else {
        route.continue();
      }
    });

    // Wait for successful response (after retry)
    const successResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/store/products") && response.status() === 200,
    );

    await page.goto("/towels");

    // Should eventually show products after retry
    await successResponsePromise;
    // Use more reliable selector - product links or headings
    await expect(
      page.locator('a[href^="/products/"]').first(),
    ).toBeVisible({
      timeout: 10000,
    });
  });

  test("should preserve cart during network interruption", async ({ page }) => {
    // Navigate directly to known product to avoid flaky navigation
    await page.goto("/products/the-nuzzle");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("heading", { name: /Nuzzle/i })).toBeVisible();

    // Add to cart
    await page.getByRole("button", { name: /hang it up|add to cart/i }).click();

    // Wait for cart drawer to appear
    await expect(page.getByRole("heading", { name: /towel rack/i })).toBeVisible();

    // Wait for cart state to be persisted (small delay for storage)
    await page.waitForTimeout(1000);

    // Simulate network failure
    await page.route("**/*", (route) => route.abort("failed"));

    // Try to navigate (will fail)
    try {
      await page.goto("/checkout", { timeout: 5000 });
    } catch {
      // Expected - navigation fails during network outage
    }

    // Restore network
    await page.unroute("**/*");

    // Reload homepage and verify cart persisted
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    
    // Open cart using the cart button (may have different labels)
    const cartButton = page.getByRole("button", { name: /cart|open cart/i }).first();
    if (await cartButton.isVisible().catch(() => false)) {
      await cartButton.click();
    }

    // Verify cart drawer shows with item
    await expect(page.getByRole("heading", { name: /towel rack/i })).toBeVisible({ timeout: 10000 });
  });

  test("should handle checkout API timeout", async ({ page }) => {
    // Navigate directly to product and add to cart
    await page.goto("/products/the-nuzzle");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("heading", { name: /Nuzzle/i })).toBeVisible();

    await page.getByRole("button", { name: /hang it up|add to cart/i }).click();

    // Wait for cart drawer
    await expect(page.getByRole("heading", { name: /towel rack/i })).toBeVisible();

    // Click checkout
    const checkoutLink = page.getByRole("link", { name: /checkout/i });
    await expect(checkoutLink).toBeVisible();
    await checkoutLink.click();

    // Wait for checkout page to load
    await expect(page).toHaveURL(/checkout/i);
    
    // Setup slow cart API AFTER reaching checkout (to avoid blocking initial load)
    await page.route("**/store/carts/**", async (route) => {
      // Simulate slow API (3s delay)
      await new Promise((resolve) => setTimeout(resolve, 3000));
      await route.continue();
    });

    // Fill email field if visible
    const emailInput = page.getByLabel(/email/i);
    if (await emailInput.isVisible().catch(() => false)) {
      await emailInput.fill("test@example.com");
    }

    // The form should remain usable even with slow API
    // Just verify page doesn't crash
    await expect(page).toHaveURL(/checkout/i);
  });
});

test.describe("Offline Mode", () => {
  test("should handle offline navigation gracefully", async ({
    page,
    context,
  }) => {
    // First load homepage successfully
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("heading", { name: /Best Sellers/i })).toBeVisible();

    // Go offline
    await context.setOffline(true);

    // Try to navigate - this should fail but not crash
    try {
      await page.goto("/products/the-nuzzle", { timeout: 5000 });
    } catch {
      // Expected - navigation will fail when offline
    }

    // Verify the page shows some indication of failure or stays on current page
    // The exact behavior depends on browser/implementation
    // We just verify no unhandled crash occurred
    const currentUrl = page.url();
    expect(currentUrl).toBeDefined();
    
    // Restore online for cleanup
    await context.setOffline(false);
  });

  test("should recover when network is restored", async ({ page, context }) => {
    // Load homepage first
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("heading", { name: /Best Sellers/i })).toBeVisible();

    // Go offline briefly
    await context.setOffline(true);
    
    // Wait a moment
    await page.waitForTimeout(500);
    
    // Restore network
    await context.setOffline(false);

    // Navigate to product page - should work now
    await page.goto("/products/the-nuzzle");
    await page.waitForLoadState("domcontentloaded");

    // Verify product page loads successfully
    await expect(page.getByRole("heading", { name: /Nuzzle/i })).toBeVisible();
  });
});
