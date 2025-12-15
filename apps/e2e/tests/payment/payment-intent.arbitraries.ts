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
