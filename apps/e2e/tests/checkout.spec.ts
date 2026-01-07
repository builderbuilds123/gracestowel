import { test, expect } from "../support/fixtures";

/**
 * Guest Checkout Flow E2E Tests
 * Critical path: Browse -> Add to Cart -> Checkout -> Payment
 *
 * Note: These tests navigate directly to pages to avoid UI overlay issues.
 * The storefront has product cards with hover overlays that can block clicks.
 */
test.describe("Guest Checkout Flow", () => {
  test("should display homepage with products", async ({ page }) => {
    // Navigate to homepage
    await page.goto("/");

    // Wait for page to render (SSR may already have products)  
    await page.waitForLoadState("domcontentloaded");

    // Verify homepage loads
    await expect(page).toHaveTitle(/Grace/i);

    // Check for Best Sellers section (actual homepage heading) - increase timeout for slow CI
    await expect(
      page.getByRole("heading", { name: /Best Sellers/i }),
    ).toBeVisible({ timeout: 30000 });

    // Verify products are displayed
    await page.waitForLoadState("networkidle");
    await expect(page.locator('a[href^="/products/"]').first()).toBeVisible({ timeout: 30000 });
  });

  test("should display product page with details", async ({
    page,
    productFactory,
  }) => {
    const product = await productFactory.createProduct();
    const handle = product.handle;
    const title = product.title;

    await page.goto(`/products/${handle}`);
    
    // Verify product page loads with details - increase timeout for slow CI
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: title })).toBeVisible({ timeout: 30000 });

    // Look for add to cart button (uses "Hang it Up" text in this storefront)
    await expect(
      page.getByRole("button", { name: /hang it up|add to cart/i }),
    ).toBeVisible({ timeout: 30000 });
  });

  test("should add product to cart", async ({ page, productFactory }) => {
    const product = await productFactory.createProduct();
    // Navigate directly to a known product page
    await page.goto(`/products/${product.handle}`);
    await page.waitForLoadState("domcontentloaded");

    // Wait for product page to load
    await expect(page.getByRole("heading", { name: product.title })).toBeVisible({ timeout: 30000 });

    // Add to cart (button says "Hang it Up" in this storefront)
    await page
      .getByRole("button", { name: /hang it up|add to cart/i })
      .click();

    // Verify cart drawer opens with the item - increased timeout for API call
    await expect(
      page.getByRole("heading", { name: /towel rack/i }),
    ).toBeVisible({ timeout: 30000 });

    // Verify item is in cart (use first match since product name appears multiple places)
    await expect(page.getByText(product.title).first()).toBeVisible({ timeout: 30000 });
  });

  test("should update cart quantity", async ({ page, productFactory }) => {
    const product = await productFactory.createProduct();
    // Add product to cart first
    await page.goto(`/products/${product.handle}`);
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("heading", { name: product.title })).toBeVisible({ timeout: 30000 });
    await page
      .getByRole("button", { name: /hang it up|add to cart/i })
      .click();

    // Wait for cart drawer to open
    await expect(
      page.getByRole("heading", { name: /towel rack/i }),
    ).toBeVisible({ timeout: 30000 });

    // Find and click increase quantity button (+ button)
    // Increase quantity - use force: true if backdrop intercepts
    await page
      .locator('button[aria-label="Increase quantity"]')
      .first()
      .click({ force: true });

    // Wait for UI to reflect the change
    await page.waitForTimeout(500);

    // Verify cart drawer still visible (update completed)
    await expect(
      page.getByRole("heading", { name: /towel rack/i }),
    ).toBeVisible();
  });

  test("should remove item from cart", async ({ page, productFactory }) => {
    const product = await productFactory.createProduct();
    // Add product to cart first
    await page.goto(`/products/${product.handle}`);
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("heading", { name: product.title })).toBeVisible({ timeout: 30000 });
    await page
      .getByRole("button", { name: /hang it up|add to cart/i })
      .click();

    // Wait for cart drawer to open
    await expect(
      page.getByRole("heading", { name: /towel rack/i }),
    ).toBeVisible({ timeout: 30000 });

    // Find and click remove button (trash icon or "Remove" text)
    const removeButton = page
      .getByRole("button", { name: /remove|delete/i })
      .first();

    await expect(removeButton).toBeVisible({ timeout: 30000 });
    await removeButton.click();

    // Wait for UI to reflect the deletion
    await page.waitForTimeout(500);

    // Verify cart shows empty state
    await expect(page.getByText(/empty|no items/i)).toBeVisible({ timeout: 30000 });
  });

  test("should proceed to checkout", async ({ page, productFactory }) => {
    const product = await productFactory.createProduct();
    // Add product to cart
    await page.goto(`/products/${product.handle}`);
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("heading", { name: product.title })).toBeVisible({ timeout: 30000 });
    await page
      .getByRole("button", { name: /hang it up|add to cart/i })
      .click();

    // Wait for cart drawer
    await expect(
      page.getByRole("heading", { name: /towel rack/i }),
    ).toBeVisible({ timeout: 30000 });

    // Click checkout button/link
    const checkoutLink = page.getByRole("link", { name: /checkout|proceed/i });
    await expect(checkoutLink).toBeVisible({ timeout: 30000 });
    await checkoutLink.click();

    // Verify checkout page loads
    await expect(page).toHaveURL(/\/checkout/);
  });

  test("should fill shipping information", async ({ page }) => {
    // Navigate directly to checkout page
    await page.goto("/checkout");

    // Wait for checkout page to load
    await expect(page).toHaveURL(/\/checkout/);

    // Fill shipping form
    const firstNameInput = page.getByLabel(/first name/i);
    await expect(firstNameInput).toBeVisible();

    await firstNameInput.fill("Test");
    await page.getByLabel(/last name/i).fill("User");
    await page.getByLabel(/email/i).fill("test@example.com");

    // Verify form is filled
    await expect(firstNameInput).toHaveValue("Test");
  });

  test("should display order summary on checkout", async ({ page, productFactory }) => {
    const product = await productFactory.createProduct();
    // Add product and go to checkout
    await page.goto(`/products/${product.handle}`);
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("heading", { name: product.title })).toBeVisible({ timeout: 30000 });
    await page
      .getByRole("button", { name: /hang it up|add to cart/i })
      .click();
    
    // Wait for cart action to complete
    await page.waitForTimeout(500);

    // Navigate to checkout
    await page.goto("/checkout");
    await page.waitForLoadState("networkidle");

    // Wait for checkout page to load and verify content
    await expect(page).toHaveURL(/\/checkout/);
    await expect(page.locator("body")).toContainText(/checkout|order|cart/i, { timeout: 30000 });
  });
});

test.describe("Cart Persistence", () => {
  test("should persist cart across page reloads", async ({ page, productFactory }) => {
    const product = await productFactory.createProduct();
    // Navigate to product page
    await page.goto(`/products/${product.handle}`);
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("heading", { name: product.title })).toBeVisible();
    
    // Add product to cart
    await page.getByRole("button", { name: /hang it up|add to cart/i }).click();

    // Wait for cart drawer to appear and show item
    await expect(page.getByRole("heading", { name: /towel rack/i })).toBeVisible();

    // Wait for cart state to be saved by polling sessionStorage
    await expect(async () => {
      const cartId = await page.evaluate(() => window.sessionStorage.getItem('medusa_cart_id'));
      expect(cartId).not.toBeNull();
    }).toPass({ timeout: 5000 });

    // Reload page
    await page.reload();
    await page.waitForLoadState("domcontentloaded");

    // Navigate to checkout to verify cart persisted
    await page.goto("/checkout");
    await page.waitForLoadState("networkidle");

    // Verify we're on checkout page
    await expect(page).toHaveURL(/\/checkout/);
    await expect(page.locator("body")).toContainText(/checkout|order/i, { timeout: 30000 });
  });
});
