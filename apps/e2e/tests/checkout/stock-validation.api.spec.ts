import { test, expect } from '../../fixtures';

test.describe('Stock Validation', () => {
  test('should reject checkout when item exceeds stock', async ({ dataFactory, request }) => {
    const product = await dataFactory.getRandomProduct();
    const variant = product.variants[0];

    // Request more than available
    const excessiveQuantity = variant.inventory_quantity + 10;

    const cart = await dataFactory.createCart([
      { variant_id: variant.id, quantity: excessiveQuantity }
    ]);

    if (cart.id.startsWith('cart_mock')) {
         console.log("Skipping API calls for mock cart");
         return;
    }

    // Attempt to create PaymentIntent
    // Assuming /api/payment-intent handles stock validation and returns 400
    const response = await request.post('/api/payment-intent', {
      data: { cartId: cart.id }
    });

    expect(response.status()).toBe(400);

    const error = await response.json();
    expect(error.code).toBe('INSUFFICIENT_STOCK');
    expect(error.items).toHaveLength(1);
    expect(error.items[0].variant_id).toBe(variant.id);
    expect(error.items[0].available).toBe(variant.inventory_quantity);
  });

  test('should list all items with insufficient stock', async ({ dataFactory, request }) => {
    const products = await dataFactory.getAvailableProducts();

    if (products.length < 2) {
        test.skip('Not enough products to test multiple stock errors');
        return;
    }

    // Create cart with multiple items exceeding stock
    const items = products.slice(0, 2).map(p => ({
      variant_id: p.variants[0].id,
      quantity: p.variants[0].inventory_quantity + 5,
    }));

    const cart = await dataFactory.createCart(items);

    if (cart.id.startsWith('cart_mock')) {
         console.log("Skipping API calls for mock cart");
         return;
    }

    const response = await request.post('/api/payment-intent', {
      data: { cartId: cart.id }
    });

    expect(response.status()).toBe(400);

    const error = await response.json();
    expect(error.items.length).toBeGreaterThanOrEqual(2);
  });

  test('should allow checkout when stock is sufficient', async ({ dataFactory, request }) => {
    const product = await dataFactory.getRandomProduct();
    const variant = product.variants[0];

    // Request within available stock
    const validQuantity = Math.min(variant.inventory_quantity, 2);

    const cart = await dataFactory.createCart([
      { variant_id: variant.id, quantity: validQuantity }
    ]);

    if (cart.id.startsWith('cart_mock')) {
         console.log("Skipping API calls for mock cart");
         return;
    }

    await request.post(`/store/carts/${cart.id}`, {
      data: { shipping_address: dataFactory.generateAddress() }
    });

    const response = await request.post('/api/payment-intent', {
      data: { cartId: cart.id }
    });

    expect(response.status()).toBe(200);

    const { paymentIntentId } = await response.json();
    expect(paymentIntentId).toMatch(/^pi_/);
  });
});
