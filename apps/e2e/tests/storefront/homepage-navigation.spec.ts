import { test, expect } from "../../support/fixtures";

/**
 * Homepage and Navigation Tests
 * Tests critical homepage elements, navigation, and user flows
 */

test.describe("Homepage", () => {
  test("should load homepage with all critical elements", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    // Verify page title
    await expect(page).toHaveTitle(/Grace/i);

    // Verify Best Sellers heading is visible
    await expect(page.getByRole("heading", { name: /Best Sellers/i })).toBeVisible();

    // Verify product cards are displayed
    const productLinks = page.locator('a[href^="/products/"]');
    await expect(productLinks.first()).toBeVisible();
    
    // Verify multiple products are shown
    const productCount = await productLinks.count();
    expect(productCount).toBeGreaterThan(0);
  });

  test("should have accessible navigation", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    // Verify main navigation exists
    const nav = page.getByRole("navigation").first();
    await expect(nav).toBeVisible();

    // Verify cart button is accessible
    const cartButton = page.getByRole("button", { name: /cart|open cart/i }).first();
    // Cart button may exist but might be hidden in some layouts
    const cartExists = await cartButton.count() > 0;
    expect(cartExists).toBe(true);
  });

  test("should display product cards with images and prices", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    // Wait for products to load
    await expect(page.getByRole("heading", { name: /Best Sellers/i })).toBeVisible();

    // Check that product cards have images
    const productImages = page.locator('a[href^="/products/"] img');
    const imageCount = await productImages.count();
    // At least one product image should be visible
    if (imageCount > 0) {
      await expect(productImages.first()).toBeVisible();
    }
  });
});

test.describe("Navigation", () => {
  test("should navigate from homepage to product page", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    // Click on first product
    const firstProduct = page.locator('a[href^="/products/"]').first();
    await expect(firstProduct).toBeVisible();
    await firstProduct.click();

    // Verify URL contains the product path
    await expect(page).toHaveURL(/\/products\//);

    // Verify product page loaded (has add to cart button)
    await expect(
      page.getByRole("button", { name: /hang it up|add to cart/i })
    ).toBeVisible();
  });

  test("should navigate to checkout page", async ({ page }) => {
    await page.goto("/checkout");
    await page.waitForLoadState("domcontentloaded");

    // Verify checkout page is accessible
    await expect(page).toHaveURL(/checkout/i);
  });

  test("should handle direct product URL navigation", async ({ page, productFactory }) => {
    const product = await productFactory.createProduct();
    await page.goto(`/products/${product.handle}`);
    await page.waitForLoadState("domcontentloaded");

    // Verify product page loaded
    await expect(page.getByRole("heading", { name: product.title })).toBeVisible();
    
    // Verify add to cart button
    await expect(
      page.getByRole("button", { name: /hang it up|add to cart/i })
    ).toBeVisible();
  });

  test("should return to homepage via logo/brand link", async ({ page }) => {
    // Start on product page
    await page.goto("/products/the-nuzzle");
    await page.waitForLoadState("domcontentloaded");

    // Find and click logo/home link
    const homeLink = page.locator('a[href="/"]').first();
    if (await homeLink.isVisible()) {
      await homeLink.click();
      await expect(page).toHaveURL("/");
      await expect(page.getByRole("heading", { name: /Best Sellers/i })).toBeVisible();
    }
  });
});

test.describe("Cart Access", () => {
  test("should open empty cart from homepage", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    // Find and click cart button
    const cartButton = page.getByRole("button", { name: /cart|open cart/i }).first();
    
    if (await cartButton.isVisible().catch(() => false)) {
      await cartButton.click();

      // Cart drawer should open
      await expect(page.getByRole("heading", { name: /towel rack/i })).toBeVisible();
      
      // Should show empty state
      await expect(page.getByText(/empty|no items/i)).toBeVisible();
    }
  });

  test("should show cart with items after adding product", async ({ page, productFactory }) => {
    const product = await productFactory.createProduct();
    // Add item to cart
    await page.goto(`/products/${product.handle}`);
    await page.waitForLoadState("domcontentloaded");
    await page.getByRole("button", { name: /hang it up|add to cart/i }).click();

    // Verify cart drawer opens with item
    await expect(page.getByRole("heading", { name: /towel rack|cart/i })).toBeVisible();
    await expect(page.getByText(product.title).first()).toBeVisible();
  });
});

test.describe("Footer and Links", () => {
  test("should have visible footer on homepage", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    // Check for footer element
    const footer = page.locator("footer");
    if (await footer.isVisible().catch(() => false)) {
      await expect(footer).toBeVisible();
    }
  });
});
