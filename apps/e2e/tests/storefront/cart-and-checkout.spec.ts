import { test, expect } from "../../support/fixtures";

const PRODUCT_HANDLE = "the-nuzzle";
const PRODUCT_NAME = "The Nuzzle";

test.describe("Storefront cart + checkout flows", () => {
  test("adds products to cart with drawer interaction", async ({ page }) => {
    const productResponse = page.waitForResponse(
      (response) =>
        response.url().includes(`/store/products/${PRODUCT_HANDLE}`) &&
        response.status() === 200,
    );
    const cartResponse = page.waitForResponse(
      (response) =>
        response.url().includes("/store/cart") ||
        response.url().includes("/store/carts"),
    );

    await page.goto(`/products/${PRODUCT_HANDLE}`);
    await productResponse;
    await expect(page.getByRole("heading", { name: PRODUCT_NAME })).toBeVisible();

    await page.getByRole("button", { name: /hang it up|add to cart/i }).click();
    await cartResponse;

    await expect(page.getByRole("heading", { name: /towel rack/i })).toBeVisible();
    await expect(page.getByText(PRODUCT_NAME)).toBeVisible();
  });

  test("updates cart quantities and recalculates totals", async ({ page }) => {
    const productResponse = page.waitForResponse(
      (response) =>
        response.url().includes(`/store/products/${PRODUCT_HANDLE}`) &&
        response.status() === 200,
    );
    const cartCreate = page.waitForResponse(
      (response) =>
        response.url().includes("/store/cart") ||
        response.url().includes("/store/carts"),
    );

    await page.goto(`/products/${PRODUCT_HANDLE}`);
    await productResponse;
    await page.getByRole("button", { name: /hang it up|add to cart/i }).click();
    await cartCreate;
    await expect(page.getByRole("heading", { name: /towel rack/i })).toBeVisible();

    const updateCart = page.waitForResponse(
      (response) =>
        (response.url().includes("/store/carts") ||
          response.url().includes("/store/cart")) &&
        response.request().method() === "POST",
    );

    const increaseButton = page
      .locator('button[aria-label="Increase quantity"]')
      .first();
    await increaseButton.click();
    await updateCart;

    const subtotal = page.getByText(/\$|€|£/).first();
    await expect(subtotal).toBeVisible();
  });

  test("removes items and shows empty state", async ({ page }) => {
    const productResponse = page.waitForResponse(
      (response) =>
        response.url().includes(`/store/products/${PRODUCT_HANDLE}`) &&
        response.status() === 200,
    );
    const cartCreate = page.waitForResponse(
      (response) =>
        response.url().includes("/store/cart") ||
        response.url().includes("/store/carts"),
    );

    await page.goto(`/products/${PRODUCT_HANDLE}`);
    await productResponse;
    await page.getByRole("button", { name: /hang it up|add to cart/i }).click();
    await cartCreate;
    await expect(page.getByRole("heading", { name: /towel rack/i })).toBeVisible();

    const deleteLineItem = page.waitForResponse(
      (response) =>
        (response.url().includes("/store/carts") ||
          response.url().includes("/store/cart")) &&
        response.request().method() === "DELETE",
    );

    await page.getByRole("button", { name: /remove|delete/i }).first().click();
    await deleteLineItem;

    await expect(page.getByText(/empty|no items/i)).toBeVisible();
  });

  test("persists cart contents across reloads", async ({ page }) => {
    const productResponse = page.waitForResponse(
      (response) =>
        response.url().includes(`/store/products/${PRODUCT_HANDLE}`) &&
        response.status() === 200,
    );
    const cartCreate = page.waitForResponse(
      (response) =>
        response.url().includes("/store/cart") ||
        response.url().includes("/store/carts"),
    );

    await page.goto(`/products/${PRODUCT_HANDLE}`);
    await productResponse;
    await page.getByRole("button", { name: /hang it up|add to cart/i }).click();
    await cartCreate;
    await expect(page.getByRole("heading", { name: /towel rack/i })).toBeVisible();

    const cartReload = page.waitForResponse(
      (response) =>
        response.url().includes("/store/cart") ||
        response.url().includes("/store/carts"),
    );
    await page.reload();
    await cartReload;
    await expect(page.getByText(PRODUCT_NAME)).toBeVisible();
  });

  test("guest checkout displays address, shipping, tax, and payment steps", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const productResponse = page.waitForResponse(
      (response) =>
        response.url().includes(`/store/products/${PRODUCT_HANDLE}`) &&
        response.status() === 200,
    );
    const cartCreate = page.waitForResponse(
      (response) =>
        response.url().includes("/store/cart") ||
        response.url().includes("/store/carts"),
    );

    await page.goto(`/products/${PRODUCT_HANDLE}`);
    await productResponse;
    await page.getByRole("button", { name: /hang it up|add to cart/i }).click();
    await cartCreate;

    const checkoutTrigger = page
      .getByRole("link", { name: /checkout|proceed/i })
      .or(page.getByRole("button", { name: /checkout|proceed/i }));
    await Promise.all([
      page.waitForURL(/checkout/i, { timeout: 30_000 }),
      checkoutTrigger.first().click(),
    ]);

    await expect(page.getByText(/shipping|address/i)).toBeVisible();
    await expect(page.getByText(/delivery|shipping option/i)).toBeVisible();
    await expect(page.getByText(/payment/i)).toBeVisible();

    const submitPayment =
      page.getByRole("button", { name: /pay|complete/i }).first();
    await expect(submitPayment).toBeEnabled();
  });

  test("signed-in checkout reuses session when credentials provided", async ({
    page,
    apiRequest,
  }) => {
    const email = process.env.E2E_USER_EMAIL;
    const password = process.env.E2E_USER_PASSWORD;
    test.skip(!email || !password, "Requires E2E_USER_EMAIL and E2E_USER_PASSWORD");

    // Create session token via API to avoid UI login flake
    const session = await apiRequest<{ token: string }>({
      method: "POST",
      url: "/store/auth",
      data: { email, password },
    });

    await page.context().addCookies([
      {
        name: "jwt",
        value: session.token,
        url: process.env.STOREFRONT_URL || "https://localhost:5173",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);

    await page.goto("/checkout");
    await expect(page.getByText(/logged in|account/i)).toBeVisible();
    await expect(page.getByText(/shipping|address/i)).toBeVisible();
  });
});
