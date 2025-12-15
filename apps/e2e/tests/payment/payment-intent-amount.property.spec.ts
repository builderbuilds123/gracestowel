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
          // Note: calculatePaymentIntentAmount logic ensures non-negative result.
          // If discount makes total 0, then removing shipping doesn't change it from 0.
          // So difference is at most shipping_total, but could be less if total was clamped to 0.

          // Example: subtotal 100, discount 200, shipping 50. Total with shipping = 0. Total without = 0. Diff = 0 != 50.
          // So we verify logic:
          // If withShipping > 0, then diff should be shipping_total (assuming not clamped partially).

          // Let's refine the check to match logic:
          // return withShipping - withFreeShipping === cart.shipping_total;
          // This might fail for negative totals clamped to 0.

          if (withShipping === 0 && withFreeShipping === 0) return true;

          return (withShipping - withFreeShipping) === cart.shipping_total ||
                 (withShipping === 0 && withFreeShipping === 0);
        }
      ),
      { numRuns: 50 }
    );
  });
});
