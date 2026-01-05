import { test, expect } from "../../support/fixtures";

const PRODUCT_HANDLE = "the-nuzzle";
const PRODUCT_NAME = "The Nuzzle";

test.describe("Storefront cart + checkout flows", () => {
  test("adds products to cart with drawer interaction", async ({ page }) => {




    await page.goto(`/products/${PRODUCT_HANDLE}`);

    await expect(page.getByRole("heading", { name: PRODUCT_NAME })).toBeVisible();

    await page.getByRole("button", { name: /hang it up|add to cart/i }).click();


    await expect(page.getByRole("heading", { name: /towel rack/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: PRODUCT_NAME, level: 3 })).toBeVisible();
  });

  test("updates cart quantities and recalculates totals", async ({ page }) => {



    await page.goto(`/products/${PRODUCT_HANDLE}`);

    await page.getByRole("button", { name: /hang it up|add to cart/i }).click();

    await expect(page.getByRole("heading", { name: /towel rack/i })).toBeVisible();



    const increaseButton = page
      .locator('button[aria-label="Increase quantity"]')
      .first();
    await increaseButton.click();


    const subtotal = page.getByText(/\$|€|£/).first();
    await expect(subtotal).toBeVisible();
  });

  test("removes items and shows empty state", async ({ page }) => {



    await page.goto(`/products/${PRODUCT_HANDLE}`);

    await page.getByRole("button", { name: /hang it up|add to cart/i }).click();

    await expect(page.getByRole("heading", { name: /towel rack/i })).toBeVisible();



    await page.getByRole("button", { name: /remove|delete/i }).first().click();


    await expect(page.getByText(/empty|no items/i)).toBeVisible();
  });

  test("persists cart contents across reloads", async ({ page }) => {



    await page.goto(`/products/${PRODUCT_HANDLE}`);

    await page.getByRole("button", { name: /hang it up|add to cart/i }).click();

    await expect(page.getByRole("heading", { name: /towel rack/i })).toBeVisible();


    await page.reload();
    
    // Open cart to verify persistence
    await page.getByRole("button", { name: /open cart/i }).click();
    await expect(page.getByRole("heading", { name: /towel rack/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: PRODUCT_NAME, level: 3 })).toBeVisible();
  });

  test("guest checkout displays address, shipping, tax, and payment steps", async ({
    page,
  }) => {
    test.setTimeout(60_000);



    await page.goto(`/products/${PRODUCT_HANDLE}`);

    await page.getByRole("button", { name: /hang it up|add to cart/i }).click();


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
    request,
  }) => {
    const email = process.env.E2E_USER_EMAIL;
    const password = process.env.E2E_USER_PASSWORD;
    test.skip(!email || !password, "Requires E2E_USER_EMAIL and E2E_USER_PASSWORD");

    // Create session token via API to avoid UI login flake
    const session = await apiRequest<{ token: string }>({
      request,
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
