# Story 8-1: Create Minimal UI Smoke Test Suite

**Epic:** Epic 8 - UI Smoke Tests & Cross-Browser  
**Status:** done
**Created:** 2025-12-14  
**Requirements:** FR2.1, FR7.1

---

## User Story

As a **QA engineer**,  
I want **minimal smoke tests that verify critical pages load**,  
So that **major UI regressions are caught without full UI testing**.

---

## Acceptance Criteria

### AC1: Homepage Loads
**Given** the storefront is running  
**When** I navigate to the homepage  
**Then** the page loads with product listings visible

### AC2: Checkout Page Loads
**Given** the storefront is running  
**When** I navigate to the checkout page  
**Then** the checkout form is displayed

### AC3: Order Status Page Loads
**Given** a valid order and modification token  
**When** I navigate to the order status page  
**Then** the order details are displayed

---

## Implementation Tasks

### Task 1: Create Smoke Tests
**File:** `apps/e2e/tests/smoke/page-load.spec.ts`

```typescript
import { test, expect } from '../../fixtures';

test.describe('Smoke Tests - Page Load', () => {
  test('homepage loads with products', async ({ page }) => {
    await page.goto('/');
    
    // Page should load
    await expect(page).toHaveTitle(/Grace Stowel/i);
    
    // Products should be visible
    const productCards = page.locator('a[href^="/products/"]');
    await expect(productCards.first()).toBeVisible();
    
    // Navigation should work
    await expect(page.getByRole('navigation')).toBeVisible();
  });
  
  test('product page loads', async ({ page, dataFactory }) => {
    const product = await dataFactory.getRandomProduct();
    
    await page.goto(`/products/${product.handle}`);
    
    // Product details visible
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: /add to cart/i })).toBeVisible();
  });
  
  test('checkout page loads', async ({ page, dataFactory }) => {
    const product = await dataFactory.getRandomProduct();
    await dataFactory.createCart([{ variant_id: product.variants[0].id, quantity: 1 }]);
    
    await page.goto('/checkout');
    
    // Checkout form visible
    await expect(page.locator('[data-testid="checkout-form"]')).toBeVisible();
  });
  
  test('order status page loads with valid token', async ({ page, webhook, payment }) => {
    const pi = await payment.createPaymentIntent(5000, { captureMethod: 'manual' });
    await payment.simulatePayment(pi.id, 'SUCCESS');
    await webhook.mockPaymentIntentAuthorized(pi.id, 5000);
    
    const orderResponse = await fetch(`/api/orders?payment_intent_id=${pi.id}`);
    const { order } = await orderResponse.json();
    
    await page.goto(`/order/status/${order.id}?token=${order.modification_token}`);
    
    // Order details visible
    await expect(page.locator('[data-testid="order-number"]')).toBeVisible();
  });
});
```

---

## Definition of Done

- [x] Homepage loads with products
- [x] Product page loads correctly
- [x] Checkout page loads with form
- [x] Order status page loads with valid token
- [x] All smoke tests pass on Chromium

---

## References

- Design Spec: `.kiro/specs/e2e-testing-overhaul/design.md`
- Requirements: FR2.1, FR7.1
