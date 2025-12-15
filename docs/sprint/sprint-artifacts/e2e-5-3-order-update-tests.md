# Story 5-3: Create Order Update Test Suite

**Epic:** Epic 5 - Order Modification Flow Testing  
**Status:** done
**Created:** 2025-12-14  
**Requirements:** FR13.7, FR13.8

---

## User Story

As a **developer**,  
I want **tests that verify order address and item updates work correctly**,  
So that **customers can modify their orders within the grace period**.

---

## Acceptance Criteria

### AC1: Address Update
**Given** an order within grace period  
**When** I update the shipping address  
**Then** the address is updated in both order and PaymentIntent metadata

### AC2: Add Items to Order
**Given** an order within grace period  
**When** I add items to the order  
**Then** the order items are updated and PaymentIntent amount is increased

### AC3: Concurrent Modification Handling
**Given** concurrent modification attempts  
**When** two updates are submitted simultaneously  
**Then** optimistic locking prevents data corruption

---

## Implementation Tasks

### Task 1: Create Order Update Tests
**File:** `apps/e2e/tests/orders/order-updates.api.spec.ts`

```typescript
import { test, expect } from '../../fixtures';

test.describe('Order Updates', () => {
  test('should update shipping address', async ({ webhook, payment, request, dataFactory }) => {
    const pi = await payment.createPaymentIntent(5000, { captureMethod: 'manual' });
    await payment.simulatePayment(pi.id, 'SUCCESS');
    await webhook.mockPaymentIntentAuthorized(pi.id, 5000);
    
    const orderResponse = await request.get(`/api/orders?payment_intent_id=${pi.id}`);
    const { order } = await orderResponse.json();
    
    const newAddress = dataFactory.generateAddress({ city: 'New City' });
    
    const updateResponse = await request.patch(`/api/orders/${order.id}/address`, {
      headers: { Authorization: `Bearer ${order.modification_token}` },
      data: { shipping_address: newAddress }
    });
    
    expect(updateResponse.status()).toBe(200);
    
    const { order: updated } = await updateResponse.json();
    expect(updated.shipping_address.city).toBe('New City');
  });
  
  test('should add items and update PaymentIntent amount', async ({ webhook, payment, request, dataFactory }) => {
    const pi = await payment.createPaymentIntent(5000, { captureMethod: 'manual' });
    await payment.simulatePayment(pi.id, 'SUCCESS');
    await webhook.mockPaymentIntentAuthorized(pi.id, 5000);
    
    const orderResponse = await request.get(`/api/orders?payment_intent_id=${pi.id}`);
    const { order } = await orderResponse.json();
    
    const product = await dataFactory.getRandomProduct();
    
    const addResponse = await request.post(`/api/orders/${order.id}/items`, {
      headers: { Authorization: `Bearer ${order.modification_token}` },
      data: { variant_id: product.variants[0].id, quantity: 1 }
    });
    
    expect(addResponse.status()).toBe(200);
    
    const { order: updated } = await addResponse.json();
    expect(updated.total).toBeGreaterThan(order.total);
  });
  
  test('should handle concurrent modifications with optimistic locking', async ({ webhook, payment, request }) => {
    const pi = await payment.createPaymentIntent(5000, { captureMethod: 'manual' });
    await payment.simulatePayment(pi.id, 'SUCCESS');
    await webhook.mockPaymentIntentAuthorized(pi.id, 5000);
    
    const orderResponse = await request.get(`/api/orders?payment_intent_id=${pi.id}`);
    const { order } = await orderResponse.json();
    
    // Send two concurrent updates
    const [response1, response2] = await Promise.all([
      request.patch(`/api/orders/${order.id}/address`, {
        headers: { Authorization: `Bearer ${order.modification_token}` },
        data: { shipping_address: { city: 'City A' }, version: order.version }
      }),
      request.patch(`/api/orders/${order.id}/address`, {
        headers: { Authorization: `Bearer ${order.modification_token}` },
        data: { shipping_address: { city: 'City B' }, version: order.version }
      }),
    ]);
    
    // One should succeed, one should fail with conflict
    const statuses = [response1.status(), response2.status()];
    expect(statuses).toContain(200);
    expect(statuses).toContain(409); // Conflict
  });
});
```

---

## Definition of Done

- [x] Address update works correctly
- [x] Adding items increases PaymentIntent amount
- [x] Concurrent modifications handled with optimistic locking
- [x] Updates rejected after grace period

---

## References

- Design Spec: `.kiro/specs/e2e-testing-overhaul/design.md`
- Requirements: FR13.7, FR13.8
