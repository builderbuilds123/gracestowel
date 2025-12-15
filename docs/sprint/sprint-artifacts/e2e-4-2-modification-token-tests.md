# Story 4-2: Create Modification Token Test Suite

**Epic:** Epic 4 - Order Creation Flow Testing  
**Status:** done
**Created:** 2025-12-14  
**Requirements:** FR13.2, FR8.4

---

## User Story

As a **developer**,  
I want **tests that verify modification token generation and validation**,  
So that **only authorized users can modify orders during the grace period**.

---

## Acceptance Criteria

### AC1: Token Generation
**Given** a newly created order  
**When** the order response is returned  
**Then** a modification token is included with correct claims

### AC2: Valid Token Access
**Given** a valid modification token  
**When** I use it to access the order status page  
**Then** the order details are displayed

### AC3: Expired Token Handling
**Given** an expired modification token  
**When** I use it to access the order status page  
**Then** a "link expired" message is displayed with option to request new link

### AC4: Invalid Token Rejection
**Given** a token with invalid signature  
**When** I use it to access the order status page  
**Then** access is denied with appropriate error

---

## Implementation Tasks

### Task 1: Create Token Tests
**File:** `apps/e2e/tests/orders/modification-token.api.spec.ts`

```typescript
import { test, expect } from '../../fixtures';
import jwt from 'jsonwebtoken';

test.describe('Modification Token', () => {
  test('should include modification token in order response', async ({ webhook, payment }) => {
    const pi = await payment.createPaymentIntent(5000, { captureMethod: 'manual' });
    await payment.simulatePayment(pi.id, 'SUCCESS');
    await webhook.mockPaymentIntentAuthorized(pi.id, 5000);
    
    const orderResponse = await fetch(`/api/orders?payment_intent_id=${pi.id}`);
    const { order } = await orderResponse.json();
    
    expect(order.modification_token).toBeTruthy();
    
    // Verify token claims
    const decoded = jwt.decode(order.modification_token);
    expect(decoded.orderId).toBe(order.id);
    expect(decoded.exp).toBeGreaterThan(Date.now() / 1000);
  });
  
  test('should allow access with valid token', async ({ page, webhook, payment }) => {
    const pi = await payment.createPaymentIntent(5000, { captureMethod: 'manual' });
    await payment.simulatePayment(pi.id, 'SUCCESS');
    await webhook.mockPaymentIntentAuthorized(pi.id, 5000);
    
    const orderResponse = await fetch(`/api/orders?payment_intent_id=${pi.id}`);
    const { order } = await orderResponse.json();
    
    await page.goto(`/order/status/${order.id}?token=${order.modification_token}`);
    
    await expect(page.locator('[data-testid="order-number"]')).toBeVisible();
  });
  
  test('should show expired message for old token', async ({ page }) => {
    // Create expired token
    const expiredToken = jwt.sign(
      { orderId: 'test_order', exp: Math.floor(Date.now() / 1000) - 3600 },
      process.env.JWT_SECRET!
    );
    
    await page.goto(`/order/status/test_order?token=${expiredToken}`);
    
    await expect(page.getByText(/link expired/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /request new link/i })).toBeVisible();
  });
  
  test('should reject invalid token signature', async ({ page }) => {
    const invalidToken = jwt.sign(
      { orderId: 'test_order' },
      'wrong_secret'
    );
    
    await page.goto(`/order/status/test_order?token=${invalidToken}`);
    
    await expect(page.getByText(/invalid|unauthorized/i)).toBeVisible();
  });
});
```

---

## Definition of Done

- [x] Token included in order response
- [x] Valid token grants access
- [x] Expired token shows appropriate message
- [x] Invalid signature is rejected
- [x] Token claims are correct

---

## References

- Design Spec: `.kiro/specs/e2e-testing-overhaul/design.md`
- Requirements: FR13.2, FR8.4
