# Story 4-1: Create Webhook Handler Test Suite

**Epic:** Epic 4 - Order Creation Flow Testing  
**Status:** drafted  
**Created:** 2025-12-14  
**Requirements:** FR13.1, FR9.4, FR9.5

---

## User Story

As a **developer**,  
I want **tests that verify order creation from Stripe webhooks**,  
So that **orders are created correctly when payments are authorized**.

---

## Acceptance Criteria

### AC1: Order Creation from Webhook
**Given** a PaymentIntent with status `requires_capture`  
**When** the `payment_intent.amount_capturable_updated` webhook is received  
**Then** an order is created with correct items and amounts

### AC2: Idempotent Webhook Handling
**Given** a webhook event ID that was already processed  
**When** the same webhook is received again  
**Then** the webhook is handled idempotently (no duplicate order)

### AC3: Invalid Signature Rejection
**Given** a webhook with an invalid signature  
**When** the webhook is received  
**Then** the request is rejected with 401 status

---

## Implementation Tasks

### Task 1: Create Webhook Handler Tests
**File:** `apps/e2e/tests/webhooks/webhook-handler.api.spec.ts`

```typescript
import { test, expect } from '../../fixtures';

test.describe('Webhook Handler', () => {
  test('should create order from payment_intent.amount_capturable_updated', async ({ webhook, payment, dataFactory }) => {
    // Create PaymentIntent
    const pi = await payment.createPaymentIntent(5000, { captureMethod: 'manual' });
    
    // Simulate successful payment
    await payment.simulatePayment(pi.id, 'SUCCESS');
    
    // Send webhook
    const response = await webhook.mockPaymentIntentAuthorized(pi.id, 5000);
    
    expect(response.status).toBe(200);
    
    // Verify order was created
    const orderResponse = await fetch(`/api/orders?payment_intent_id=${pi.id}`);
    const { order } = await orderResponse.json();
    
    expect(order).toBeTruthy();
    expect(order.payment_intent_id).toBe(pi.id);
  });
  
  test('should handle duplicate webhook idempotently', async ({ webhook, payment }) => {
    const pi = await payment.createPaymentIntent(5000, { captureMethod: 'manual' });
    await payment.simulatePayment(pi.id, 'SUCCESS');
    
    // Send webhook twice
    const response1 = await webhook.mockPaymentIntentAuthorized(pi.id, 5000);
    const response2 = await webhook.mockPaymentIntentAuthorized(pi.id, 5000);
    
    expect(response1.status).toBe(200);
    expect(response2.status).toBe(200);
    
    // Should only have one order
    const ordersResponse = await fetch(`/api/orders?payment_intent_id=${pi.id}`);
    const { orders } = await ordersResponse.json();
    
    expect(orders.length).toBe(1);
  });
  
  test('should reject webhook with invalid signature', async ({ request }) => {
    const response = await request.post('/webhooks/stripe', {
      headers: {
        'Stripe-Signature': 'invalid_signature',
        'Content-Type': 'application/json',
      },
      data: { type: 'payment_intent.amount_capturable_updated' }
    });
    
    expect(response.status()).toBe(401);
  });
});
```

---

## Definition of Done

- [ ] Order creation from webhook test passes
- [ ] Idempotent handling prevents duplicate orders
- [ ] Invalid signature is rejected with 401
- [ ] Webhook signature validation works correctly
- [ ] Tests use fixtures for cleanup

---

## References

- Design Spec: `.kiro/specs/e2e-testing-overhaul/design.md`
- Requirements: FR13.1, FR9.4, FR9.5
