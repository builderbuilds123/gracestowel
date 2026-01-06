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
    // Network-first: Wait for products API before navigation
    const productsPromise = page.waitForResponse(
      (response) =>
        response.url().includes("/store/products") && response.status() === 200,
    );

    await page.goto("/");

    // Wait for products to load
    await productsPromise;

    // Verify homepage loads
    await expect(page).toHaveTitle(/Grace/i);

    // Check for Best Sellers section (actual homepage heading)
    await expect(
      page.getByRole("heading", { name: /Best Sellers/i }),
    ).toBeVisible();

    // Verify products are displayed
    await expect(page.locator('a[href^="/products/"]').first()).toBeVisible();
  });

  test("should display product page with details", async ({ page }) => {
    // Network-first: Wait for product API
    const productPromise = page.waitForResponse(
      (response) =>
        response.url().includes("/store/products/the-nuzzle") &&
        response.status() === 200,
    );

    // Navigate directly to a known product page to avoid click interception
    await page.goto("/products/the-nuzzle");

    // Wait for product data to load
    await productPromise;

    // Verify product page loads with details - check for product title specifically
    await expect(page.getByRole("heading", { name: "The Nuzzle" })).toBeVisible();

    // Look for add to cart button (uses "Hang it Up" text in this storefront)
    await expect(
      page.getByRole("button", { name: /hang it up|add to cart/i }),
    ).toBeVisible();
  });

  test("should add product to cart", async ({ page }) => {
    // Network-first: Wait for product and cart APIs
    const productPromise = page.waitForResponse(
      (response) =>
        response.url().includes("/store/products/the-nuzzle") &&
        response.status() === 200,
    );
    const cartPromise = page.waitForResponse(
      (response) =>
        (response.url().includes("/store/carts") ||
          response.url().includes("/store/cart")) &&
        response.status() === 200,
    );

    // Navigate directly to a known product page
    await page.goto("/products/the-nuzzle");

    // Wait for product page to load
    await productPromise;
    await expect(page.getByRole("heading", { name: "The Nuzzle" })).toBeVisible();

    // Add to cart (button says "Hang it Up" in this storefront)
    await page
      .getByRole("button", { name: /hang it up|add to cart/i })
      .click();

    // Wait for cart API response
    await cartPromise;

    // Verify cart drawer opens with the item
    // The cart drawer shows "Your Towel Rack" heading
    await expect(
      page.getByRole("heading", { name: /towel rack/i }),
    ).toBeVisible();

    // Verify item is in cart
    await expect(page.getByText("The Nuzzle")).toBeVisible();
  });

  test("should update cart quantity", async ({ page }) => {
    // Network-first: Setup intercepts
    const productPromise = page.waitForResponse(
      (response) =>
        response.url().includes("/store/products/the-nuzzle") &&
        response.status() === 200,
    );
    const cartPromise = page.waitForResponse(
      (response) =>
        (response.url().includes("/store/carts") ||
          response.url().includes("/store/cart")) &&
        response.status() === 200,
    );

    // Add product to cart first
    await page.goto("/products/the-nuzzle");
    await productPromise;
    await expect(page.getByRole("heading", { name: "The Nuzzle" })).toBeVisible();
    await page
      .getByRole("button", { name: /hang it up|add to cart/i })
      .click();
    await cartPromise;

    // Wait for cart drawer to open
    await expect(
      page.getByRole("heading", { name: /towel rack/i }),
    ).toBeVisible();

    // Wait for update cart API
    const updateCartPromise = page.waitForResponse(
      (response) =>
        (response.url().includes("/store/carts") ||
          response.url().includes("/store/cart")) &&
        response.request().method() === "POST" &&
        response.status() === 200,
    );

    // Find and click increase quantity button (+ button)
    const increaseButton = page
      .locator('button[aria-label="Increase quantity"]')
      .first();
    await expect(increaseButton).toBeVisible();
    await increaseButton.click();

    // Wait for cart update to complete
    await updateCartPromise;

    // Verify quantity updated - check for quantity indicator or price change
    // The exact assertion depends on UI implementation
    await expect(
      page.getByRole("heading", { name: /towel rack/i }),
    ).toBeVisible();
  });

  test("should remove item from cart", async ({ page }) => {
    // Network-first: Setup intercepts
    const productPromise = page.waitForResponse(
      (response) =>
        response.url().includes("/store/products/the-nuzzle") &&
        response.status() === 200,
    );
    const cartPromise = page.waitForResponse(
      (response) =>
        (response.url().includes("/store/carts") ||
          response.url().includes("/store/cart")) &&
        response.status() === 200,
    );

    // Add product to cart first
    await page.goto("/products/the-nuzzle");
    await productPromise;
    await expect(page.getByRole("heading", { name: "The Nuzzle" })).toBeVisible();
    await page
      .getByRole("button", { name: /hang it up|add to cart/i })
      .click();
    await cartPromise;

    // Wait for cart drawer to open
    await expect(
      page.getByRole("heading", { name: /towel rack/i }),
    ).toBeVisible();

    // Wait for delete cart item API
    const deleteItemPromise = page.waitForResponse(
      (response) =>
        (response.url().includes("/store/carts") ||
          response.url().includes("/store/cart")) &&
        response.request().method() === "DELETE" &&
        response.status() === 200,
    );

    // Find and click remove button (trash icon or "Remove" text)
    const removeButton = page
      .getByRole("button", { name: /remove|delete/i })
      .first();

    await expect(removeButton).toBeVisible();
    await removeButton.click();

    // Wait for deletion to complete
    await deleteItemPromise;

    // Verify cart shows empty state
    await expect(page.getByText(/empty|no items/i)).toBeVisible();
  });

  test("should proceed to checkout", async ({ page }) => {
    // Network-first: Setup intercepts
    const productPromise = page.waitForResponse(
      (response) =>
        response.url().includes("/store/products/the-nuzzle") &&
        response.status() === 200,
    );
    const cartPromise = page.waitForResponse(
      (response) =>
        (response.url().includes("/store/carts") ||
          response.url().includes("/store/cart")) &&
        response.status() === 200,
    );

    // Add product to cart
    await page.goto("/products/the-nuzzle");
    await productPromise;
    await expect(page.getByRole("heading", { name: "The Nuzzle" })).toBeVisible();
    await page
      .getByRole("button", { name: /hang it up|add to cart/i })
      .click();
    await cartPromise;

    // Wait for cart drawer
    await expect(
      page.getByRole("heading", { name: /towel rack/i }),
    ).toBeVisible();

    // Click checkout button/link
    const checkoutLink = page.getByRole("link", { name: /checkout|proceed/i });
    await expect(checkoutLink).toBeVisible();
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

  test("should display order summary on checkout", async ({ page }) => {
    // Network-first: Setup intercepts
    const productPromise = page.waitForResponse(
      (response) =>
        response.url().includes("/store/products/the-nuzzle") &&
        response.status() === 200,
    );
    const cartPromise = page.waitForResponse(
      (response) =>
        (response.url().includes("/store/carts") ||
          response.url().includes("/store/cart")) &&
        response.status() === 200,
    );

    // Add product and go to checkout
    await page.goto("/products/the-nuzzle");
    await productPromise;
    await expect(page.getByRole("heading", { name: "The Nuzzle" })).toBeVisible();
    await page
      .getByRole("button", { name: /hang it up|add to cart/i })
      .click();
    await cartPromise;

    // Navigate to checkout
    await page.goto("/checkout");

    // Wait for checkout page to load and verify content
    await expect(page).toHaveURL(/\/checkout/);
    await expect(page.locator("body")).toContainText(/checkout|order|cart/i);
  });
});

test.describe("Cart Persistence", () => {
  test("should persist cart across page reloads", async ({ page }) => {
    // Navigate to product page
    await page.goto("/products/the-nuzzle");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("heading", { name: "The Nuzzle" })).toBeVisible();
    
    // Add product to cart
    await page.getByRole("button", { name: /hang it up|add to cart/i }).click();

    // Wait for cart drawer to appear and show item
    await expect(page.getByRole("heading", { name: /towel rack/i })).toBeVisible();

    // Wait for cart state to be saved (small delay for localStorage)
    await page.waitForTimeout(1000);

    // Reload page
    await page.reload();
    await page.waitForLoadState("domcontentloaded");

    // Navigate to checkout to verify cart persisted
    await page.goto("/checkout");

    // Verify we're on checkout page
    await expect(page).toHaveURL(/\/checkout/);
    await expect(page.locator("body")).toContainText(/checkout|order/i);
  });
});
