import { test, expect } from "@playwright/test";

/**
 * Story 5.1: E2E Grace Period Tests
 * Coverage: AC1 (Timer/Edit UI), AC2 (Magic Link/Cookie), AC4/AC6 (Cancel)
 * 
 * ENVIRONMENT REQUIREMENTS:
 * 1. Backend running with PAYMENT_CAPTURE_DELAY_MS=10000 (10s TTL)
 * 2. Storefront running at BASE_URL (default: http://localhost:5173)
 * 3. At least one test order seeded in database
 * 
 * TEST DATA:
 * - Set TEST_ORDER_ID in .env to a valid order ID with active grace period
 * - Set TEST_MODIFICATION_TOKEN to a valid JWT for that order
 * 
 * Run: npx playwright test grace-period.spec.ts
 */

// Test configuration from environment
const TEST_ORDER_ID = process.env.TEST_ORDER_ID || "order_01JEFTEST";
const TEST_TOKEN = process.env.TEST_MODIFICATION_TOKEN || "";
// These would need to be pre-generated tokens with specific expiry times for testing
const EXPIRED_TOKEN = process.env.TEST_EXPIRED_TOKEN || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJvcmRlcl9pZCI6Im9yZGVyXzAxSkVGVEVTVCIsImV4cCI6MH0.invalid";

test.describe("AC1: Timer Visibility & Expiration", () => {
    
    test("should display timer element with role='timer' during grace period", async ({ page }) => {
        // AC1.1: Timer MUST be displayed on order confirmation/status page
        test.skip(!TEST_TOKEN, "Requires TEST_MODIFICATION_TOKEN env var");
        
        await page.goto(`/order/status/${TEST_ORDER_ID}?token=${TEST_TOKEN}`);
        
        // OrderTimer component uses role="timer" (line 66 of OrderTimer.tsx)
        const timer = page.getByRole("timer");
        await expect(timer).toBeVisible({ timeout: 10000 });
        
        // Timer should show MM:SS format
        await expect(timer).toContainText(/\d{2}:\d{2}/);
    });

    test("should display edit/cancel options during active grace period", async ({ page }) => {
        // AC1.1: "Edit Order" button MUST be visible during grace period
        test.skip(!TEST_TOKEN, "Requires TEST_MODIFICATION_TOKEN env var");
        
        await page.goto(`/order/status/${TEST_ORDER_ID}?token=${TEST_TOKEN}`);
        
        // OrderModificationDialogs renders edit options when modification_window.status === "active"
        // Look for any modification button (Cancel Order, Edit Address, etc.)
        const modificationButtons = page.locator('button').filter({ hasText: /cancel|edit|modify/i });
        await expect(modificationButtons.first()).toBeVisible({ timeout: 10000 });
    });

    test("should hide edit options when grace period expires (short TTL)", async ({ page }) => {
        // AC1.2: Edit button hidden, status changes to "Processing" after expiration
        // Requires PAYMENT_CAPTURE_DELAY_MS=10000 (10s) in backend
        test.skip(!TEST_TOKEN, "Requires TEST_MODIFICATION_TOKEN env var");
        
        await page.goto(`/order/status/${TEST_ORDER_ID}?token=${TEST_TOKEN}`);
        
        // Wait for timer to show (grace period active)
        const timer = page.getByRole("timer");
        await expect(timer).toBeVisible({ timeout: 5000 });
        
        // Wait for expiration (10s + buffer for network)
        // Note: This is a real-time wait - in CI you may want to use clock mocking
        await page.waitForTimeout(12000);
        
        // After expiration, timer disappears and "being processed" appears
        await expect(timer).toBeHidden({ timeout: 5000 });
        
        // Check for processing message (line 292 of order_.status.$id.tsx)
        await expect(page.getByText(/being processed/i)).toBeVisible();
        
        // Edit buttons should be hidden
        await expect(page.getByRole("button", { name: /cancel order/i })).toBeHidden();
    });
});

