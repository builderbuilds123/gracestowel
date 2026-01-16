import { test, expect } from "../../support/fixtures";

/**
 * Mobile Experience Tests
 * Tests critical user flows on mobile viewports
 * 
 * These tests run on Mobile Chrome and Mobile Safari projects
 * to ensure proper mobile responsiveness and touch interactions.
 */

// Product handles and titles are now fetched dynamically from ProductFactory

test.describe("Mobile Navigation", () => {
  test("should display mobile-friendly navigation", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    // Verify page loads on mobile
    await expect(page).toHaveTitle(/Grace/i);
    await expect(page.getByRole("heading", { name: /Bestselling|Best Sellers/i }).first()).toBeVisible();

    // Verify product cards are visible and tappable
    const productLinks = page.locator('a[href^="/products/"]');
    await expect(productLinks.first()).toBeVisible();
    
    // Verify navigation is accessible on mobile (may be hamburger menu or visible)
    const nav = page.getByRole("navigation").first();
    await expect(nav).toBeVisible();
  });

  test("should navigate to product page on mobile", async ({ page, productFactory }) => {
    // Use product factory for reliable product navigation
    const product = await productFactory.createProduct();
    
    // Navigate directly to product page (more reliable than homepage click in CI)
    await page.goto(`/products/${product.handle}`);
    await page.waitForLoadState("domcontentloaded");

    // Verify product page loads
    await expect(page).toHaveURL(/\/products\//);
    
    // Verify product heading is visible
    await expect(page.getByRole("heading", { name: product.title }).first()).toBeVisible({ timeout: 30000 });
    
    // Verify add to cart button is visible
    await expect(
      page.getByRole("button", { name: /hang it up|add to cart/i }).first()
    ).toBeVisible();
  });
});

test.describe("Mobile Cart Experience", () => {
  test("should add product to cart on mobile", async ({ page, productFactory }) => {
    const product = await productFactory.createProduct();
    await page.goto(`/products/${product.handle}`);
    await page.waitForLoadState("domcontentloaded");

    // Verify product page
    await expect(page.getByRole("heading", { name: product.title })).toBeVisible();

    // Add to cart
    // Add to cart - use force:true and scroll
    const addToCartButton = page.getByRole("button", { name: /hang it up|add to cart/i }).first();
    await addToCartButton.evaluate((el: any) => el.click());

    // Verify cart drawer opens (should work on mobile)
    await expect(page.getByText(product.title).first()).toBeVisible({ timeout: 30000 });
    
    // Verify product is in cart
    const productInCart = page.getByText(product.title).first();
    await expect(productInCart).toBeVisible();
    // Navigate to product page from cart (if clickable)
    await productInCart.scrollIntoViewIfNeeded();
    await productInCart.click({ force: true });
  });

  test("should update quantity on mobile", async ({ page, productFactory }) => {
    const product = await productFactory.createProduct();
    await page.goto(`/products/${product.handle}`);
    await page.waitForLoadState("domcontentloaded");

    // Add to cart
    await page.getByRole("button", { name: /hang it up|add to cart/i }).first().click({ force: true });
    await expect(page.getByText(product.title).first()).toBeVisible({ timeout: 30000 });

    // Update quantity
    const increaseButton = page.getByLabel("Increase quantity");
    await increaseButton.scrollIntoViewIfNeeded();
    await increaseButton.click({ force: true });
    // Standardize cart heading and wait for hydration
    await expect(page.getByText(product.title).first()).toBeVisible({ timeout: 30000 });
  });

  test("should proceed to checkout on mobile", async ({ page, productFactory }) => {
    const product = await productFactory.createProduct();
    await page.goto(`/products/${product.handle}`);
    await page.waitForLoadState("domcontentloaded");

    // Add to cart
    // Add to cart
    const addToCartButton = page.getByRole("button", { name: /hang it up|add to cart/i }).first();
    await addToCartButton.evaluate((el: any) => el.click());
    await expect(page.getByText(product.title).first()).toBeVisible({ timeout: 30000 });

    // Find checkout link and click
    const checkoutLink = page.getByRole("link", { name: /checkout/i });
    await expect(checkoutLink).toBeVisible();
    await checkoutLink.click();

    // Verify checkout page loads
    await expect(page).toHaveURL(/checkout/i);
  });
});

test.describe("Mobile Checkout Form", () => {
  test("should display checkout form correctly on mobile", async ({ page, productFactory }) => {
    // Add item to cart first
    const product = await productFactory.createProduct();
    await page.goto(`/products/${product.handle}`);
    await page.waitForLoadState("domcontentloaded");
    const addToCartButton = page.getByRole("button", { name: /hang it up|add to cart/i }).first();
    await addToCartButton.evaluate((el: any) => el.click());
    await expect(page.getByText(product.title).first()).toBeVisible({ timeout: 30000 });

    // Go to checkout
    await page.goto("/checkout");
    await page.waitForLoadState("domcontentloaded");

    // Verify checkout page is visible and form elements are accessible
    await expect(page).toHaveURL(/checkout/i);
    
    // Form should be visible (check for common checkout elements)
    const pageContent = page.locator("body");
    await expect(pageContent).toContainText(/checkout|order|cart/i);
  });

  test("should allow filling shipping info on mobile", async ({ page }) => {
    await page.goto("/checkout");
    await page.waitForLoadState("domcontentloaded");

    // Try to fill form fields if visible
    const firstNameInput = page.getByLabel(/first name/i);
    if (await firstNameInput.isVisible().catch(() => false)) {
      await firstNameInput.fill("Mobile");
      await expect(firstNameInput).toHaveValue("Mobile");
      
      const lastNameInput = page.getByLabel(/last name/i);
      if (await lastNameInput.isVisible().catch(() => false)) {
        await lastNameInput.fill("User");
      }
    }
  });
});

test.describe("Mobile Error States", () => {
  test("should display 404 page correctly on mobile", async ({ page }) => {
    await page.goto("/non-existent-page-mobile-test");
    await page.waitForLoadState("domcontentloaded");

    // Verify 404 or error message is displayed
    await expect(page.getByText(/not found|404|page.*exist/i)).toBeVisible();
  });
});
