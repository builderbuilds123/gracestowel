# Story 6-2: Create Fallback Capture Test Suite

**Epic:** Epic 6 - Payment Capture Flow Testing  
**Status:** drafted  
**Created:** 2025-12-14  
**Requirements:** FR14.4, FR14.5

---

## User Story

As a **developer**,  
I want **tests that verify fallback capture handles missed jobs**,  
So that **no payments are left uncaptured**.

---

## Acceptance Criteria

### AC1: Recovery Flag Capture
**Given** an order with `needs_recovery` flag  
**When** the fallback capture cron runs  
**Then** the payment is captured

### AC2: Stale PaymentIntent Capture
**Given** an order with PaymentIntent in `requires_capture` for >65 minutes  
**When** the fallback capture cron runs  
**Then** the payment is captured

### AC3: Redis Unavailability Handling
**Given** Redis is unavailable during order creation  
**When** the order is created  
**Then** the order is flagged with `needs_recovery` metadata

---

## Implementation Tasks

### Task 1: Create Fallback Capture Tests
**File:** `apps/e2e/tests/payment/fallback-capture.api.spec.ts`

```typescript
import { test, expect } from '../../fixtures';

test.describe('Fallback Capture', () => {
  test('should capture orders with needs_recovery flag', async ({ request }) => {
    // Create order with needs_recovery flag
    const createResponse = await request.post('/api/test/orders/create-with-recovery-flag');
    const { order } = await createResponse.json();
    
    expect(order.needs_recovery).toBe(true);
    
    // Trigger fallback capture cron
    const cronResponse = await request.post('/api/test/trigger-fallback-capture');
    expect(cronResponse.status()).toBe(200);
    
    // Verify order was captured
    const orderResponse = await request.get(`/api/orders/${order.id}`);
    const { order: updated } = await orderResponse.json();
    
    expect(updated.status).toBe('captured');
    expect(updated.needs_recovery).toBe(false);
  });
  
  test('should capture stale PaymentIntents', async ({ request, payment }) => {
    // Create order with old timestamp (>65 min)
    const createResponse = await request.post('/api/test/orders/create-stale', {
      data: { minutes_old: 70 }
    });
    const { order } = await createResponse.json();
    
    // Trigger fallback capture
    const cronResponse = await request.post('/api/test/trigger-fallback-capture');
    expect(cronResponse.status()).toBe(200);
    
    // Verify captured
    const orderResponse = await request.get(`/api/orders/${order.id}`);
    const { order: updated } = await orderResponse.json();
    
    expect(updated.status).toBe('captured');
  });
  
  test('should flag order when Redis unavailable', async ({ request }) => {
    // Simulate Redis failure during order creation
    const response = await request.post('/api/test/orders/create-with-redis-failure');
    const { order } = await response.json();
    
    expect(order.needs_recovery).toBe(true);
    expect(order.metadata.redis_failure).toBe('true');
  });
});
```

---

## Definition of Done

- [ ] Orders with needs_recovery flag are captured
- [ ] Stale PaymentIntents (>65 min) are captured
- [ ] Redis failures flag orders for recovery
- [ ] Fallback cron processes all eligible orders

---

## References

- Design Spec: `.kiro/specs/e2e-testing-overhaul/design.md`
- Requirements: FR14.4, FR14.5
- Property 13: Fallback Capture Recovery
