# Story 9.6: Integration Tests for Cart-Based Shipping

Status: Ready for Development

## Story

As a QA Engineer,
I want automated tests covering the cart-based shipping flow,
So that we can verify promotions and sync work correctly.

## Acceptance Criteria

### Promotion Calculation Tests
1. **Given** a test cart with items totaling < $99
2. **When** shipping options are fetched
3. **Then** standard shipping SHALL have a non-zero amount
4. **And** `originalAmount` SHALL equal `amount` (no discount)

5. **Given** a test cart with items totaling >= $99
6. **When** shipping options are fetched
7. **Then** standard shipping SHALL have `amount: 0`
8. **And** `originalAmount` SHALL show the original price (e.g., 895 cents)

### Cart Sync Tests
9. **Given** a cart is synced to Medusa
10. **When** items are added/removed locally
11. **Then** re-syncing SHALL update Medusa cart correctly
12. **And** shipping options SHALL reflect the new total

### Error Handling Tests
13. **Given** Medusa API is mocked to fail
14. **When** shipping options are requested
15. **Then** fallback to region-based fetch SHALL work
16. **And** no errors SHALL be shown to user

### Cart Expiration Tests
17. **Given** a cart ID references an expired cart
18. **When** shipping is requested
19. **Then** a new cart SHALL be created automatically
20. **And** items SHALL be synced to the new cart

## Test Scenarios

### Unit Tests (Vitest)

```typescript
// apps/storefront/app/services/medusa-cart.test.ts

describe('MedusaCartService', () => {
  describe('getOrCreateCart', () => {
    it('creates new cart when none exists', async () => {
      sessionStorage.clear();
      mockMedusaClient.store.cart.create.mockResolvedValue({
        cart: { id: 'cart_new_123' }
      });

      const cartId = await getOrCreateCart('reg_123', 'cad');

      expect(cartId).toBe('cart_new_123');
      expect(sessionStorage.getItem('medusa_cart_id')).toBe('cart_new_123');
    });

    it('returns existing cart ID from sessionStorage', async () => {
      sessionStorage.setItem('medusa_cart_id', 'cart_existing_456');
      mockMedusaClient.store.cart.retrieve.mockResolvedValue({
        cart: { id: 'cart_existing_456' }
      });

      const cartId = await getOrCreateCart('reg_123', 'cad');

      expect(cartId).toBe('cart_existing_456');
      expect(mockMedusaClient.store.cart.create).not.toHaveBeenCalled();
    });

    it('creates new cart when existing cart is expired (404)', async () => {
      sessionStorage.setItem('medusa_cart_id', 'cart_expired_789');
      mockMedusaClient.store.cart.retrieve.mockRejectedValue({ status: 404 });
      mockMedusaClient.store.cart.create.mockResolvedValue({
        cart: { id: 'cart_new_abc' }
      });

      const cartId = await getOrCreateCart('reg_123', 'cad');

      expect(cartId).toBe('cart_new_abc');
      expect(sessionStorage.getItem('medusa_cart_id')).toBe('cart_new_abc');
    });
  });

  describe('syncCartItems', () => {
    it('skips items without variantId', async () => {
      const items = [
        { variantId: 'var_123', quantity: 1, title: 'Towel A' },
        { variantId: undefined, quantity: 2, title: 'Towel B' }, // No variantId
        { variantId: 'var_456', quantity: 1, title: 'Towel C' }
      ];

      const result = await syncCartItems('cart_123', items);

      expect(mockMedusaClient.store.cart.createLineItem).toHaveBeenCalledTimes(2);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].reason).toBe('missing_variant_id');
    });

    it('continues after variant not found error', async () => {
      const items = [
        { variantId: 'var_valid', quantity: 1, title: 'Valid' },
        { variantId: 'var_invalid', quantity: 1, title: 'Invalid' }
      ];

      mockMedusaClient.store.cart.createLineItem
        .mockResolvedValueOnce({}) // First succeeds
        .mockRejectedValueOnce({ status: 404 }); // Second fails

      const result = await syncCartItems('cart_123', items);

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].reason).toBe('variant_not_found');
    });
  });

  describe('getShippingOptions', () => {
    it('returns mapped shipping options with originalAmount', async () => {
      mockMedusaClient.store.shippingOption.list.mockResolvedValue({
        shipping_options: [
          { id: 'so_1', name: 'Standard', amount: 0, original_amount: 895 },
          { id: 'so_2', name: 'Express', amount: 1500, original_amount: 1500 }
        ]
      });

      const options = await getShippingOptions('cart_123');

      expect(options[0].amount).toBe(0);
      expect(options[0].originalAmount).toBe(895);
      expect(options[1].amount).toBe(1500);
      expect(options[1].originalAmount).toBe(1500);
    });
  });
});
```

