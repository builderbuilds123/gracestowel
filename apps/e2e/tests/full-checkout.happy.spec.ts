import { test, expect } from "../support/fixtures";

/**
 * Full Checkout Flow E2E Test
 * covers the complete happy path from product selection to payment and success.
 *
 * Note: This test uses existing seeded products (like "The Nuzzle")
 * since creating new products requires admin workflow.
 */
test.describe("Full Checkout Flow (Happy Path)", () => {
  test("should complete a guest checkout with successful payment", async ({
    page,
    productFactory,
  }) => {
    // 1. Setup: Get an existing seeded product
    const product = await productFactory.createProduct();

    await page.goto(`/products/${product.handle}`);
    await page.waitForLoadState("networkidle");

    // Remove PostHog survey popup from DOM if present (it blocks interactions)
    await page.evaluate(() => {
      const popups = document.querySelectorAll('[class*="PostHogSurvey"], [class*="posthog-survey"]');
      popups.forEach(popup => popup.remove());
    });

    // 2. Add to cart
    const addToCartButton = page
      .getByRole("button", { name: /hang it up|add to cart/i })
      .first();
    await addToCartButton.click({ force: true }); // Force click in case of any remaining overlays

    // Verify item in cart
    await expect(page.getByText(product.title).first()).toBeVisible({
      timeout: 15000,
    });

    // 3. Proceed to checkout
    const checkoutLink = page.getByRole("link", { name: /checkout/i });
    await checkoutLink.click();

    await expect(page).toHaveURL(/\/checkout/);

    // Wait for Stripe Elements to load (don't use networkidle - Stripe makes ongoing requests)
    // Use src-based selectors which are stable across Stripe SDK versions
    await page
      .locator('iframe[src*="js.stripe.com"]')
      .first()
      .waitFor({ state: "attached", timeout: 30000 });

    // 4. Fill guest email (Stripe LinkAuthenticationElement)
    // Use parent element ID from CheckoutForm.tsx (#link-authentication-element)
    const emailFrameSelector =
      '#link-authentication-element iframe[src*="js.stripe.com"]';
    await expect(page.locator(emailFrameSelector).first()).toBeVisible({
      timeout: 30000,
    });
    const emailIframe = page.frameLocator(emailFrameSelector).first();
    const emailInput = emailIframe.locator('input[name="email"]');
    await emailInput.fill(`tester-${Date.now()}@example.com`);

    // 5. Fill shipping address (Stripe AddressElement)
    // Use parent element ID from CheckoutForm.tsx (#address-element)
    const addressFrameSelector =
      '#address-element iframe[src*="js.stripe.com"]';
    await expect(page.locator(addressFrameSelector).first()).toBeVisible({
      timeout: 30000,
    });
    const addressIframe = page.frameLocator(addressFrameSelector).first();

    // Fill Name
    await addressIframe.locator('input[name="name"]').fill("Testy McTester");

    // Fill Address (Street)
    await addressIframe
      .locator('input[name="addressLine1"]')
      .fill("123 Test Street");

    // City
    await addressIframe.locator('input[name="city"]').fill("West Hollywood");

    // State/Province (dropdown usually)
    await addressIframe
      .locator('select[name="administrativeArea"]')
      .selectOption("CA");

    // Postal Code
    await addressIframe.locator('input[name="postalCode"]').fill("90069");

    // Phone (optional but good to test)
    await addressIframe.locator('input[name="phoneNumber"]').fill("555-0199");

    // 6. Select Shipping Method
    // We need to wait for the shipping rates to fetch after the address is filled (debounced)
    // The ShippingSection displays rates when they arrive.
    const shippingRadio = page.getByRole("radio").first();
    await expect(shippingRadio).toBeVisible({ timeout: 20000 });
    await shippingRadio.check();

    // 7. Verify Order Summary totals are updated
    await expect(page.locator("body")).toContainText("Order Summary");
    // Totals should be visible
    const finalTotal = page
      .locator("text=Total")
      .locator("xpath=following-sibling::*")
      .first();
    // We expect a total greater than 0
    await expect(async () => {
      const text = await finalTotal.innerText();
      const value = parseFloat(text.replace(/[^0-9.]/g, ""));
      expect(value).toBeGreaterThan(0);
    }).toPass();

    // 8. Payment (Stripe PaymentElement)
    // Payment element uses multiple iframes - target the card number input frame
    const paymentFrameSelector =
      'iframe[src*="js.stripe.com"][name*="__privateStripeFrame"]';
    await expect(page.locator(paymentFrameSelector).first()).toBeVisible({
      timeout: 30000,
    });
    const paymentIframe = page.frameLocator(paymentFrameSelector).first();

    // Stripe test cards are often automatically handled if configured,
    // but usually we need to enter them if it's the standard PaymentElement.
    // If it's a new Payment Element, it might show "Card" by default.
    const cardNumber = paymentIframe.locator('input[name="number"]');
    if (await cardNumber.isVisible({ timeout: 5000 })) {
      await cardNumber.fill("4242424242424242");
      await paymentIframe.locator('input[name="expiry"]').fill("12/26");
      await paymentIframe.locator('input[name="cvc"]').fill("123");
    }

    // 9. Submit Order
    const payButton = page.getByRole("button", { name: /Pay now/i });
    await expect(payButton).toBeEnabled({ timeout: 15000 });
    await payButton.click();

    // 10. Verification: Success Page
    // Stripe will redirect back to /checkout/success with params
    await expect(page).toHaveURL(/\/checkout\/success/, { timeout: 30000 });

    // Verify success message and order details
    await expect(page.getByRole("heading", { name: /Success/i })).toBeVisible();
    await expect(
      page.getByText(/Your order has been placed successfully/i),
    ).toBeVisible();

    // Check if the order number is displayed
    await expect(page.getByText(/Order #/i)).toBeVisible();
  });
});
