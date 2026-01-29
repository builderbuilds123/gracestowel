import { test, expect } from "../../support/fixtures";

/**
 * Promotions E2E Tests (Deterministic)
 * Validates promo code application and removal in checkout using seeded data factories.
 */
test.describe("Promotions Flow", () => {
  test("should apply a valid promo code and see it applied", async ({ page, productFactory, discountFactory }) => {
    const product = await productFactory.createProduct();
    test.skip(product.id === "mock-product-id", "Backend not available - skipping promo test");

    const promoCode = `TEST${Date.now()}`.toUpperCase();
    const promo = await discountFactory.createDiscount({
      code: promoCode,
      application_method: {
        type: "percentage",
        target_type: "order",
        value: 10,
        allocation: "across",
      },
    });
    test.skip(!promo.id, "Promotion API unavailable - skipping promo test");

    await page.goto(`/products/${product.handle}`);

    const addToCartButton = page.getByRole("button", { name: /hang it up|add to cart/i }).first();
    await expect(addToCartButton).toBeVisible();
    await addToCartButton.evaluate((node: HTMLElement) => node.click());

    await expect(page.getByTestId("nav-cart-count")).not.toHaveText("0", { timeout: 15000 });
    await page.waitForTimeout(500);

    await page.goto("/checkout");
    await page.waitForLoadState("domcontentloaded");

    const promoInput = page.getByTestId("promo-code-input");
    await expect(promoInput).toBeVisible({ timeout: 15000 });
    await promoInput.fill(promoCode);
    await page.getByTestId("apply-promo-button").click();

    await expect(page.getByTestId(`applied-promo-${promoCode}`)).toBeVisible({ timeout: 15000 });
  });

  test("should remove an applied promo code", async ({ page, productFactory, discountFactory }) => {
    const product = await productFactory.createProduct();
    test.skip(product.id === "mock-product-id", "Backend not available - skipping promo removal test");

    const promoCode = `TEST${Date.now()}`.toUpperCase();
    const promo = await discountFactory.createDiscount({
      code: promoCode,
      application_method: {
        type: "percentage",
        target_type: "order",
        value: 10,
        allocation: "across",
      },
    });
    test.skip(!promo.id, "Promotion API unavailable - skipping promo removal test");

    await page.goto(`/products/${product.handle}`);
    const addToCartButton = page.getByRole("button", { name: /hang it up|add to cart/i }).first();
    await addToCartButton.evaluate((node: HTMLElement) => node.click());
    await expect(page.getByTestId("nav-cart-count")).not.toHaveText("0", { timeout: 15000 });
    await page.waitForTimeout(500);

    await page.goto("/checkout");
    await page.waitForLoadState("domcontentloaded");

    const promoInput = page.getByTestId("promo-code-input");
    await expect(promoInput).toBeVisible({ timeout: 15000 });
    await promoInput.fill(promoCode);
    await page.getByTestId("apply-promo-button").click();
    await expect(page.getByTestId(`applied-promo-${promoCode}`)).toBeVisible({ timeout: 15000 });

    await page.getByTestId(`remove-promo-${promoCode}`).click();
    await expect(page.getByTestId(`applied-promo-${promoCode}`)).not.toBeVisible();
  });
});
