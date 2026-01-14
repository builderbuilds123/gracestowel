import { test, expect } from "@playwright/test";

/**
 * Promotions E2E Tests (Mocked)
 * Validates promo code application, removal, and error handling in checkout
 * Uses network mocking to run without a live backend
 */
test.describe("Promotions Flow", () => {
  const MOCK_PRODUCT = {
    id: "prod_1",
    title: "Test Towel",
    handle: "test-towel",
    variants: [{ id: "variant_1", prices: [{ amount: 5000, currency_code: "usd" }] }],
    thumbnail: "test.jpg"
  };

  const MOCK_CART = {
    id: "cart_1",
    region_id: "reg_1",
    currency_code: "usd",
    items: [
      {
        id: "item_1",
        title: "Test Towel",
        quantity: 1,
        unit_price: 5000,
        subtotal: 5000,
        total: 5000,
        variant: { id: "variant_1", product: MOCK_PRODUCT }
      }
    ],
    shipping_methods: [],
    subtotal: 5000,
    total: 5000,
    discount_total: 0,
    promotions: [] as any[]
  };

  test.beforeEach(async ({ page }) => {
    // Mock Product Page API
    await page.route(`**/store/products?*`, async route => {
      await route.fulfill({ json: { products: [MOCK_PRODUCT], count: 1 } });
    });
    
    await page.route(`**/store/products/${MOCK_PRODUCT.handle}*`, async route => {
      await route.fulfill({ json: { products: [MOCK_PRODUCT] } });
    });

    // Mock Cart APIs
    await page.route("**/store/carts", async route => {
      if (route.request().method() === "POST") {
        await route.fulfill({ json: { cart: MOCK_CART } });
      } else {
        await route.continue();
      }
    });

    await page.route(`**/store/carts/${MOCK_CART.id}`, async route => {
      await route.fulfill({ json: { cart: MOCK_CART } });
    });

    await page.route(`**/store/carts/${MOCK_CART.id}/line-items`, async route => {
       await route.fulfill({ json: { cart: MOCK_CART } });
    });
  });

  test("should apply a valid promo code and see discount", async ({ page }) => {
    // 1. Setup: Navigate and Add to Cart
    await page.goto(`/products/${MOCK_PRODUCT.handle}`);
    
    // Mock user adding to cart (frontend update)
    const addToCartButton = page.getByRole("button", { name: /hang it up|add to cart/i }).first();
    await addToCartButton.click({ force: true });
    await expect(page.getByText(MOCK_PRODUCT.title).first()).toBeVisible();
    
    // 2. Go to checkout
    // Mock valid promo response
    await page.route(`**/store/carts/${MOCK_CART.id}`, async route => {
      if (route.request().method() === "POST" && route.request().url().includes("promotions")) {
         // Return cart with promo applied
         const promoCart = {
           ...MOCK_CART,
           promotions: [{ id: "promo_1", code: "TEST10", application_method: { type: "percentage", value: 10 } }],
           discount_total: 500,
           total: 4500,
           items: [{
             ...MOCK_CART.items[0],
             adjustments: [{ code: "TEST10", amount: 500 }]
           }]
         };
         await route.fulfill({ json: { cart: promoCart } });
      } else if (route.request().method() === "GET") {
          // If accessing checkout, return base cart
          await route.fulfill({ json: { cart: MOCK_CART } });
      } else {
          await route.continue();
      }
    });

    await page.goto("/checkout");
    
    // 3. Find and fill promo input
    const promoInput = page.getByPlaceholder("Enter promo code");
    await promoInput.fill("TEST10");
    await page.getByRole("button", { name: "Apply" }).click();
    
    // 4. Verify success state
    await expect(page.getByText("Promo code applied!")).toBeVisible();
    await expect(page.getByText("TEST10")).toBeVisible();
    
    // 5. Verify discount in summary (-$5.00)
    await expect(page.getByText("-$5.00")).toBeVisible();
  });

  test("should handle invalid promo codes", async ({ page }) => {
    await page.goto(`/products/${MOCK_PRODUCT.handle}`);
    await page.getByRole("button", { name: /hang it up|add to cart/i }).first().click({ force: true });
    
    // Mock invalid promo response
    await page.route(`**/store/carts/${MOCK_CART.id}/promotions`, async route => {
      await route.fulfill({ 
        status: 400, 
        json: { type: "invalid_data", message: "Invalid or expired promo code" } 
      });
    });

    await page.goto("/checkout");
    
    const promoInput = page.getByPlaceholder("Enter promo code");
    await promoInput.fill("INVALID");
    await page.getByRole("button", { name: "Apply" }).click();
    
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.getByText("Invalid or expired promo code")).toBeVisible();
  });
  test("should remove applied promo code", async ({ page }) => {
    // 1. Setup: Add to cart
    await page.goto(`/products/${MOCK_PRODUCT.handle}`);
    const addToCartButton = page.getByRole("button", { name: /hang it up|add to cart/i }).first();
    await addToCartButton.click({ force: true });
    
    // Mock applied promo response
    await page.route(`**/store/carts/${MOCK_CART.id}`, async route => {
      if (route.request().method() === "POST" && route.request().url().includes("promotions")) {
         // Apply response
         const promoCart = {
           ...MOCK_CART,
           promotions: [{ id: "promo_1", code: "TEST10", application_method: { type: "percentage", value: 10 } }],
           discount_total: 500,
           total: 4500,
           items: [{
             ...MOCK_CART.items[0],
             adjustments: [{ code: "TEST10", amount: 500 }]
           }]
         };
         await route.fulfill({ json: { cart: promoCart } });
      } else if (route.request().method() === "DELETE" && route.request().url().includes("promotions")) {
          // Remove response (return base cart)
          await route.fulfill({ json: { cart: MOCK_CART } });
      } else if (route.request().method() === "GET") {
          // Allow get to return base cart initially
          const url = route.request().url();
          // Ideally we state-manage this in the test but for simplicity return base map
          await route.fulfill({ json: { cart: MOCK_CART } });
      } else {
          await route.continue();
      }
    });

    await page.goto("/checkout");
    
    const promoInput = page.getByPlaceholder("Enter promo code");
    await promoInput.fill("TEST10");
    await page.getByRole("button", { name: "Apply" }).click();
    
    // Verify applied (mocked response ensures it looks applied for a moment if we didn't implement sophisticated state mock)
    // Actually, since we return MOCK_CART on GET, the refresh might clear it if we are not careful.
    // But `PromoCodeInput` uses local state from the apply response until refresh.
    // Let's ensure the initial APPLY returns the promo cart.
    // And verify the "Remove" button appears.
    
    // We need to verify the UI reflects the applied code
    // The component might refetch cart, so GET should also return promoCart if applied.
    // Let's refine the mock to handle simple state.
    
    // Use a variable to track state for this test
    // Playwright route handlers are closure-scoped.
    let currentCart = { ...MOCK_CART };
    await page.unroute(`**/store/carts/${MOCK_CART.id}`); // Clear previous generic route
    await page.route(`**/store/carts/${MOCK_CART.id}`, async route => {
       if (route.request().method() === "POST" && route.request().url().includes("promotions")) {
           const promoCart = {
             ...MOCK_CART,
             promotions: [{ id: "promo_1", code: "TEST10", application_method: { type: "percentage", value: 10 } }],
             discount_total: 500,
             total: 4500,
             items: [{ ...MOCK_CART.items[0], adjustments: [{ code: "TEST10", amount: 500 }] }]
           };
           currentCart = promoCart;
           await route.fulfill({ json: { cart: currentCart } });
       } else if (route.request().method() === "DELETE") {
           currentCart = { ...MOCK_CART };
           await route.fulfill({ json: { cart: currentCart } });
       } else {
           await route.fulfill({ json: { cart: currentCart } });
       }
    });

    // Re-apply code to trigger the new mock state
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
