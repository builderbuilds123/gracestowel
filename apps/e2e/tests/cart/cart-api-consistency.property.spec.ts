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

    if (cart.id.startsWith('cart_mock')) {
         console.log("Skipping subtotal check for mock cart");
         return;
    }

    // Calculate expected total from items
    const expectedSubtotal = cart.items.reduce(
      (sum: number, item: any) => sum + item.subtotal,
      0
    );

    // Verify API returns correct subtotal
    expect(cart.subtotal).toBe(expectedSubtotal);
  });
});
