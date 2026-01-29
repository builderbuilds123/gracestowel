import { test, expect } from "../support/fixtures";

/**
 * Checkout Flow (Critical)
 * Covers: product -> add to cart -> checkout page.
 */
test.describe("Checkout Flow", () => {
  test("guest can add to cart and reach checkout", async ({ page, productFactory }) => {
    const product = await productFactory.createProduct();
    test.skip(product.id === "mock-product-id", "Backend not available - skipping checkout flow");

    await page.goto(`/products/${product.handle}`);
    await page.waitForLoadState("domcontentloaded");

    await expect(page.locator("h1").filter({ hasText: product.title })).toBeVisible({ timeout: 30000 });

    const addToCartButton = page.getByRole("button", { name: /hang it up|add to cart/i }).first();
    await addToCartButton.scrollIntoViewIfNeeded();
    await addToCartButton.evaluate((el: HTMLElement) => el.click());

    await expect(page.getByText(product.title).first()).toBeVisible({ timeout: 30000 });

    const checkoutLink = page.getByRole("link", { name: /checkout|proceed/i });
    await expect(checkoutLink).toBeVisible({ timeout: 30000 });
    await checkoutLink.evaluate((el: HTMLElement) => el.click());

    await expect(page).toHaveURL(/\/checkout/);
    await expect(page.locator("body")).toContainText(/checkout|order/i, { timeout: 30000 });
  });
});
