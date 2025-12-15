# Story 6-1: Create Payment Capture Test Suite

**Epic:** Epic 6 - Payment Capture Flow Testing  
**Status:** drafted  
**Created:** 2025-12-14  
**Requirements:** FR13.4, FR13.5

---

## User Story

As a **developer**,  
I want **tests that verify payment capture after grace period**,  
So that **payments are captured correctly and order status is updated**.

---

## Acceptance Criteria

### AC1: Successful Capture
**Given** an order with grace period expired  
**When** the BullMQ capture job runs  
**Then** the PaymentIntent is captured and order status updates to "captured"

### AC2: Capture Confirmation
**Given** a successful payment capture  
**When** the capture completes  
**Then** a confirmation email is sent to the customer

### AC3: Capture Failure Handling
**Given** a payment capture failure  
**When** the capture fails  
**Then** the error is logged and a manual intervention alert is triggered

---

## Implementation Tasks

### Task 1: Create Capture Tests
**File:** `apps/e2e/tests/payment/payment-capture.api.spec.ts`

```typescript
import { test, expect } from '../../fixtures';

test.describe('Payment Capture', () => {
  test('should capture payment after grace period', async ({ webhook, payment, request }) => {
    const pi = await payment.createPaymentIntent(5000, { captureMethod: 'manual' });
    await payment.simulatePayment(pi.id, 'SUCCESS');
    await webhook.mockPaymentIntentAuthorized(pi.id, 5000);
    
    // Trigger capture (simulate grace period expiration)
    const captureResponse = await request.post('/api/test/trigger-capture', {
      data: { payment_intent_id: pi.id }
    });
    
    expect(captureResponse.status()).toBe(200);
    
    // Verify PaymentIntent is captured
    const piStatus = await payment.getPaymentIntentStatus(pi.id);
    expect(piStatus).toBe('succeeded');
    
    // Verify order status
    const orderResponse = await request.get(`/api/orders?payment_intent_id=${pi.id}`);
    const { order } = await orderResponse.json();
    expect(order.status).toBe('captured');
  });
  
  test('should handle capture failure gracefully', async ({ webhook, payment, request }) => {
    // Create PI that will fail capture (e.g., expired authorization)
    const pi = await payment.createPaymentIntent(5000, { captureMethod: 'manual' });
    await payment.simulatePayment(pi.id, 'SUCCESS');
    await webhook.mockPaymentIntentAuthorized(pi.id, 5000);
    
    // Cancel the PI to simulate failure
    await payment.cancelPaymentIntent(pi.id);
    
    // Attempt capture
    const captureResponse = await request.post('/api/test/trigger-capture', {
      data: { payment_intent_id: pi.id }
    });
    
    // Should handle gracefully
    expect(captureResponse.status()).toBe(500);
    
    // Verify order flagged for manual review
    const orderResponse = await request.get(`/api/orders?payment_intent_id=${pi.id}`);
    const { order } = await orderResponse.json();
    expect(order.needs_manual_review).toBe(true);
  });
});
```

---

## Definition of Done

- [ ] Capture succeeds after grace period
- [ ] Order status updates to "captured"
- [ ] Capture failures are logged
- [ ] Manual intervention alerts triggered on failure

---

## References

- Design Spec: `.kiro/specs/e2e-testing-overhaul/design.md`
- Requirements: FR13.4, FR13.5
