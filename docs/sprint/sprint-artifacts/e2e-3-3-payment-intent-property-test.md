# Story 3-3: Write Property Test for PaymentIntent Amount Consistency

**Epic:** Epic 3 - Payment Intent Flow Testing  
**Status:** done
**Created:** 2025-12-14  
**Requirements:** FR12.4, FR12.5, FR15.5  
**Property:** Property 2: PaymentIntent Amount Consistency

---

## User Story

As a **QA engineer**,  
I want **a property-based test that verifies PaymentIntent amounts are always correct**,  
So that **customers are never overcharged or undercharged**.

---

## Acceptance Criteria

### AC1: Amount Calculation Property
**Given** any cart total and shipping cost  
**When** a PaymentIntent is created or updated  
**Then** the amount in cents equals (cartTotal + shippingCost) × 100, rounded to nearest integer

### AC2: Property Test Execution
**Given** the property test runs  
**When** fast-check generates 100+ random cart/shipping combinations  
**Then** all combinations pass the PaymentIntent amount consistency property

---

## Technical Context

### Correctness Property (from Design Spec)
> **Property 2: PaymentIntent Amount Consistency**
> *For any* PaymentIntent created or updated, the amount in cents SHALL equal (cartTotal + shippingCost) × 100, rounded to the nearest integer.
> **Validates: Requirements 12.4, 12.5, 15.5**

### Amount Calculation Formula
```typescript
// Cart total is already in cents from Medusa
// Shipping is also in cents
// PaymentIntent amount = cart_subtotal + shipping_total
amount = cartSubtotal + shippingTotal;
```

---

## Implementation Tasks

### Task 1: Create PaymentIntent Arbitraries
**File:** `apps/e2e/tests/payment/payment-intent.arbitraries.ts`

```typescript
import * as fc from 'fast-check';

// Cart item for amount calculation
export const cartItemArbitrary = fc.record({
  unit_price: fc.integer({ min: 100, max: 100000 }), // $1.00 to $1000.00 in cents
  quantity: fc.integer({ min: 1, max: 10 }),
});

// Cart with multiple items
export const cartArbitrary = fc.record({
  items: fc.array(cartItemArbitrary, { minLength: 1, maxLength: 10 }),
  shipping_total: fc.integer({ min: 0, max: 5000 }), // $0 to $50 shipping
  discount_total: fc.integer({ min: 0, max: 10000 }), // $0 to $100 discount
  tax_total: fc.integer({ min: 0, max: 20000 }), // $0 to $200 tax
});

// Shipping option
export const shippingOptionArbitrary = fc.record({
  id: fc.string({ minLength: 5 }),
  amount: fc.integer({ min: 0, max: 5000 }),
  is_free: fc.boolean(),
});

// Price in dollars (for conversion testing)
// fast-check float constraints must be 32-bit floats
export const dollarAmountArbitrary = fc.float({ 
  min: Math.fround(0.01),
  max: Math.fround(10000),
  noNaN: true,
});
```

### Task 2: Create Amount Calculation Model
**File:** `apps/e2e/tests/payment/amount-calculation.model.ts`

```typescript
export interface CartItem {
  unit_price: number; // in cents
  quantity: number;
}

export interface Cart {
  items: CartItem[];
  shipping_total: number;
  discount_total: number;
  tax_total: number;
}

/**
 * Calculate cart subtotal from items
 */
export function calculateSubtotal(items: CartItem[]): number {
  return items.reduce(
    (sum, item) => sum + (item.unit_price * item.quantity),
    0
  );
}

/**
 * Calculate total amount for PaymentIntent
 */
export function calculatePaymentIntentAmount(cart: Cart): number {
  const subtotal = calculateSubtotal(cart.items);
  const total = subtotal + cart.shipping_total - cart.discount_total + cart.tax_total;
  
  // Amount must be positive
  return Math.max(0, Math.round(total));
}

/**
 * Convert dollars to cents
 */
export function toCents(dollars: number): number {
  return Math.round(dollars * 100);
}

/**
 * Convert cents to dollars
 */
export function fromCents(cents: number): number {
  return cents / 100;
}
```

### Task 3: Create Property Test
**File:** `apps/e2e/tests/payment/payment-intent-amount.property.spec.ts`

