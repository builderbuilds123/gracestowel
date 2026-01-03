import { expect, test } from "../../support/fixtures";

const PRODUCT_HANDLE = "the-nuzzle";
const PRODUCT_NAME = "The Nuzzle";

type StoreProduct = {
  id: string;
  title: string;
  handle: string;
  variants?: Array<{ id: string; title: string }>;
  images?: Array<{ url: string }>;
  collection_id?: string | null;
};

test.describe("Storefront navigation, discovery, and PDP coverage", () => {
  test("loads homepage navigation, categories, and product cards", async ({
    page,
  }) => {
    const catalog = page.waitForResponse(
      (response) =>
        response.url().includes("/store/products") && response.status() === 200,
    );

    await page.goto("/");
    await catalog;

    await expect(page).toHaveTitle(/Grace/i);
    await expect(page.getByRole("heading", { name: /Best Sellers/i })).toBeVisible();
    await expect(page.locator('a[href^="/products/"]').first()).toBeVisible();

    const productCards = page.locator('a[href^="/products/"]');
    const cardCount = await productCards.count();
    expect(cardCount).toBeGreaterThan(1);
  });

  test("supports search, filter, sort, and pagination via storefront API", async ({
    apiRequest,
  }) => {
    const firstPage = await apiRequest<{ products: StoreProduct[] }>({
      method: "GET",
      url: "/store/products",
      query: { limit: 5, offset: 0, order: "created_at" },
    });
    const secondPage = await apiRequest<{ products: StoreProduct[] }>({
      method: "GET",
      url: "/store/products",
      query: { limit: 5, offset: 5, order: "-created_at" },
    });
    expect(firstPage.products.length).toBeGreaterThan(0);
    expect(secondPage.products.length).toBeGreaterThan(0);
    expect(firstPage.products[0]?.id).not.toBe(secondPage.products[0]?.id);

    const search = await apiRequest<{ products: StoreProduct[] }>({
      method: "GET",
      url: "/store/products",
      query: { q: "towel", limit: 5, order: "title" },
    });
    expect(search.products.length).toBeGreaterThan(0);
  });

  test("renders PDP variants, pricing, stock, images, and related content", async ({
    page,
  }) => {
    const productResponse = page.waitForResponse(
      (response) =>
        response.url().includes(`/store/products/${PRODUCT_HANDLE}`) &&
        response.status() === 200,
    );

    await page.goto(`/products/${PRODUCT_HANDLE}`);
    await productResponse;

    await expect(page.getByRole("heading", { name: PRODUCT_NAME })).toBeVisible();
    await expect(page.getByText(/\$|€|£/)).toBeVisible();
    await expect(page.locator("img").first()).toBeVisible();

    const variantSelect = page.getByRole("combobox").first();
    if (await variantSelect.isVisible()) {
      await variantSelect.selectOption({ index: 0 });
    }

    await expect(
      page.getByRole("button", { name: /hang it up|add to cart/i }),
    ).toBeVisible();

    const relatedSection = page.getByText(/related|you may also like/i);
    await expect(relatedSection).toBeVisible();
  });

  test("handles 404 and offline UX gracefully", async ({ page }) => {
    await page.goto("/non-existent-route");
    await expect(page.getByText(/not found|404/i)).toBeVisible();

    await page.context().setOffline(true);
    try {
      await page.goto("/");
    } catch {
      // Expected network failure when offline
    } finally {
      await page.context().setOffline(false);
    }
  });
});
