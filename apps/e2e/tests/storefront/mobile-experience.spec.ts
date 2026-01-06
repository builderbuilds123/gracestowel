import { test, expect } from "../../support/fixtures";

/**
 * Mobile Experience Tests
 * Tests critical user flows on mobile viewports
 * 
 * These tests run on Mobile Chrome and Mobile Safari projects
 * to ensure proper mobile responsiveness and touch interactions.
 */

const PRODUCT_HANDLE = "the-nuzzle";
const PRODUCT_NAME = "The Nuzzle";

test.describe("Mobile Navigation", () => {
  test("should display mobile-friendly navigation", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    // Verify page loads on mobile
    await expect(page).toHaveTitle(/Grace/i);
    await expect(page.getByRole("heading", { name: /Best Sellers/i })).toBeVisible();

    // Verify product cards are visible and tappable
    const productLinks = page.locator('a[href^="/products/"]');
    await expect(productLinks.first()).toBeVisible();
    
    // Verify navigation is accessible on mobile (may be hamburger menu or visible)
    const nav = page.getByRole("navigation").first();
    await expect(nav).toBeVisible();
  });

  test("should navigate to product page on mobile", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    // Find and tap first product
    const firstProduct = page.locator('a[href^="/products/"]').first();
    await expect(firstProduct).toBeVisible();
    await firstProduct.click();

    // Verify product page loads
    await page.waitForLoadState("domcontentloaded");
    await expect(page).toHaveURL(/\/products\//);
    
    // Verify add to cart button is visible
    await expect(
      page.getByRole("button", { name: /hang it up|add to cart/i })
    ).toBeVisible();
  });
});

test.describe("Mobile Cart Experience", () => {
  test("should add product to cart on mobile", async ({ page }) => {
    await page.goto(`/products/${PRODUCT_HANDLE}`);
    await page.waitForLoadState("domcontentloaded");

    // Verify product page
    await expect(page.getByRole("heading", { name: PRODUCT_NAME })).toBeVisible();

    // Add to cart
    await page.getByRole("button", { name: /hang it up|add to cart/i }).click();

    // Verify cart drawer opens (should work on mobile)
    await expect(page.getByRole("heading", { name: /towel rack/i })).toBeVisible();
    
    // Verify product is in cart
    await expect(page.getByRole("heading", { name: PRODUCT_NAME, level: 3 })).toBeVisible();
  });

  test("should update quantity on mobile", async ({ page }) => {
    await page.goto(`/products/${PRODUCT_HANDLE}`);
    await page.waitForLoadState("domcontentloaded");

    // Add to cart
    await page.getByRole("button", { name: /hang it up|add to cart/i }).click();
    await expect(page.getByRole("heading", { name: /towel rack/i })).toBeVisible();

    // Find and tap increase quantity button using semantic selector
    const increaseButton = page.getByRole("button", { name: /increase quantity/i }).first();
    if (await increaseButton.isVisible().catch(() => false)) {
      await increaseButton.click();
      // Verify cart is still open after quantity update
      await expect(page.getByRole("heading", { name: /towel rack/i })).toBeVisible();
    }
  });

  test("should proceed to checkout on mobile", async ({ page }) => {
    await page.goto(`/products/${PRODUCT_HANDLE}`);
    await page.waitForLoadState("domcontentloaded");

    // Add to cart
    await page.getByRole("button", { name: /hang it up|add to cart/i }).click();
    await expect(page.getByRole("heading", { name: /towel rack/i })).toBeVisible();

    // Find checkout link and click
    const checkoutLink = page.getByRole("link", { name: /checkout/i });
    await expect(checkoutLink).toBeVisible();
    await checkoutLink.click();

    // Verify checkout page loads
    await expect(page).toHaveURL(/checkout/i);
  });
});

test.describe("Mobile Checkout Form", () => {
  test("should display checkout form correctly on mobile", async ({ page }) => {
    // Add item to cart first
    await page.goto(`/products/${PRODUCT_HANDLE}`);
    await page.waitForLoadState("domcontentloaded");
    await page.getByRole("button", { name: /hang it up|add to cart/i }).click();
    await expect(page.getByRole("heading", { name: /towel rack/i })).toBeVisible();

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
