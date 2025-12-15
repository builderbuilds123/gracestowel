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
