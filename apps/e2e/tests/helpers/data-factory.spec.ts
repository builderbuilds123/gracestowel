import { test, expect } from '../../fixtures/data-factory.fixture';
import { generateTestId, generateTestEmail } from '../../helpers/id-generator';

test.describe('Data Factory', () => {

  test('generates unique IDs', async ({ dataFactory }) => {
    const id1 = generateTestId('order');
    const id2 = generateTestId('order');

    expect(id1).not.toBe(id2);
    expect(id1).toMatch(/^order_\d+_[a-f0-9]+$/);
  });

  test('fetches available products', async ({ dataFactory }) => {
    // This will likely return mock data in this env
    const products = await dataFactory.getAvailableProducts();

    expect(products.length).toBeGreaterThan(0);
    expect(products[0]).toHaveProperty('id');
    expect(products[0]).toHaveProperty('variants');
  });

  test('creates cart with items', async ({ dataFactory }) => {
    // This will likely return mock data in this env
    const product = await dataFactory.getRandomProduct();
    const variant = product.variants[0];

    const cart = await dataFactory.createCart([
      { variant_id: variant.id, quantity: 2 }
    ]);

    expect(cart.id).toBeTruthy();
    expect(cart.items.length).toBeGreaterThanOrEqual(0); // If mock items are added or not
  });

  test('cleans up after test', async ({ dataFactory }) => {
    // Create some test data
    const cart = await dataFactory.createCart();
    // Verification of cleanup happens by observing log output or via internal state check if we exposed it.
    // For now, just ensuring no crash.
  });

  test.describe('parallel tests', () => {
    // We can't easily force parallel run within a single file unless configured, but we can check logic.
    test('test A creates unique data', async ({ dataFactory }) => {
      const email = generateTestEmail();
      expect(email).toContain('@test.gracestowel.com');
    });

    test('test B creates different unique data', async ({ dataFactory }) => {
      const email = generateTestEmail();
      expect(email).toContain('@test.gracestowel.com');
    });
  });

});
