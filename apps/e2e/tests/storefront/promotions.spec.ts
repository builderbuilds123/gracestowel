import { test, expect } from "../../support/fixtures";

/**
 * Promotions E2E Tests
 * Validates promo code application, removal, and error handling in checkout
 * @see PROMO-1
 */
test.describe("Promotions Flow", () => {
  test("should apply a valid promo code and see discount", async ({ page, productFactory }) => {
    // 1. Setup: Add product to cart
    const product = await productFactory.createProduct();
    await page.goto(`/products/${product.handle}`);
    await page.waitForLoadState("domcontentloaded");
    
    const addToCartButton = page.getByRole("button", { name: /hang it up|add to cart/i }).first();
    await addToCartButton.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1000); // Hydration wait
    await addToCartButton.click({ force: true });
    
    // Wait for cart drawer
    await expect(page.getByText(product.title).first()).toBeVisible();
    
    // 2. Go to checkout
    await page.goto("/checkout");
    await page.waitForLoadState("networkidle");
    
    // 3. Find and fill promo input
    const promoInput = page.getByPlaceholder("Enter promo code");
    await expect(promoInput).toBeVisible();
    
    await promoInput.fill("TEST10");
    await page.getByRole("button", { name: "Apply" }).click();
    
    // 4. Verify success state
    // Note: This assumes TEST10 exists in the backend as per story requirements
    // If it fails, we might need to seed it or mock the response
    await expect(page.getByText("Promo code applied!")).toBeVisible();
    await expect(page.getByText("TEST10")).toBeVisible();
    
    // 5. Verify discount in summary
    // Look for negative amount
    await expect(page.locator(".text-green-600").filter({ hasText: "-" })).toBeVisible();
  });

  test("should handle invalid promo codes", async ({ page, productFactory }) => {
    // 1. Setup inventory
    const product = await productFactory.createProduct();
    await page.goto(`/products/${product.handle}`);
    await page.waitForLoadState("domcontentloaded");
    const addToCartButton = page.getByRole("button", { name: /hang it up|add to cart/i }).first();
    await addToCartButton.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1000);
    await addToCartButton.click({ force: true });
    
    await page.goto("/checkout");
    await page.waitForLoadState("networkidle");
    
    // 2. Try invalid code
    const promoInput = page.getByPlaceholder("Enter promo code");
    await promoInput.fill("INVALID_CODE_999");
    await page.getByRole("button", { name: "Apply" }).click();
    
    // 3. Verify error message
    // Check for "Invalid or expired" or general error text
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.getByText(/Invalid|expired|found/i)).toBeVisible();
    
    // 4. Input should remain (not cleared)
    await expect(promoInput).toHaveValue("INVALID_CODE_999");
  });

  test("should remove applied promo code", async ({ page, productFactory }) => {
    // 1. Setup with valid code
    const product = await productFactory.createProduct();
    await page.goto(`/products/${product.handle}`);
    const addToCartButton = page.getByRole("button", { name: /hang it up|add to cart/i }).first();
    await addToCartButton.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1000);
    await addToCartButton.click({ force: true });
    
    await page.goto("/checkout");
    await page.waitForLoadState("networkidle");
    
    const promoInput = page.getByPlaceholder("Enter promo code");
    await promoInput.fill("TEST10");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByText("TEST10")).toBeVisible();
    
    // 2. Remove code
    const removeButton = page.getByRole("button", { name: /Remove promo code TEST10/i });
    await removeButton.click();
    
    // 3. Verify removal
    await expect(page.getByText("Promo code removed")).toBeVisible();
    await expect(page.getByPlaceholder("Enter promo code")).toBeVisible();
    await expect(page.getByText("TEST10")).not.toBeVisible();
  });
});