### API Route Tests (Vitest)

```typescript
// apps/storefront/app/routes/api.shipping-rates.test.ts

describe('POST /api/shipping-rates', () => {
  describe('cart-based fetch', () => {
    it('syncs cart items and returns shipping with promotion', async () => {
      const request = createMockRequest({
        cartItems: [{ variantId: 'var_123', quantity: 3, title: 'Towel' }],
        currency: 'CAD'
      });

      mockMedusaCartService.syncCartItems.mockResolvedValue({ cart: {}, errors: [] });
      mockMedusaCartService.getShippingOptions.mockResolvedValue([
        { id: 'so_1', name: 'Standard', amount: 0, originalAmount: 895 }
      ]);

      const response = await action({ request });
      const data = await response.json();

      expect(data.shippingOptions[0].amount).toBe(0);
      expect(data.shippingOptions[0].originalAmount).toBe(895);
      expect(data.cartId).toBeDefined();
    });

    it('falls back to region-based fetch on error', async () => {
      const request = createMockRequest({
        cartItems: [{ variantId: 'var_123', quantity: 1 }],
        currency: 'CAD'
      });

      mockMedusaCartService.syncCartItems.mockRejectedValue(new Error('API down'));
      mockRegionFetch.mockResolvedValue([
        { id: 'so_1', name: 'Standard', amount: 895 }
      ]);

      const response = await action({ request });
      const data = await response.json();

      expect(data.shippingOptions).toHaveLength(1);
      expect(data.cartId).toBeNull(); // No cart in fallback
    });
  });

  describe('backward compatibility', () => {
    it('handles old request format (subtotal only)', async () => {
      const request = createMockRequest({
        currency: 'CAD',
        subtotal: 5000
      });

      mockRegionFetch.mockResolvedValue([
        { id: 'so_1', name: 'Standard', amount: 895 }
      ]);

      const response = await action({ request });
      const data = await response.json();

      expect(data.shippingOptions).toHaveLength(1);
    });
  });
});
```

### E2E Tests (Playwright)

```typescript
// apps/storefront/tests/e2e/checkout-shipping.spec.ts

import { test, expect } from '@playwright/test';

test.describe('Cart-Based Shipping', () => {
  test('displays free shipping for cart over $99', async ({ page }) => {
    // Add items totaling > $99
    await page.goto('/products/premium-towel');
    await page.click('[data-testid="add-to-cart"]');
    await page.click('[data-testid="add-to-cart"]');
    await page.click('[data-testid="add-to-cart"]');

    // Go to checkout
    await page.goto('/checkout');

    // Wait for shipping options to load
    await page.waitForSelector('[data-testid="shipping-options"]');

    // Verify free shipping display
    const shippingOption = page.locator('[data-testid="shipping-standard"]');
    await expect(shippingOption).toContainText('FREE');
    await expect(shippingOption).toContainText('$8.95'); // Strikethrough original
  });

  test('displays regular shipping for cart under $99', async ({ page }) => {
    // Add single item < $99
    await page.goto('/products/basic-towel');
    await page.click('[data-testid="add-to-cart"]');

    // Go to checkout
    await page.goto('/checkout');

    // Wait for shipping options
    await page.waitForSelector('[data-testid="shipping-options"]');

    // Verify regular shipping price
    const shippingOption = page.locator('[data-testid="shipping-standard"]');
    await expect(shippingOption).toContainText('$8.95');
    await expect(shippingOption).not.toContainText('FREE');
  });

  test('updates shipping when address changes', async ({ page }) => {
    // Add items to cart
    await page.goto('/products/premium-towel');
    await page.click('[data-testid="add-to-cart"]');

    // Go to checkout
    await page.goto('/checkout');

    // Fill address
    await page.fill('[data-testid="address-line1"]', '123 Main St');
    await page.fill('[data-testid="address-city"]', 'Toronto');
    await page.fill('[data-testid="address-postal"]', 'M5V 1A1');
    await page.selectOption('[data-testid="address-country"]', 'CA');

    // Wait for shipping to update
    await page.waitForResponse(resp => 
      resp.url().includes('/api/shipping-rates') && resp.status() === 200
    );

    // Verify shipping options updated
    await expect(page.locator('[data-testid="shipping-options"]')).toBeVisible();
  });

  test('checkout completes even with partial cart sync failure', async ({ page }) => {
    // This test requires mocking - may need to use route interception
    await page.route('**/store/carts/*/line-items', async route => {
      const request = route.request();
      const body = JSON.parse(request.postData() || '{}');
      
      // Fail for specific variant
      if (body.variant_id === 'var_invalid') {
        await route.fulfill({ status: 404 });
      } else {
        await route.continue();
      }
    });

    // Add items and proceed to checkout
    await page.goto('/checkout');

    // Verify checkout still works
    await expect(page.locator('[data-testid="shipping-options"]')).toBeVisible();
  });
});
```

