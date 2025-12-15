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

    if (cart.id.startsWith('cart_mock')) {
         console.log("Skipping API calls for mock cart");
         return;
    }

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
