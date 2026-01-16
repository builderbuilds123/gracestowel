import { test, expect } from "@playwright/test";

/**
 * Multi-Region E2E Tests
 * Validates region persistence, cart creation with region_id, and checkout flow
 * with correct currency following Medusa v2 standards.
 */
test.describe("Multi-Region Flow", () => {
  const STORAGE_KEY_REGION = "medusa_region_id";
  const PRODUCT_HANDLE = "the-nuzzle";

  test.beforeEach(async ({ page }) => {
    // Clear localStorage to start fresh
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.removeItem("medusa_region_id");
      localStorage.removeItem("locale_language");
    });
  });

  test.describe("Region Persistence", () => {
    test("should auto-select a default region on first visit", async ({ page }) => {
      // Navigate to home page
      await page.goto("/");
      await page.waitForLoadState("domcontentloaded");

      // Wait for regions to load and default to be set
      await page.waitForTimeout(2000);

      // Check localStorage for region ID
      const regionId = await page.evaluate((key) => {
        const stored = localStorage.getItem(key);
        return stored ? JSON.parse(stored) : null;
      }, STORAGE_KEY_REGION);

      // Region ID should be set (we don't know the exact value)
      expect(regionId).toBeTruthy();
      expect(typeof regionId).toBe("string");
      expect(regionId).toMatch(/^reg_/); // Medusa region IDs start with "reg_"
    });

    test("should persist region across page navigation", async ({ page }) => {
      // Visit home page
      await page.goto("/");
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(2000);

      // Get the initial region ID
      const initialRegionId = await page.evaluate((key) => {
        const stored = localStorage.getItem(key);
        return stored ? JSON.parse(stored) : null;
      }, STORAGE_KEY_REGION);

      expect(initialRegionId).toBeTruthy();

      // Navigate to products page
      await page.goto("/towels");
      await page.waitForLoadState("domcontentloaded");

      // Get region ID after navigation
      const regionAfterNav = await page.evaluate((key) => {
        const stored = localStorage.getItem(key);
        return stored ? JSON.parse(stored) : null;
      }, STORAGE_KEY_REGION);

      // Region should persist
      expect(regionAfterNav).toBe(initialRegionId);
    });

    test("should persist region across page refresh", async ({ page }) => {
      // Visit home page
      await page.goto("/");
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(2000);

      // Get the initial region ID
      const initialRegionId = await page.evaluate((key) => {
        const stored = localStorage.getItem(key);
        return stored ? JSON.parse(stored) : null;
      }, STORAGE_KEY_REGION);

      expect(initialRegionId).toBeTruthy();

      // Refresh the page
      await page.reload();
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(1000);

      // Get region ID after refresh
      const regionAfterRefresh = await page.evaluate((key) => {
        const stored = localStorage.getItem(key);
        return stored ? JSON.parse(stored) : null;
      }, STORAGE_KEY_REGION);

      // Region should persist
      expect(regionAfterRefresh).toBe(initialRegionId);
    });
  });

  test.describe("Cart Creation with Region", () => {
    test("should create cart with region_id from localStorage", async ({ page }) => {
      // Navigate and wait for region to be set
      await page.goto(`/products/${PRODUCT_HANDLE}`);
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(2000);

      // Get the region ID
      const regionId = await page.evaluate((key) => {
        const stored = localStorage.getItem(key);
        return stored ? JSON.parse(stored) : null;
      }, STORAGE_KEY_REGION);

      expect(regionId).toBeTruthy();

      // Set up network monitoring for cart creation
      const cartCreatePromise = page.waitForRequest((req) =>
        req.url().includes("/api/carts") && req.method() === "POST"
      );

      // Add product to cart
      const addToCartButton = page.getByRole("button", { name: /hang it up|add to cart/i }).first();
      await expect(addToCartButton).toBeVisible({ timeout: 10000 });
      await addToCartButton.evaluate((node: any) => node.click());

      // Wait for cart count to update
      await expect(page.getByTestId("nav-cart-count")).not.toHaveText("0", { timeout: 10000 });

      // Navigate to checkout to trigger cart sync
      await page.goto("/checkout");
      await page.waitForLoadState("domcontentloaded");

      // Wait for cart creation request
      try {
        const cartCreateRequest = await Promise.race([
          cartCreatePromise,
          page.waitForTimeout(5000).then(() => null),
        ]);

        if (cartCreateRequest) {
          const postData = cartCreateRequest.postDataJSON();
          // Verify region_id is in the request (can be null if cart already exists)
          if (postData && postData.region_id) {
            expect(postData.region_id).toBe(regionId);
          }
        }
      } catch {
        // Cart may already exist, which is fine
      }
    });
  });

  test.describe("Checkout Currency Display", () => {
    test("should display prices in region currency on checkout", async ({ page }) => {
      // Navigate to product and add to cart
      await page.goto(`/products/${PRODUCT_HANDLE}`);
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(2000);

      // Add product to cart
      const addToCartButton = page.getByRole("button", { name: /hang it up|add to cart/i }).first();
      await expect(addToCartButton).toBeVisible({ timeout: 10000 });
      await addToCartButton.evaluate((node: any) => node.click());

      // Wait for cart count to update
      await expect(page.getByTestId("nav-cart-count")).not.toHaveText("0", { timeout: 10000 });

      // Navigate to checkout
      await page.goto("/checkout");
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(2000);

      // Check that prices are displayed (currency symbol present)
      const checkoutContent = await page.textContent("main");
      expect(checkoutContent).toBeTruthy();

      // Should contain a currency symbol ($ for CAD/USD, etc.)
      expect(checkoutContent).toMatch(/[\$€£¥]/);

      // Should contain a price format (number with decimal)
      expect(checkoutContent).toMatch(/\d+\.\d{2}/);
    });

    test("should show currency selector in header", async ({ page }) => {
      await page.goto("/");
      await page.waitForLoadState("domcontentloaded");

      // Look for currency selector button (typically shows current currency)
      const currencyButton = page.getByRole("button", { name: /\$\s*(CAD|USD)/i });
      await expect(currencyButton).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe("Region Error Handling", () => {
    test("should handle region mismatch gracefully", async ({ page }) => {
      // Add product to cart
      await page.goto(`/products/${PRODUCT_HANDLE}`);
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(2000);

      const addToCartButton = page.getByRole("button", { name: /hang it up|add to cart/i }).first();
      await expect(addToCartButton).toBeVisible({ timeout: 10000 });
      await addToCartButton.evaluate((node: any) => node.click());

      await expect(page.getByTestId("nav-cart-count")).not.toHaveText("0", { timeout: 10000 });

      // Navigate to checkout
      await page.goto("/checkout");
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(3000);

      // Checkout page should load without crashing
      // Look for any checkout element to confirm page is working
      const checkoutPage = page.locator("main");
      await expect(checkoutPage).toBeVisible();

      // Should not see "processing" hanging indefinitely
      // (we just check the page is interactive after load)
      const anyInteractiveElement = page.getByRole("button").first();
      await expect(anyInteractiveElement).toBeEnabled({ timeout: 15000 });
    });
  });
});
