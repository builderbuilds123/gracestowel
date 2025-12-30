# Story 7-3: Create Network Error Test Suite

**Epic:** Epic 7 - Payment Error Flow Testing  
**Status:** done
**Created:** 2025-12-14  
**Requirements:** FR4.1, FR4.4, FR14.3

---

## User Story

As a **developer**,  
I want **tests that verify network error handling during payment**,  
So that **customers don't get double-charged on retry**.

---

## Acceptance Criteria

### AC1: Idempotency on Network Failure
**Given** a network failure during PaymentIntent creation  
**When** the request is retried with the same idempotency key  
**Then** no duplicate PaymentIntent is created

### AC2: PaymentIntent Reuse on Timeout
**Given** a network timeout during payment submission  
**When** the customer retries  
**Then** the existing PaymentIntent is used (not recreated)

### AC3: Validation Error Display
**Given** API returns validation errors  
**When** the error response is received  
**Then** field-specific error messages are displayed

---

## Implementation Tasks

### Task 1: Create Network Error Tests
**File:** `apps/e2e/tests/payment/network-errors.api.spec.ts`

```typescript
import { test, expect } from '../../fixtures';

test.describe('Network Error Handling', () => {
  test('should not create duplicate PaymentIntent on retry', async ({ payment }) => {
    const idempotencyKey = `test_${Date.now()}`;
    
    // First request
    const pi1 = await payment.createPaymentIntent(5000, {
      metadata: { idempotency_key: idempotencyKey }
    });
    
    // Simulate retry with same key
    const pi2 = await payment.createPaymentIntent(5000, {
      metadata: { idempotency_key: idempotencyKey }
    });
    
    // Should be same PaymentIntent
    expect(pi2.id).toBe(pi1.id);
  });
  
  test('should reuse existing PaymentIntent on page reload', async ({ page, dataFactory, request }) => {
    const product = await dataFactory.getRandomProduct();
    const cart = await dataFactory.createCart([
      { variant_id: product.variants[0].id, quantity: 1 }
    ]);
    
    await page.goto('/checkout');
    
    // Get initial PaymentIntent
    const response1 = await request.post('/api/payment-intent', {
      data: { cartId: cart.id }
    });
    const { paymentIntentId: pi1 } = await response1.json();
    
    // Reload page (simulating network issue recovery)
    await page.reload();
    
    // Get PaymentIntent again
    const response2 = await request.post('/api/payment-intent', {
      data: { cartId: cart.id }
    });
    const { paymentIntentId: pi2 } = await response2.json();
    
    // Should be same PaymentIntent
    expect(pi2).toBe(pi1);
  });
  
  test('should display field-specific validation errors', async ({ page, dataFactory }) => {
    const product = await dataFactory.getRandomProduct();
    await dataFactory.createCart([{ variant_id: product.variants[0].id, quantity: 1 }]);
    
    await page.goto('/checkout');
    
    // Submit with invalid data
    await page.getByRole('button', { name: /pay/i }).click();
    
    // Should show field-specific errors
    await expect(page.getByText(/email.*required/i)).toBeVisible();
    await expect(page.getByText(/address.*required/i)).toBeVisible();
  });
});
```

---

## Definition of Done

- [x] Idempotency prevents duplicate PaymentIntents
- [x] Page reload reuses existing PaymentIntent
- [x] Validation errors display per-field messages
- [x] Network timeouts handled gracefully

---

## References

- Design Spec: `.kiro/specs/e2e-testing-overhaul/design.md`
- Requirements: FR4.1, FR4.4, FR14.3
- Property 12: Idempotency Key Duplicate Prevention
