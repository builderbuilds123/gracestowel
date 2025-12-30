import { test, expect } from '@playwright/test';
import * as fc from 'fast-check';
import {
  cartOperationSequenceArbitrary,
  CartOperation
} from './cart.arbitraries';
import {
  applyOperations,
  calculateCartTotal,
  applyOperation
} from './cart.model';

/**
 * **Feature: e2e-testing-overhaul, Property 1: Cart State Consistency**
 *
 * For any sequence of cart operations (add, update, remove),
 * the cart total SHALL equal the sum of (item.price × item.quantity)
 * for all items in the cart.
 *
 * **Validates: Requirements 12.1, 15.1**
 */
test.describe('Property: Cart State Consistency', () => {
  test('cart total equals sum of item prices for any operation sequence', async () => {
    fc.assert(
      fc.property(
        cartOperationSequenceArbitrary,
        (operations: CartOperation[]) => {
          // Apply all operations to get final state
          const finalState = applyOperations(operations);

          // Calculate expected total
          const expectedTotal = calculateCartTotal(finalState.items);

          // Calculate actual total (simulating what the cart would compute)
          const actualTotal = finalState.items.reduce(
            (sum, item) => sum + (item.unit_price * item.quantity),
            0
          );

          // Property: totals must match
          return expectedTotal === actualTotal;
        }
      ),
      {
        numRuns: 100,
        verbose: true,
        seed: 42, // Reproducible runs
      }
    );
  });

  test('cart total is non-negative for any operation sequence', async () => {
    fc.assert(
      fc.property(
        cartOperationSequenceArbitrary,
        (operations: CartOperation[]) => {
          const finalState = applyOperations(operations);
          const total = calculateCartTotal(finalState.items);

          // Property: total must be >= 0
          return total >= 0;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('removing all items results in zero total', async () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            type: fc.constant('add' as const),
            item: fc.record({
              variant_id: fc.string({ minLength: 5 }),
              quantity: fc.integer({ min: 1, max: 5 }),
              unit_price: fc.integer({ min: 100, max: 10000 }),
            }),
          }),
          { minLength: 1, maxLength: 5 }
        ),
        (addOperations) => {
          // Add items
          // We need to cast the addOperations to CartOperation[] because Typescript might infer specific structure
          let state = applyOperations(addOperations as any);

          // Remove all items
          while (state.items.length > 0) {
            state = applyOperation(state, { type: 'remove', index: 0 });
          }

          // Property: empty cart has zero total
          return calculateCartTotal(state.items) === 0;
        }
      ),
      { numRuns: 50 }
    );
  });
});
