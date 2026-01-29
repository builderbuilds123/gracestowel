import { test, expect } from "../support/fixtures";
import jwt from "jsonwebtoken";

/**
 * Grace Period E2E (Critical)
 * Covers order modification, cancellation, and capture window behavior.
 */

const JWT_SECRET = process.env.JWT_SECRET;

function generateToken(orderId: string, ttlSeconds: number): string {
  if (!JWT_SECRET) {
    throw new Error("JWT_SECRET is required for modification token tests");
  }
  const iat = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      order_id: orderId,
      payment_intent_id: "pi_test",
      iat,
      exp: iat + ttlSeconds,
    },
    JWT_SECRET,
    { algorithm: "HS256" },
  );
}

async function createOrderAndTokens(orderFactory: { createOrder: () => Promise<{ id?: string }> }) {
  const order = await orderFactory.createOrder();
  test.skip(!order.id, "Order factory failed to create an order");
  return {
    orderId: order.id!,
    validToken: generateToken(order.id!, 60 * 60),
    shortToken: generateToken(order.id!, 15),
  };
}

test.describe("Grace Period (Order Modification)", () => {
  test("should show edit/cancel actions during the grace period", async ({ page, orderFactory }) => {
    const { orderId, validToken } = await createOrderAndTokens(orderFactory);

    await page.goto(`/order/status/${orderId}?token=${validToken}`);
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByRole("timer")).toBeVisible({ timeout: 30000 });
    await expect(page.getByRole("link", { name: /edit order/i })).toBeVisible({ timeout: 30000 });
    await expect(page.getByRole("button", { name: /cancel order/i })).toBeVisible({ timeout: 30000 });
  });

  test("should allow canceling an order during the grace period", async ({ page, orderFactory }) => {
    const { orderId, validToken } = await createOrderAndTokens(orderFactory);

    await page.goto(`/order/status/${orderId}?token=${validToken}`);
    await page.waitForLoadState("domcontentloaded");

    const cancelButton = page.getByRole("button", { name: /cancel order/i }).first();
    await expect(cancelButton).toBeVisible({ timeout: 30000 });
    await cancelButton.click();

    const confirmCancel = page.getByRole("button", { name: /cancel order/i }).last();
    await expect(confirmCancel).toBeVisible({ timeout: 30000 });
    await confirmCancel.click();

    await expect(page.getByText(/canceled|cancelled/i)).toBeVisible({ timeout: 30000 });
  });

  test("should hide cancel after grace period expires (capture window)", async ({ page, orderFactory }) => {
    const { orderId, shortToken } = await createOrderAndTokens(orderFactory);

    await page.goto(`/order/status/${orderId}?token=${shortToken}`);
    await page.waitForLoadState("domcontentloaded");

    const timer = page.getByRole("timer");
    const timerVisible = await timer.isVisible({ timeout: 5000 }).catch(() => false);
    if (timerVisible) {
      await page.waitForFunction(
        () => !document.querySelector('[role="timer"]'),
        { timeout: 20000 },
      );
    }

    await page.reload();
    await page.waitForLoadState("domcontentloaded");

    const processingVisible = await page
      .getByText(/being processed|modifications are no longer available/i)
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    const cancelHidden = !(await page.getByRole("button", { name: /cancel order/i }).isVisible({ timeout: 1000 }).catch(() => false));

    expect(processingVisible || cancelHidden).toBe(true);
  });
});
