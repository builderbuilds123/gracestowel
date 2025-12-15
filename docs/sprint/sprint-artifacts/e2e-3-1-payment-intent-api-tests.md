# Story 3-1: Create PaymentIntent API Test Suite

**Epic:** Epic 3 - Payment Intent Flow Testing  
**Status:** drafted  
**Created:** 2025-12-14  
**Requirements:** FR12.4, FR12.5, FR14.3

---

## User Story

As a **developer**,  
I want **API tests that verify PaymentIntent creation and updates**,  
So that **payment amounts are always correct and idempotency is maintained**.

---

## Acceptance Criteria

### AC1: PaymentIntent Amount Calculation
**Given** a cart with items  
**When** I create a PaymentIntent via the API  
**Then** the PaymentIntent amount equals (cartTotal + shippingCost) × 100 cents

### AC2: PaymentIntent Update (Not Recreate)
**Given** an existing PaymentIntent  
**When** I update the cart and call the payment-intent API  
**Then** the same PaymentIntent is updated (not recreated)  
**And** the clientSecret remains the same

### AC3: Idempotency Key Handling
**Given** a PaymentIntent creation request  
**When** I send the same idempotency key twice  
**Then** Stripe returns the same PaymentIntent without creating a duplicate

---

## Technical Context

### API Endpoint
- `POST /api/payment-intent` - Create or update PaymentIntent

### PaymentIntent Structure
```typescript
interface PaymentIntentResponse {
  paymentIntentId: string;
  clientSecret: string;
  amount: number;
  status: string;
}
```

### Amount Calculation
```
amount_in_cents = (cart_subtotal + shipping_cost) * 100
```

---

## Implementation Tasks

### Task 1: Create PaymentIntent API Tests
**File:** `apps/e2e/tests/payment/payment-intent.api.spec.ts`

```typescript
import { test, expect } from '../../fixtures';

test.describe('PaymentIntent API', () => {
  test('should create PaymentIntent with correct amount', async ({ dataFactory, request }) => {
    const product = await dataFactory.getRandomProduct();
    const variant = product.variants[0];
    
    const cart = await dataFactory.createCart([
      { variant_id: variant.id, quantity: 2 }
    ]);
    
    // Add shipping address to cart
    await request.post(`/store/carts/${cart.id}`, {
      data: {
        shipping_address: dataFactory.generateAddress(),
      }
    });
    
    // Create PaymentIntent
    const response = await request.post('/api/payment-intent', {
      data: { cartId: cart.id }
    });
    
    const { paymentIntentId, amount, clientSecret } = await response.json();
    
    expect(paymentIntentId).toMatch(/^pi_/);
    expect(clientSecret).toMatch(/^pi_.*_secret_/);
    
    // Amount should be cart subtotal + shipping in cents
    const expectedAmount = cart.subtotal + (cart.shipping_total || 0);
    expect(amount).toBe(expectedAmount);
  });
  
  test('should update existing PaymentIntent on cart change', async ({ dataFactory, request }) => {
    const product = await dataFactory.getRandomProduct();
    const variant = product.variants[0];
    
    // Create cart and initial PaymentIntent
    const cart = await dataFactory.createCart([
      { variant_id: variant.id, quantity: 1 }
    ]);
    
    await request.post(`/store/carts/${cart.id}`, {
      data: { shipping_address: dataFactory.generateAddress() }
    });
    
    const initialResponse = await request.post('/api/payment-intent', {
      data: { cartId: cart.id }
    });
    const initial = await initialResponse.json();
    
    // Update cart quantity
    await request.post(`/store/carts/${cart.id}/line-items/${cart.items[0].id}`, {
      data: { quantity: 3 }
    });
    
    // Call payment-intent again
    const updatedResponse = await request.post('/api/payment-intent', {
      data: { cartId: cart.id }
    });
    const updated = await updatedResponse.json();
    
    // Same PaymentIntent, same clientSecret
    expect(updated.paymentIntentId).toBe(initial.paymentIntentId);
    expect(updated.clientSecret).toBe(initial.clientSecret);
    
    // Amount should be updated
    expect(updated.amount).toBe(initial.amount * 3);
  });
  
  test('should handle idempotency key correctly', async ({ dataFactory, request, payment }) => {
    const idempotencyKey = `test_${Date.now()}_${Math.random()}`;
    
    const pi1 = await payment.createPaymentIntent(5000, {
      metadata: { idempotency_key: idempotencyKey }
    });
    
    // Second call with same key should return same PI
    const pi2 = await payment.createPaymentIntent(5000, {
      metadata: { idempotency_key: idempotencyKey }
    });
    
    expect(pi2.id).toBe(pi1.id);
  });
});
```

### Task 2: Create PaymentIntent Status Tests
**File:** `apps/e2e/tests/payment/payment-intent-status.api.spec.ts`

```typescript
import { test, expect } from '../../fixtures';

test.describe('PaymentIntent Status Transitions', () => {
  test('should create PaymentIntent in requires_payment_method status', async ({ payment }) => {
    const pi = await payment.createPaymentIntent(5000);
    
    expect(pi.status).toBe('requires_payment_method');
  });
  
  test('should transition to requires_capture after confirmation', async ({ payment }) => {
    const pi = await payment.createPaymentIntent(5000, {
      captureMethod: 'manual'
    });
    
    const result = await payment.simulatePayment(pi.id, 'SUCCESS');
    
    expect(result.success).toBe(true);
    expect(result.status).toBe('requires_capture');
  });
  
  test('should handle declined payment', async ({ payment }) => {
    const pi = await payment.createPaymentIntent(5000);
    
    const result = await payment.simulatePayment(pi.id, 'DECLINE_GENERIC');
    
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });
});
```

### Task 3: Create Amount Validation Tests
**File:** `apps/e2e/tests/payment/payment-amount-validation.api.spec.ts`

```typescript
import { test, expect } from '../../fixtures';

test.describe('PaymentIntent Amount Validation', () => {
  test('should reject zero amount', async ({ payment }) => {
    await expect(payment.createPaymentIntent(0)).rejects.toThrow();
  });
  
  test('should reject negative amount', async ({ payment }) => {
    await expect(payment.createPaymentIntent(-100)).rejects.toThrow();
  });
  
  test('should handle minimum amount (50 cents)', async ({ payment }) => {
    const pi = await payment.createPaymentIntent(50);
    expect(pi.amount).toBe(50);
  });
  
  test('should handle large amounts', async ({ payment }) => {
    const largeAmount = 999999999; // $9,999,999.99
    const pi = await payment.createPaymentIntent(largeAmount);
    expect(pi.amount).toBe(largeAmount);
  });
});
```

---

## Definition of Done

- [ ] PaymentIntent creation returns correct amount
- [ ] PaymentIntent update preserves ID and clientSecret
- [ ] Idempotency key prevents duplicate creation
- [ ] Status transitions work correctly
- [ ] Amount validation rejects invalid values
- [ ] All tests use fixtures for cleanup
- [ ] Tests are isolated and can run in parallel

---

## References

- Design Spec: `.kiro/specs/e2e-testing-overhaul/design.md`
- Requirements: FR12.4, FR12.5, FR14.3
- Stripe PaymentIntent API: https://stripe.com/docs/api/payment_intents
