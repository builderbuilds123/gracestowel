# Story 5-1: Create Grace Period Test Suite

**Epic:** Epic 5 - Order Modification Flow Testing  
**Status:** done
**Created:** 2025-12-14  
**Requirements:** FR8.2, FR8.3, FR13.3

---

## User Story

As a **developer**,  
I want **tests that verify grace period timing and modification availability**,  
So that **customers can modify orders within the allowed window**.

---

## Acceptance Criteria

### AC1: Modifications Available Within Grace Period
**Given** an order created less than 1 hour ago  
**When** I view the order status page with valid token  
**Then** modification options (cancel, edit address, add items) are visible

### AC2: Modifications Hidden After Grace Period
**Given** an order created more than 1 hour ago  
**When** I view the order status page  
**Then** modification options are hidden and a "being processed" message is displayed

### AC3: Countdown Timer Display
**Given** an order within grace period  
**When** I view the order status page  
**Then** a countdown timer shows remaining time

---

## Implementation Tasks

### Task 1: Create Grace Period Tests
**File:** `apps/e2e/tests/orders/grace-period.spec.ts`

```typescript
import { test, expect } from '../../fixtures';

test.describe('Grace Period', () => {
  test('should show modification options within grace period', async ({ page, webhook, payment }) => {
    const pi = await payment.createPaymentIntent(5000, { captureMethod: 'manual' });
    await payment.simulatePayment(pi.id, 'SUCCESS');
    await webhook.mockPaymentIntentAuthorized(pi.id, 5000);
    
    const orderResponse = await fetch(`/api/orders?payment_intent_id=${pi.id}`);
    const { order } = await orderResponse.json();
    
    await page.goto(`/order/status/${order.id}?token=${order.modification_token}`);
    
    // Verify modification options visible
    await expect(page.getByRole('button', { name: /cancel order/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /edit address/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /add items/i })).toBeVisible();
  });
  
  test('should show countdown timer', async ({ page, webhook, payment }) => {
    const pi = await payment.createPaymentIntent(5000, { captureMethod: 'manual' });
    await payment.simulatePayment(pi.id, 'SUCCESS');
    await webhook.mockPaymentIntentAuthorized(pi.id, 5000);
    
    const orderResponse = await fetch(`/api/orders?payment_intent_id=${pi.id}`);
    const { order } = await orderResponse.json();
    
    await page.goto(`/order/status/${order.id}?token=${order.modification_token}`);
    
    // Verify timer is visible
    const timer = page.getByRole('timer');
    await expect(timer).toBeVisible();
    await expect(timer).toContainText(/\d+:\d+/); // MM:SS format
  });
  
  test('should hide modifications after grace period', async ({ page, request }) => {
    // Create order with past timestamp (mocked)
    const response = await request.get('/api/test/orders/expired-grace-period');
    const { order } = await response.json();
    
    await page.goto(`/order/status/${order.id}?token=${order.modification_token}`);
    
    // Verify modifications hidden
    await expect(page.getByRole('button', { name: /cancel order/i })).not.toBeVisible();
    await expect(page.getByText(/being processed/i)).toBeVisible();
  });
});
```

---

## Definition of Done

- [x] Modification options visible within grace period
- [x] Countdown timer displays correctly
- [x] Modifications hidden after grace period
- [x] "Being processed" message shown after expiration

---

## References

- Design Spec: `.kiro/specs/e2e-testing-overhaul/design.md`
- Requirements: FR8.2, FR8.3, FR13.3
- Property 7: Grace Period Modification Availability
