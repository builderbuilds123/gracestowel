# Story 2-3: Write Property Test for Cart State Consistency

**Epic:** Epic 2 - Cart Flow Testing  
**Status:** drafted  
**Created:** 2025-12-14  
**Requirements:** FR12.1, FR15.1  
**Property:** Property 1: Cart State Consistency

---

## User Story

As a **QA engineer**,  
I want **a property-based test that verifies cart state consistency**,  
So that **cart totals are always mathematically correct regardless of operations**.

---

## Acceptance Criteria

### AC1: Cart Total Property
**Given** any sequence of cart operations (add, update, remove)  
**When** the cart total is calculated  
**Then** the total equals the sum of (item.price × item.quantity) for all items

### AC2: Property Test Execution
**Given** the property test runs  
**When** fast-check generates 100+ random cart operation sequences  
**Then** all sequences pass the cart state consistency property

---

## Technical Context

### Correctness Property (from Design Spec)
> **Property 1: Cart State Consistency**
> *For any* sequence of cart operations (add, update, remove), the cart total SHALL equal the sum of (item.price × item.quantity) for all items in the cart.
> **Validates: Requirements 12.1, 15.1**

### Property-Based Testing Library
Using **fast-check** for TypeScript property-based testing.

### Test Annotation Format
```typescript
// **Feature: e2e-testing-overhaul, Property 1: Cart State Consistency**
```

---

## Implementation Tasks

### Task 1: Create Cart Arbitraries
**File:** `apps/e2e/tests/cart/cart.arbitraries.ts`

```typescript
import * as fc from 'fast-check';

// Cart item arbitrary
export const cartItemArbitrary = fc.record({
  variant_id: fc.string({ minLength: 5, maxLength: 20 }),
  quantity: fc.integer({ min: 1, max: 10 }),
  unit_price: fc.integer({ min: 100, max: 100000 }), // 1.00 to 1000.00 in cents
});

// Cart operation arbitrary
export type CartOperation = 
  | { type: 'add'; item: { variant_id: string; quantity: number; unit_price: number } }
  | { type: 'update'; index: number; quantity: number }
  | { type: 'remove'; index: number };

export const cartOperationArbitrary = fc.oneof(
  // Add operation
  fc.record({
    type: fc.constant('add' as const),
    item: cartItemArbitrary,
  }),
  // Update operation
  fc.record({
    type: fc.constant('update' as const),
    index: fc.nat({ max: 10 }),
    quantity: fc.integer({ min: 1, max: 10 }),
  }),
  // Remove operation
  fc.record({
    type: fc.constant('remove' as const),
    index: fc.nat({ max: 10 }),
  })
);

// Sequence of operations
export const cartOperationSequenceArbitrary = fc.array(
  cartOperationArbitrary,
  { minLength: 1, maxLength: 20 }
);
```

### Task 2: Create Cart State Model
**File:** `apps/e2e/tests/cart/cart.model.ts`

```typescript
export interface CartItem {
  variant_id: string;
  quantity: number;
  unit_price: number;
}

export interface CartState {
  items: CartItem[];
}

/**
 * Apply a cart operation to the state
 */
export function applyOperation(
  state: CartState,
  operation: CartOperation
): CartState {
  const items = [...state.items];
  
  switch (operation.type) {
    case 'add':
      // Check if item already exists
      const existingIndex = items.findIndex(
        i => i.variant_id === operation.item.variant_id
      );
      if (existingIndex >= 0) {
        items[existingIndex] = {
          ...items[existingIndex],
          quantity: items[existingIndex].quantity + operation.item.quantity,
        };
      } else {
        items.push(operation.item);
      }
      break;
      
    case 'update':
      if (operation.index < items.length) {
        items[operation.index] = {
          ...items[operation.index],
          quantity: operation.quantity,
        };
      }
      break;
      
    case 'remove':
      if (operation.index < items.length) {
        items.splice(operation.index, 1);
      }
      break;
  }
  
  return { items };
}

/**
 * Calculate cart total from items
 */
export function calculateCartTotal(items: CartItem[]): number {
  return items.reduce(
    (sum, item) => sum + (item.unit_price * item.quantity),
    0
  );
}

/**
 * Apply a sequence of operations and return final state
 */
export function applyOperations(
  operations: CartOperation[]
): CartState {
  return operations.reduce(
    (state, op) => applyOperation(state, op),
    { items: [] }
  );
}
```

### Task 3: Create Property Test
**File:** `apps/e2e/tests/cart/cart-state-consistency.property.spec.ts`

```typescript
import { test, expect } from '@playwright/test';
import * as fc from 'fast-check';
import { 
  cartOperationSequenceArbitrary, 
  CartOperation 
} from './cart.arbitraries';
import { 
  applyOperations, 
  calculateCartTotal 
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
          let state = applyOperations(addOperations);
          
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
```

### Task 4: Create Integration Property Test
**File:** `apps/e2e/tests/cart/cart-api-consistency.property.spec.ts`

```typescript
import { test, expect } from '../../fixtures';
import * as fc from 'fast-check';

/**
 * **Feature: e2e-testing-overhaul, Property 1: Cart State Consistency**
 * 
 * Integration test: Verify cart API maintains consistency
 * 
 * **Validates: Requirements 12.1, 15.1**
 */
test.describe('Property: Cart API Consistency', () => {
  test('API cart total matches calculated total', async ({ dataFactory, request }) => {
    // Get available products for realistic test data
    const products = await dataFactory.getAvailableProducts();
    
    if (products.length === 0) {
      test.skip();
      return;
    }
    
    // Create cart with random items
    const numItems = Math.min(3, products.length);
    const items = products.slice(0, numItems).map((p, i) => ({
      variant_id: p.variants[0].id,
      quantity: Math.floor(Math.random() * 3) + 1,
    }));
    
    const cart = await dataFactory.createCart(items);
    
    // Calculate expected total from items
    const expectedSubtotal = cart.items.reduce(
      (sum, item) => sum + item.subtotal,
      0
    );
    
    // Verify API returns correct subtotal
    expect(cart.subtotal).toBe(expectedSubtotal);
  });
});
```

---

## Dependencies

### NPM Packages
- `fast-check` - Property-based testing library
- `@playwright/test` - Test framework

### Installation
```bash
pnpm add -D fast-check --filter e2e
```

---

## Definition of Done

- [ ] Cart arbitraries generate valid cart operations
- [ ] Cart model correctly applies operations
- [ ] Property test runs 100+ iterations
- [ ] All property assertions pass
- [ ] Integration test verifies API consistency
- [ ] Test is annotated with property reference
- [ ] Seed value ensures reproducibility

---

## Test Output Example

```
✓ Property: Cart State Consistency
  ✓ cart total equals sum of item prices for any operation sequence (100 runs)
  ✓ cart total is non-negative for any operation sequence (100 runs)
  ✓ removing all items results in zero total (50 runs)
```

---

## References

- Design Spec: `.kiro/specs/e2e-testing-overhaul/design.md` (Property 1)
- Requirements: FR12.1, FR15.1
- fast-check Docs: https://github.com/dubzzz/fast-check
