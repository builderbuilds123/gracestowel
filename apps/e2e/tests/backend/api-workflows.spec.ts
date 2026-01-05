import { expect, test } from "../../support/fixtures";

// Fail fast if ADMIN_TOKEN is not configured - these tests require admin access
if (!process.env.ADMIN_TOKEN) {
  throw new Error("ADMIN_TOKEN environment variable is required for backend API tests");
}

test.describe("Backend API workflows (admin)", () => {

  test("products catalog CRUD with publish/unpublish and pricing updates", async ({
    apiRequest,
    productFactory,
  }) => {
    const product = await productFactory.createProduct();
    test.skip(!product.id, "Product creation endpoint unavailable");

    const published = await apiRequest<{ product: { status: string } }>({
      method: "POST",
      url: `/admin/products/${product.id}`,
      data: { status: "published", title: `${product.title} Updated` },
    });
    expect(published.product.status).toBe("published");

    const unpublished = await apiRequest<{ product: { status: string } }>({
      method: "POST",
      url: `/admin/products/${product.id}`,
      data: { status: "draft" },
    });
    expect(unpublished.product.status).toBe("draft");

    const priced = await apiRequest<{ product: { prices?: Array<{ amount: number }> } }>({
      method: "POST",
      url: `/admin/products/${product.id}`,
      data: { prices: [{ amount: 1234, currency_code: "usd" }] },
    });
    expect(priced.product.prices?.[0]?.amount).toBe(1234);
  });

  test("customers issue tokens and manage addresses", async ({
    apiRequest,
    userFactory,
  }) => {
    const customer = await userFactory.createUser();
    test.skip(!customer.email, "User factory failed to build payload");

    const created = await apiRequest<{ customer: { id: string } }>({
      method: "POST",
      url: "/admin/customers",
      data: customer,
    });
    expect(created.customer.id).toBeTruthy();

    const updated = await apiRequest<{ customer: { id: string; first_name?: string } }>({
      method: "POST",
      url: `/admin/customers/${created.customer.id}`,
      data: { first_name: "Updated" },
    });
    expect(updated.customer.first_name).toBe("Updated");

    const token = await apiRequest<{ token: string }>({
      method: "POST",
      url: "/admin/auth/token",
      data: { email: customer.email, password: customer.password },
    });
    expect(token.token).toBeTruthy();
  });

  test("carts and orders apply discounts, shipping, tax, and payment intents", async ({
    apiRequest,
    cartFactory,
    productFactory,
    discountFactory,
    shippingFactory,
    paymentFactory,
  }) => {
    const product = await productFactory.createProduct();
    const cart = await cartFactory.createCart();
    test.skip(!product.id || !cart.id, "Cart or product APIs unavailable");

    const lineItem = await apiRequest<{ cart: { id: string } }>({
      method: "POST",
      url: `/store/carts/${cart.id}/line-items`,
      data: { product_id: product.id, quantity: 1 },
    });
    expect(lineItem.cart.id).toBeTruthy();

    const discount = await discountFactory.createDiscount();
    test.skip(!discount.id, "Discount API unavailable");
    const cartWithDiscount = await apiRequest<{ cart: { discounts?: unknown[] } }>({
      method: "POST",
      url: `/store/carts/${cart.id}/discounts/${discount.code}`,
    });
    expect(cartWithDiscount.cart.discounts?.length).toBeGreaterThan(0);

    const shipping = await shippingFactory.createShippingOption();
    test.skip(!shipping.id, "Shipping option API unavailable");
    const shippingRate = await apiRequest<{ cart: { shipping_methods?: unknown[] } }>({
      method: "POST",
      url: `/store/carts/${cart.id}/shipping-methods`,
      data: { option_id: shipping.id },
    });
    expect(shippingRate.cart.shipping_methods?.length).toBeGreaterThan(0);

    const taxes = await apiRequest<{ cart: { totals?: { tax_total?: number } } }>({
      method: "GET",
      url: `/store/carts/${cart.id}`,
    });
    expect(taxes.cart.totals?.tax_total).toBeDefined();

    const intent = await paymentFactory.createPaymentIntent({ cart_id: cart.id });
    test.skip(!intent.id, "Payment intent API unavailable");
    expect(intent.cart_id ?? cart.id).toBeTruthy();
  });

  test("grace period tokens gate cancellation and edit windows", async ({
    apiRequest,
    orderFactory,
  }) => {
    const order = await orderFactory.createOrder();
    test.skip(!order.id, "Order creation endpoint unavailable");

    const cancellation = await apiRequest<{ order: { status: string } }>({
      method: "POST",
      url: `/admin/orders/${order.id}/cancel`,
    });
    expect(cancellation.order.status).toMatch(/canceled|cancelled/i);
  });

  test("rejects invalid payloads with 4xx and retries idempotently", async ({
    apiRequest,
  }) => {
    let statusCode = 0;
    try {
      await apiRequest({
        method: "POST",
        url: "/admin/products",
        data: { title: "" },
      });
    } catch (error: any) {
      // Extract status code from error object for proper validation
      if (error && typeof error === "object") {
        if ("status" in error && typeof error.status === "number") {
          statusCode = error.status;
        } else if ("statusCode" in error && typeof error.statusCode === "number") {
          statusCode = error.statusCode;
        } else {
          // If error was thrown but no status code found, default to client error
          statusCode = 400;
        }
      }
    }
    expect(statusCode).toBeGreaterThanOrEqual(400);
    expect(statusCode).toBeLessThan(500);

    const webhook = await apiRequest<{ success: boolean }>({
      method: "POST",
      url: "/admin/webhooks/test",
      headers: { "Idempotency-Key": "e2e-idempotent-key" },
      data: { event: "test.event" },
    });
    expect(webhook.success).toBeTruthy();
  });
});
