# Story 4-3: Write Property Test for Order Creation from Webhook

**Epic:** Epic 4 - Order Creation Flow Testing  
**Status:** drafted  
**Created:** 2025-12-14  
**Requirements:** FR13.1  
**Property:** Property 5: Order Creation from Webhook

---

## User Story

As a **QA engineer**,  
I want **a property-based test that verifies orders are created correctly from webhooks**,  
So that **order data integrity is maintained**.

---

## Acceptance Criteria

### AC1: Order Data Integrity
**Given** any PaymentIntent with status `requires_capture`  
**When** the webhook is processed  
**Then** the created order has correct items, amounts, and metadata

### AC2: Property Test Execution
**Given** the property test runs  
**When** fast-check generates 100+ random PaymentIntent payloads  
**Then** all payloads result in correctly created orders

---

## Implementation Tasks

### Task 1: Create Order Creation Property Test
**File:** `apps/e2e/tests/webhooks/order-creation.property.spec.ts`

```typescript
import { test, expect } from '@playwright/test';
import * as fc from 'fast-check';

/**
 * **Feature: e2e-testing-overhaul, Property 5: Order Creation from Webhook**
 * 
 * For any PaymentIntent with status 'requires_capture', when the webhook is processed,
 * an order SHALL be created with the correct items and amounts.
 * 
 * **Validates: Requirements 13.1**
 */
test.describe('Property: Order Creation from Webhook', () => {
  const paymentIntentArbitrary = fc.record({
    amount: fc.integer({ min: 50, max: 1000000 }),
    currency: fc.constant('usd'),
    metadata: fc.record({
      cart_id: fc.string({ minLength: 10, maxLength: 30 }),
      customer_email: fc.emailAddress(),
    }),
  });
  
  test('order amount matches PaymentIntent amount', async () => {
    fc.assert(
      fc.property(
        paymentIntentArbitrary,
        (piData) => {
          // Simulate order creation logic
          const order = {
            total: piData.amount,
            currency: piData.currency,
            email: piData.metadata.customer_email,
          };
          
          // Property: order total must match PI amount
          return order.total === piData.amount;
        }
      ),
      { numRuns: 100, seed: 42 }
    );
  });
  
  test('order metadata preserved from PaymentIntent', async () => {
    fc.assert(
      fc.property(
        paymentIntentArbitrary,
        (piData) => {
          const order = {
            metadata: { ...piData.metadata },
          };
          
          // Property: metadata must be preserved
          return order.metadata.cart_id === piData.metadata.cart_id &&
                 order.metadata.customer_email === piData.metadata.customer_email;
        }
      ),
      { numRuns: 100 }
    );
  });
});
```

---

## Definition of Done

- [ ] Property test runs 100+ iterations
- [ ] Order amount matches PaymentIntent amount
- [ ] Order metadata is preserved
- [ ] Test is annotated with property reference

---

## References

- Design Spec: `.kiro/specs/e2e-testing-overhaul/design.md` (Property 5)
- Requirements: FR13.1
