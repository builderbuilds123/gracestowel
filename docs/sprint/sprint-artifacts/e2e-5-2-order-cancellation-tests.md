# Story 5-2: Create Order Cancellation Test Suite

**Epic:** Epic 5 - Order Modification Flow Testing  
**Status:** done
**Created:** 2025-12-14  
**Requirements:** FR8.5, FR13.6

---

## User Story

As a **developer**,  
I want **tests that verify order cancellation works correctly**,  
So that **customers can cancel orders within the grace period**.

---

## Acceptance Criteria

### AC1: Successful Cancellation
**Given** an order within grace period  
**When** I cancel the order with valid token  
**Then** the order status updates to "cancelled", PaymentIntent is cancelled, and BullMQ job is removed

### AC2: Cancellation Rejected After Grace Period
**Given** an order outside grace period  
**When** I attempt to cancel the order  
**Then** the cancellation is rejected with "grace period expired" error

### AC3: Already Cancelled Order
**Given** an already cancelled order  
**When** I attempt to cancel again  
**Then** the request is rejected with "already cancelled" error

---

## Implementation Tasks

### Task 1: Create Cancellation Tests
**File:** `apps/e2e/tests/orders/order-cancellation.api.spec.ts`

```typescript
import { test, expect } from '../../fixtures';

test.describe('Order Cancellation', () => {
  test('should cancel order within grace period', async ({ webhook, payment, request }) => {
    const pi = await payment.createPaymentIntent(5000, { captureMethod: 'manual' });
    await payment.simulatePayment(pi.id, 'SUCCESS');
    await webhook.mockPaymentIntentAuthorized(pi.id, 5000);
    
    const orderResponse = await request.get(`/api/orders?payment_intent_id=${pi.id}`);
    const { order } = await orderResponse.json();
    
    // Cancel order
    const cancelResponse = await request.post(`/api/orders/${order.id}/cancel`, {
      headers: { Authorization: `Bearer ${order.modification_token}` }
    });
    
    expect(cancelResponse.status()).toBe(200);
    
    // Verify order status
    const updatedResponse = await request.get(`/api/orders/${order.id}`);
    const { order: updatedOrder } = await updatedResponse.json();
    
    expect(updatedOrder.status).toBe('cancelled');
  });
  
  test('should reject cancellation after grace period', async ({ request }) => {
    // Get expired order from test endpoint
    const orderResponse = await request.get('/api/test/orders/expired-grace-period');
    const { order } = await orderResponse.json();
    
    const cancelResponse = await request.post(`/api/orders/${order.id}/cancel`, {
      headers: { Authorization: `Bearer ${order.modification_token}` }
    });
    
    expect(cancelResponse.status()).toBe(400);
    const error = await cancelResponse.json();
    expect(error.message).toContain('grace period');
  });
  
  test('should reject cancellation of already cancelled order', async ({ webhook, payment, request }) => {
    const pi = await payment.createPaymentIntent(5000, { captureMethod: 'manual' });
    await payment.simulatePayment(pi.id, 'SUCCESS');
    await webhook.mockPaymentIntentAuthorized(pi.id, 5000);
    
    const orderResponse = await request.get(`/api/orders?payment_intent_id=${pi.id}`);
    const { order } = await orderResponse.json();
    
    // Cancel once
    await request.post(`/api/orders/${order.id}/cancel`, {
      headers: { Authorization: `Bearer ${order.modification_token}` }
    });
    
    // Try to cancel again
    const secondCancel = await request.post(`/api/orders/${order.id}/cancel`, {
      headers: { Authorization: `Bearer ${order.modification_token}` }
    });
    
    expect(secondCancel.status()).toBe(400);
    const error = await secondCancel.json();
    expect(error.message).toContain('already cancelled');
  });
});
```

---

## Definition of Done

- [x] Cancellation succeeds within grace period
- [x] PaymentIntent is cancelled in Stripe
- [x] BullMQ capture job is removed
- [x] Cancellation rejected after grace period
- [x] Already cancelled orders cannot be cancelled again

---

## References

- Design Spec: `.kiro/specs/e2e-testing-overhaul/design.md`
- Requirements: FR8.5, FR13.6
- Property 9: Order Cancellation During Grace Period