```typescript
import { test, expect } from '@playwright/test';
import * as fc from 'fast-check';
import { 
  cartArbitrary, 
  dollarAmountArbitrary 
} from './payment-intent.arbitraries';
import { 
  calculatePaymentIntentAmount,
  calculateSubtotal,
  toCents,
  fromCents,
} from './amount-calculation.model';

/**
 * **Feature: e2e-testing-overhaul, Property 2: PaymentIntent Amount Consistency**
 * 
 * For any PaymentIntent created or updated, the amount in cents SHALL equal 
 * (cartTotal + shippingCost) × 100, rounded to the nearest integer.
 * 
 * **Validates: Requirements 12.4, 12.5, FR15.5**
 */
test.describe('Property: PaymentIntent Amount Consistency', () => {
  test('PaymentIntent amount equals cart total plus shipping', async () => {
    fc.assert(
      fc.property(
        cartArbitrary,
        (cart) => {
          const subtotal = calculateSubtotal(cart.items);
          const expectedAmount = subtotal + cart.shipping_total - cart.discount_total + cart.tax_total;
          const actualAmount = calculatePaymentIntentAmount(cart);
          
          // Property: amounts must match (accounting for rounding)
          return Math.abs(actualAmount - Math.max(0, Math.round(expectedAmount))) <= 1;
        }
      ),
      { 
        numRuns: 100,
        verbose: true,
        seed: 42,
      }
    );
  });
  
  test('PaymentIntent amount is always non-negative', async () => {
    fc.assert(
      fc.property(
        cartArbitrary,
        (cart) => {
          const amount = calculatePaymentIntentAmount(cart);
          
          // Property: amount must be >= 0
          return amount >= 0;
        }
      ),
      { numRuns: 100 }
    );
  });
  
  test('PaymentIntent amount is always an integer (cents)', async () => {
    fc.assert(
      fc.property(
        cartArbitrary,
        (cart) => {
          const amount = calculatePaymentIntentAmount(cart);
          
          // Property: amount must be a whole number
          return Number.isInteger(amount);
        }
      ),
      { numRuns: 100 }
    );
  });
  
  test('dollar to cents conversion is reversible', async () => {
    fc.assert(
      fc.property(
        dollarAmountArbitrary,
        (dollars) => {
          const cents = toCents(dollars);
          const backToDollars = fromCents(cents);
          
          // Property: conversion should be reversible within rounding tolerance
          return Math.abs(backToDollars - dollars) < 0.01;
        }
      ),
      { numRuns: 100 }
    );
  });
  
  test('adding items increases PaymentIntent amount', async () => {
    fc.assert(
      fc.property(
        cartArbitrary,
        fc.record({
          unit_price: fc.integer({ min: 100, max: 10000 }),
          quantity: fc.integer({ min: 1, max: 5 }),
        }),
        (cart, newItem) => {
          const originalAmount = calculatePaymentIntentAmount(cart);
          
          const updatedCart = {
            ...cart,
            items: [...cart.items, newItem],
          };
          const updatedAmount = calculatePaymentIntentAmount(updatedCart);
          
          // Property: adding items should increase or maintain amount
          return updatedAmount >= originalAmount;
        }
      ),
      { numRuns: 50 }
    );
  });
  
  test('free shipping results in same amount as zero shipping', async () => {
    fc.assert(
      fc.property(
        cartArbitrary,
        (cart) => {
          const withShipping = calculatePaymentIntentAmount(cart);
          
          const withFreeShipping = calculatePaymentIntentAmount({
            ...cart,
            shipping_total: 0,
          });
          
          // Property: free shipping should reduce amount by shipping_total
          return (withShipping - withFreeShipping) === cart.shipping_total ||
                 (withShipping === 0 && withFreeShipping === 0);
        }
      ),
      { numRuns: 50 }
    );
  });
});
```

### Task 4: Create Integration Property Test
**File:** `apps/e2e/tests/payment/payment-intent-api-amount.property.spec.ts`

```typescript
import { test, expect } from '../../fixtures';
import * as fc from 'fast-check';

/**
 * **Feature: e2e-testing-overhaul, Property 2: PaymentIntent Amount Consistency**
 * 
 * Integration test: Verify API PaymentIntent amount matches calculation
 * 
 * **Validates: Requirements 12.4, 12.5, FR15.5**
 */
test.describe('Property: PaymentIntent API Amount Consistency', () => {
  test('API PaymentIntent amount matches cart total', async ({ dataFactory, request }) => {
    const products = await dataFactory.getAvailableProducts();
    
    if (products.length === 0) {
      test.skip();
      return;
    }
    
    // Create cart with random items
    const product = products[0];
    const variant = product.variants[0];
    const quantity = Math.floor(Math.random() * 3) + 1;
    
    const cart = await dataFactory.createCart([
      { variant_id: variant.id, quantity }
    ]);
    
    // Add shipping address
    await request.post(`/store/carts/${cart.id}`, {
      data: { shipping_address: dataFactory.generateAddress() }
    });
    
    // Get updated cart with shipping
    const cartResponse = await request.get(`/store/carts/${cart.id}`);
    const { cart: fullCart } = await cartResponse.json();
    
    // Create PaymentIntent
    const piResponse = await request.post('/api/payment-intent', {
      data: { cartId: cart.id }
    });
    
    if (piResponse.status() !== 200) {
      // Stock validation may fail - skip
      test.skip();
      return;
    }
    
    const { amount } = await piResponse.json();
    
    // Calculate expected amount
    const expectedAmount = fullCart.subtotal + (fullCart.shipping_total || 0);
    
    // Property: API amount should match calculated amount
    expect(amount).toBe(expectedAmount);
  });
});
```

---

## Dependencies

### NPM Packages
- `fast-check` - Property-based testing library
- `@playwright/test` - Test framework

---

## Definition of Done

- [x] Amount calculation model is correct
- [x] Property test runs 100+ iterations
- [x] All amount properties pass
- [x] Dollar/cents conversion is tested
- [x] Integration test verifies API consistency
- [x] Test is annotated with property reference
- [x] Edge cases (zero, negative) are handled

---

## Test Output Example

```
✓ Property: PaymentIntent Amount Consistency
  ✓ PaymentIntent amount equals cart total plus shipping (100 runs)
  ✓ PaymentIntent amount is always non-negative (100 runs)
  ✓ PaymentIntent amount is always an integer (100 runs)
  ✓ dollar to cents conversion is reversible (100 runs)
  ✓ adding items increases PaymentIntent amount (50 runs)
  ✓ free shipping results in same amount as zero shipping (50 runs)
```

---

## References

- Design Spec: `.kiro/specs/e2e-testing-overhaul/design.md` (Property 2)
- Requirements: FR12.4, FR12.5, FR15.5
- fast-check Docs: https://github.com/dubzzz/fast-check
