import { test, expect } from "../support/fixtures";

/**
 * Resilience Tests: Network Failure Scenarios
 * Tests critical flows under real-world failure conditions
 */
test.describe("Network Resilience", () => {
  test("should handle slow network gracefully", async ({ page }) => {
    // Network-first: Setup slow network BEFORE navigation
    await page.route("**/*", async (route) => {
      // Simulate slow network (500ms delay)
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.continue();
    });

    // Network-first: Wait for products API
    const productsPromise = page.waitForResponse(
      (response) =>
        response.url().includes("/store/products") && response.status() === 200,
    );

    await page.goto("/");
    await productsPromise;

    // Page should still load with loading indicators
    await expect(page).toHaveTitle(/Grace Stowel/i);
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
    // Network-first: Setup intercepts
    const productsPromise = page.waitForResponse(
      (response) =>
        response.url().includes("/store/products") && response.status() === 200,
    );
    const cartPromise = page.waitForResponse(
      (response) =>
        (response.url().includes("/store/carts") ||
          response.url().includes("/store/cart")) &&
        response.status() === 200,
    );

    // Add item to cart
    await page.goto("/towels");
    await productsPromise;

    // Click first product link
    const firstProductLink = page.locator('a[href^="/products/"]').first();
    await expect(firstProductLink).toBeVisible();
    await firstProductLink.click();

    // Wait for product page to load
    await page.waitForLoadState("networkidle");

    // Add to cart
    await page
      .getByRole("button", { name: /hang it up|add to cart/i })
      .click();
    await cartPromise;

    // Wait for cart drawer to appear
    await expect(
      page.getByRole("heading", { name: /towel rack/i }),
    ).toBeVisible();

    // Simulate network failure - route BEFORE navigation
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

    // Verify cart has item
    await expect(
      page.getByRole("heading", { name: /towel rack/i }),
    ).toBeVisible();
    await expect(page.getByText(/The Nuzzle|towel/i)).toBeVisible();
  });

  test("should handle checkout API timeout", async ({ page }) => {
    // Network-first: Setup intercepts
    const productsPromise = page.waitForResponse(
      (response) =>
        response.url().includes("/store/products") && response.status() === 200,
    );
    const cartPromise = page.waitForResponse(
      (response) =>
        (response.url().includes("/store/carts") ||
          response.url().includes("/store/cart")) &&
        response.status() === 200,
    );

    // Add item and go to checkout
    await page.goto("/towels");
    await productsPromise;

    // Click first product
    const firstProductLink = page.locator('a[href^="/products/"]').first();
    await expect(firstProductLink).toBeVisible();
    await firstProductLink.click();
    await page.waitForLoadState("networkidle");

    await page
      .getByRole("button", { name: /hang it up|add to cart/i })
      .click();
    await cartPromise;

    // Wait for cart drawer
    await expect(
      page.getByRole("heading", { name: /towel rack/i }),
    ).toBeVisible();

    // Click checkout
    const checkoutLink = page.getByRole("link", { name: /checkout/i });
    await expect(checkoutLink).toBeVisible();
    await checkoutLink.click();

    // Network-first: Setup slow checkout API BEFORE form submission
    await page.route("**/store/carts/**", async (route) => {
      // Simulate slow API (5s delay)
      await new Promise((resolve) => setTimeout(resolve, 5000));
      await route.continue();
    });

    // Fill form
    await page.getByLabel(/email/i).fill("test@example.com");

    // Should show loading state
    await expect(page.getByText(/processing|loading/i)).toBeVisible({
      timeout: 10000,
    });
  });
});

test.describe("Offline Mode", () => {
  test("should show offline indicator when network is lost", async ({
    page,
    context,
  }) => {
    // Network-first: Wait for homepage to load first
    const productsPromise = page.waitForResponse(
      (response) =>
        response.url().includes("/store/products") && response.status() === 200,
    );

    await page.goto("/");
    await productsPromise;

    // Go offline
    await context.setOffline(true);

    // Try to navigate (will fail)
    await page.goto("/towels").catch(() => {});

    // Should show offline message
    await expect(page.getByText(/offline|no connection/i)).toBeVisible({
      timeout: 5000,
    });
  });

  test("should recover when network is restored", async ({ page, context }) => {
    // Network-first: Wait for homepage to load
    const productsPromise = page.waitForResponse(
      (response) =>
        response.url().includes("/store/products") && response.status() === 200,
    );

    await page.goto("/");
    await productsPromise;

    // Go offline then online
    await context.setOffline(true);
    await page.goto("/towels").catch(() => {});
    await context.setOffline(false);

    // Wait for products API after network restored
    const restoredProductsPromise = page.waitForResponse(
      (response) =>
        response.url().includes("/store/products") && response.status() === 200,
    );

    // Reload should work
    await page.reload();
    await restoredProductsPromise;

    // Verify products are visible
    await expect(
      page.locator('a[href^="/products/"]').first(),
    ).toBeVisible();
  });
});