## Dev Notes

### Test Environment Setup

```typescript
// apps/storefront/vitest.config.ts additions
export default defineConfig({
  test: {
    environment: 'happy-dom',
    setupFiles: ['./tests/setup.ts'],
    globals: true
  }
});

// apps/storefront/tests/setup.ts
import { vi } from 'vitest';

// Mock sessionStorage
const sessionStorageMock = {
  store: {} as Record<string, string>,
  getItem: vi.fn((key: string) => sessionStorageMock.store[key] || null),
  setItem: vi.fn((key: string, value: string) => { sessionStorageMock.store[key] = value; }),
  removeItem: vi.fn((key: string) => { delete sessionStorageMock.store[key]; }),
  clear: vi.fn(() => { sessionStorageMock.store = {}; })
};

Object.defineProperty(window, 'sessionStorage', { value: sessionStorageMock });
```

### Mock Factories

```typescript
// apps/storefront/tests/mocks/medusa-cart.ts

export function createMockMedusaClient() {
  return {
    store: {
      cart: {
        create: vi.fn(),
        retrieve: vi.fn(),
        createLineItem: vi.fn(),
        update: vi.fn()
      },
      shippingOption: {
        list: vi.fn()
      },
      region: {
        list: vi.fn()
      }
    }
  };
}

export function createMockCartItems(count: number, withVariantId = true) {
  return Array.from({ length: count }, (_, i) => ({
    variantId: withVariantId ? `var_${i}` : undefined,
    quantity: 1,
    title: `Item ${i}`,
    price: '$35.00'
  }));
}
```

## Tasks / Subtasks

- [ ] **Setup**: Configure test environment
    - [ ] Add sessionStorage mock to setup.ts
    - [ ] Create mock factories for Medusa client
- [ ] **Unit Tests**: Create `medusa-cart.test.ts`
    - [ ] Test `getOrCreateCart` scenarios
    - [ ] Test `syncCartItems` with partial failures
    - [ ] Test `getShippingOptions` mapping
- [ ] **API Tests**: Update `api.shipping-rates.test.ts`
    - [ ] Test cart-based fetch flow
    - [ ] Test fallback behavior
    - [ ] Test backward compatibility
- [ ] **E2E Tests**: Create `checkout-shipping.spec.ts`
    - [ ] Test free shipping display
    - [ ] Test regular shipping display
    - [ ] Test address change updates
- [ ] **CI**: Ensure tests run in CI pipeline

## Testing Requirements

### Coverage Targets
- Unit test coverage: > 80%
- Integration test coverage: All happy paths + key error paths
- E2E test coverage: Critical user flows

### Test Categories

| Category | Count | Priority |
|----------|-------|----------|
| Unit - Cart Service | 8 | High |
| Unit - API Route | 5 | High |
| Integration - Full Flow | 4 | High |
| E2E - User Flows | 4 | Medium |

---

## File List

### New Files
- `apps/storefront/app/services/medusa-cart.test.ts`
- `apps/storefront/tests/e2e/checkout-shipping.spec.ts`
- `apps/storefront/tests/mocks/medusa-cart.ts`

### Modified Files
- `apps/storefront/app/routes/api.shipping-rates.test.ts`
- `apps/storefront/tests/setup.ts`

---

## Dependencies

| Dependency | Type | Notes |
|------------|------|-------|
| Stories 9.1-9.5 | Blocking | All implementation must be complete |
| Vitest | Existing | Already configured |
| Playwright | Existing | Already configured |
| Medusa Test Instance | External | Need test data with promotions |

---

## Test Data Requirements

### Medusa Backend Setup
- Free shipping promotion configured (threshold: $99)
- Test products with known prices
- Test variants with valid IDs

### Test Fixtures
- Cart with total < $99 (no free shipping)
- Cart with total >= $99 (free shipping)
- Cart with invalid variant IDs
- Expired cart ID

---

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2025-12-14 | Initial story creation from Epic 9 | PM Agent |
