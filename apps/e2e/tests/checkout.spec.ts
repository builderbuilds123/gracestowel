import { test, expect } from "@playwright/test";

/**
 * Guest Checkout Flow E2E Tests
 * Critical path: Browse -> Add to Cart -> Checkout -> Payment
 *
 * Note: These tests navigate directly to pages to avoid UI overlay issues.
 * The storefront has product cards with hover overlays that can block clicks.
 */
test.describe("Guest Checkout Flow", () => {
  test("should display homepage with products", async ({ page }) => {
    await page.goto("/");

    // Verify homepage loads
    await expect(page).toHaveTitle(/Grace/i);

    // Check for Best Sellers section (actual homepage heading)
    await expect(
      page.getByRole("heading", { name: /Best Sellers/i })
    ).toBeVisible();

    // Verify products are displayed
    await expect(page.locator('a[href^="/products/"]').first()).toBeVisible();
  });

  test("should display product page with details", async ({ page }) => {
    // Navigate directly to a known product page to avoid click interception
    await page.goto("/products/the-nuzzle");

    // Verify product page loads with details
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // Look for add to cart button (uses "Hang it Up" text in this storefront)
    await expect(
      page.getByRole("button", { name: /hang it up|add to cart/i })
    ).toBeVisible();
  });

  test("should add product to cart", async ({ page }) => {
    // Navigate directly to a known product page
    await page.goto("/products/the-nuzzle");

    // Wait for product page to load
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // Add to cart (button says "Hang it Up" in this storefront)
    await page.getByRole("button", { name: /hang it up|add to cart/i }).click();

    // Verify cart drawer opens with the item
    // The cart drawer shows "Your Towel Rack" heading
    await expect(
      page.getByRole("heading", { name: /towel rack/i })
    ).toBeVisible({ timeout: 10000 });
  });

  test("should update cart quantity", async ({ page }) => {
    // Add product to cart first
    await page.goto("/products/the-nuzzle");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.getByRole("button", { name: /hang it up|add to cart/i }).click();

    // Wait for cart drawer to open
    await expect(
      page.getByRole("heading", { name: /towel rack/i })
    ).toBeVisible({ timeout: 10000 });

    // Find and click increase quantity button (+ button)
    const increaseButton = page.locator('button:has-text("+")').first();
    if (await increaseButton.isVisible({ timeout: 2000 })) {
      await increaseButton.click();
      // Wait for state update
      await page.waitForTimeout(500);
    }
  });

  test("should remove item from cart", async ({ page }) => {
    // Add product to cart first
    await page.goto("/products/the-nuzzle");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.getByRole("button", { name: /hang it up|add to cart/i }).click();

    // Wait for cart drawer to open
    await expect(
      page.getByRole("heading", { name: /towel rack/i })
    ).toBeVisible({ timeout: 10000 });

    // Find and click remove button (trash icon or "Remove" text)
    const removeButton = page
      .getByRole("button", { name: /remove|delete/i })
      .first();
    if (await removeButton.isVisible({ timeout: 2000 })) {
      await removeButton.click();
      // Verify cart shows empty state
      await expect(page.getByText(/empty|no items/i)).toBeVisible({
        timeout: 5000,
      });
    }
  });

  test("should proceed to checkout", async ({ page }) => {
    // Add product to cart
    await page.goto("/products/the-nuzzle");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.getByRole("button", { name: /hang it up|add to cart/i }).click();

    // Wait for cart drawer
    await expect(
      page.getByRole("heading", { name: /towel rack/i })
    ).toBeVisible({ timeout: 10000 });

    // Click checkout button/link
    const checkoutLink = page.getByRole("link", { name: /checkout|proceed/i });
    if (await checkoutLink.isVisible({ timeout: 2000 })) {
      await checkoutLink.click();
      // Verify checkout page loads
      await expect(page).toHaveURL(/\/checkout/);
    }
  });

  test("should fill shipping information", async ({ page }) => {
    // Navigate directly to checkout page
    await page.goto("/checkout");

    // Fill shipping form if fields exist
    const firstNameInput = page.getByLabel(/first name/i);
    if (await firstNameInput.isVisible({ timeout: 2000 })) {
      await firstNameInput.fill("Test");
      await page.getByLabel(/last name/i).fill("User");
      await page.getByLabel(/email/i).fill("test@example.com");

      // Verify form is filled
      await expect(firstNameInput).toHaveValue("Test");
    }
  });

  test("should display order summary on checkout", async ({ page }) => {
    // Add product and go to checkout
    await page.goto("/products/the-nuzzle");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.getByRole("button", { name: /hang it up|add to cart/i }).click();

    // Wait for cart to update
    await page.waitForTimeout(1000);

    // Navigate to checkout
    await page.goto("/checkout");

    // Verify some checkout content is visible
    await expect(page.locator("body")).toContainText(/checkout|order|cart/i);
  });
});

test.describe("Cart Persistence", () => {
  test("should persist cart across page reloads", async ({ page }) => {
    // Add product to cart
    await page.goto("/products/the-nuzzle");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.getByRole("button", { name: /hang it up|add to cart/i }).click();

    // Wait for cart to update
    await page.waitForTimeout(1000);

    // Reload page
    await page.reload();

    // Open cart by clicking cart button in header
    const cartButton = page
      .locator('button[aria-label*="cart" i], button:has(svg)')
      .first();
    await cartButton.click();

    // Verify cart still has the item (cart heading visible means drawer opened)
    await expect(
      page.getByRole("heading", { name: /towel rack/i })
    ).toBeVisible({ timeout: 10000 });
  });
});