test.describe("AC2 & AC3: Magic Link & Cookie Persistence", () => {

    test("should show 'Link Expired' page for expired token", async ({ page }) => {
        // AC2: Expired JWT redirects to "Link Expired" page
        // Note: This test requires Medusa backend to be running to return 403 response
        // Skip if no backend URL configured
        test.skip(!process.env.MEDUSA_BACKEND_URL, "Requires MEDUSA_BACKEND_URL env var (backend must be running)");
        
        // Use a deliberately expired/invalid token
        await page.goto(`/order/status/${TEST_ORDER_ID}?token=${EXPIRED_TOKEN}`);
        
        // Order status page shows "Link Expired" heading (line 224 of order_.status.$id.tsx)
        const expiredHeading = page.getByRole("heading", { name: /Link Expired/i });
        await expect(expiredHeading).toBeVisible({ timeout: 10000 });
        
        // Should also see "Request New Link" button
        await expect(page.getByRole("button", { name: /Request New Link/i })).toBeVisible();
    });

    test("should set guest_order cookie with correct attributes", async ({ page, context }) => {
        // AC2: Cookie guest_order_{order_id} with proper security attributes
        test.skip(!TEST_TOKEN, "Requires TEST_MODIFICATION_TOKEN env var");
        
        // Visit with token in URL (first visit via magic link)
        await page.goto(`/order/status/${TEST_ORDER_ID}?token=${TEST_TOKEN}`);
        
        // Wait for page to load successfully
        await expect(page.getByRole("heading", { name: /Order Status/i })).toBeVisible({ timeout: 10000 });
        
        // Check cookie was set
        const cookies = await context.cookies();
        const guestCookie = cookies.find(c => c.name === `guest_order_${TEST_ORDER_ID}`);
        
        expect(guestCookie).toBeDefined();
        expect(guestCookie!.httpOnly).toBe(true);
        expect(guestCookie!.sameSite).toBe("Strict");
        expect(guestCookie!.path).toBe(`/order/status/${TEST_ORDER_ID}`);
        // Note: secure=true only in production
    });

    test("should persist session via cookie (no token in URL on reload)", async ({ page, context }) => {
        // AC2: Cookie-based session persists across page loads
        test.skip(!TEST_TOKEN, "Requires TEST_MODIFICATION_TOKEN env var");
        
        // First visit with token
        await page.goto(`/order/status/${TEST_ORDER_ID}?token=${TEST_TOKEN}`);
        await expect(page.getByRole("heading", { name: /Order Status/i })).toBeVisible({ timeout: 10000 });
        
        // Second visit WITHOUT token in URL
        await page.goto(`/order/status/${TEST_ORDER_ID}`);
        
        // Should still load successfully (using cookie)
        await expect(page.getByRole("heading", { name: /Order Status/i })).toBeVisible({ timeout: 10000 });
        
        // Confirm no 401/403 error
        await expect(page.getByText(/unauthorized|forbidden|expired/i)).toBeHidden();
    });

    test("should have cookie path scoped to specific order", async ({ page, context }) => {
        // AC2: path: /order/status/{order_id}
        test.skip(!TEST_TOKEN, "Requires TEST_MODIFICATION_TOKEN env var");
        
        await page.goto(`/order/status/${TEST_ORDER_ID}?token=${TEST_TOKEN}`);
        await page.waitForLoadState("networkidle");
        
        const cookies = await context.cookies();
        const guestCookie = cookies.find(c => c.name === `guest_order_${TEST_ORDER_ID}`);
        
        expect(guestCookie).toBeDefined();
        expect(guestCookie!.path).toBe(`/order/status/${TEST_ORDER_ID}`);
    });
});

test.describe("AC4 & AC6: Order Cancellation", () => {

    test("should allow cancelling order during grace period", async ({ page }) => {
        // AC4: Cancel succeeds during grace period, Stripe auth voided
        test.skip(!TEST_TOKEN, "Requires TEST_MODIFICATION_TOKEN env var");
        
        await page.goto(`/order/status/${TEST_ORDER_ID}?token=${TEST_TOKEN}`);
        
        // Verify we're in grace period (timer visible)
        await expect(page.getByRole("timer")).toBeVisible({ timeout: 5000 });
        
        // Find and click cancel button
        const cancelButton = page.getByRole("button", { name: /cancel order/i });
        await expect(cancelButton).toBeVisible();
        await cancelButton.click();
        
        // If there's a confirmation dialog, handle it
        const confirmDialog = page.getByRole("dialog");
        const confirmButton = confirmDialog.getByRole("button", { name: /confirm|yes|cancel order/i });
        if (await confirmButton.isVisible({ timeout: 2000 }).catch(() => false)) {
            await confirmButton.click();
        }
        
        // After cancellation, verify success
        // Page should show canceled status or success message
        await expect(page.getByText(/cancel(l)?ed/i)).toBeVisible({ timeout: 10000 });
    });

    test("should hide cancel button after grace period expires", async ({ page }) => {
        // AC6: Cancel fails/hidden after expiration
        test.skip(!TEST_TOKEN, "Requires TEST_MODIFICATION_TOKEN env var");
        
        await page.goto(`/order/status/${TEST_ORDER_ID}?token=${TEST_TOKEN}`);
        
        // Wait for grace period to expire (10s + buffer)
        await page.waitForTimeout(12000);
        
        // Cancel button should be gone
        await expect(page.getByRole("button", { name: /cancel order/i })).toBeHidden();
        
        // "being processed" message should appear
        await expect(page.getByText(/being processed/i)).toBeVisible();
    });
});

test.describe("AC5: Backend Capture Workflow (Smoke Test)", () => {
    
    test("should complete order capture after grace period", async ({ page, request }) => {
        // AC5: BullMQ capture job triggers after delay
        // This is a smoke test - full verification is in backend unit tests
        test.skip(!TEST_TOKEN, "Requires TEST_MODIFICATION_TOKEN env var");
        
        await page.goto(`/order/status/${TEST_ORDER_ID}?token=${TEST_TOKEN}`);
        
        // Wait for expiration
        await page.waitForTimeout(12000);
        
        // Reload page to get updated order status from backend
        await page.reload();
        
        // Order should now be in processing state
        await expect(page.getByText(/being processed/i)).toBeVisible({ timeout: 5000 });
        
        // Note: Verifying payment_captured_at metadata would require API access
        // which is covered in backend integration tests (payment-capture-queue.unit.spec.ts)
    });
});
