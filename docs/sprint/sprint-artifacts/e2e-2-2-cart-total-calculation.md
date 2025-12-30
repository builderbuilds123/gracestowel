# Story 2-2: Create Cart Total Calculation Tests

**Epic:** Epic 2 - Cart Flow Testing  
**Status:** done
**Created:** 2025-12-14  
**Requirements:** FR15.1, FR15.2, FR15.4

---

## User Story

As a **developer**,  
I want **tests that verify cart total calculations are correct**,  
So that **customers are never charged incorrect amounts**.

---

## Acceptance Criteria

### AC1: Cart Total Calculation
**Given** a cart with multiple items  
**When** I calculate the cart total  
**Then** the total equals the sum of (item.price × item.quantity) for all items

### AC2: Discounted Price Display
**Given** items with discounted prices  
**When** I view the cart  
**Then** both original and discounted prices are displayed correctly

### AC3: Free Shipping Threshold
**Given** a cart total that qualifies for free shipping  
**When** I view shipping options  
**Then** ground shipping shows $0.00 with original price struck through

---

## Technical Context

### Price Calculation Logic
```typescript
// Cart subtotal = sum of all line item subtotals
// Line item subtotal = unit_price × quantity
// Total = subtotal + shipping - discounts + tax
```

### Price Helper Functions
From design spec:
```typescript
function toCents(amount: number): number;
function fromCents(cents: number): number;
function formatPrice(amount: number, currency?: string): string;
function calculateTotal(items: CartItem[]): number;
```

---

## Implementation Tasks

### Task 1: Create Price Calculation Tests
**File:** `apps/e2e/tests/cart/cart-totals.api.spec.ts`

```typescript
import { test, expect } from '../../fixtures';

test.describe('Cart Total Calculations', () => {
  test('should calculate correct subtotal for single item', async ({ dataFactory }) => {
    const product = await dataFactory.getRandomProduct();
    const variant = product.variants[0];
    const quantity = 2;
    
    const cart = await dataFactory.createCart([
      { variant_id: variant.id, quantity }
    ]);
    
    const expectedSubtotal = variant.price * quantity;
    expect(cart.items[0].subtotal).toBe(expectedSubtotal);
  });
  
  test('should calculate correct subtotal for multiple items', async ({ dataFactory }) => {
    const products = await dataFactory.getAvailableProducts();
    const items = [
      { variant_id: products[0].variants[0].id, quantity: 2 },
      { variant_id: products[1]?.variants[0].id || products[0].variants[1].id, quantity: 1 },
    ];
    
    const cart = await dataFactory.createCart(items);
    
    const expectedTotal = cart.items.reduce(
      (sum, item) => sum + item.subtotal, 
      0
    );
    
    expect(cart.subtotal).toBe(expectedTotal);
  });
  
  test('should update total when quantity changes', async ({ dataFactory, request }) => {
    const product = await dataFactory.getRandomProduct();
    const variant = product.variants[0];
    
    const cart = await dataFactory.createCart([
      { variant_id: variant.id, quantity: 1 }
    ]);
    
    const initialTotal = cart.subtotal;
    
    // Update quantity to 3
    const response = await request.post(
      `/store/carts/${cart.id}/line-items/${cart.items[0].id}`,
      { data: { quantity: 3 } }
    );
    
    const { cart: updatedCart } = await response.json();
    expect(updatedCart.subtotal).toBe(initialTotal * 3);
  });
});
```

### Task 2: Create Discount Display Tests
**File:** `apps/e2e/tests/cart/cart-discounts.spec.ts`

```typescript
import { test, expect } from '../../fixtures';

test.describe('Cart Discount Display', () => {
  test('should display original and discounted prices', async ({ page, dataFactory }) => {
    // Find a product with a sale price (if available)
    const products = await dataFactory.getAvailableProducts();
    const saleProduct = products.find(p => 
      p.variants.some(v => v.original_price && v.original_price > v.price)
    );
    
    if (!saleProduct) {
      test.skip();
      return;
    }
    
    await page.goto(`/products/${saleProduct.handle}`);
    await page.getByRole('button', { name: /add to cart/i }).click();
    
    // Open cart drawer
    await page.getByRole('button', { name: /cart/i }).click();
    
    // Verify both prices shown
    const originalPrice = page.locator('[data-testid="original-price"]');
    const salePrice = page.locator('[data-testid="sale-price"]');
    
    await expect(originalPrice).toBeVisible();
    await expect(salePrice).toBeVisible();
    await expect(originalPrice).toHaveCSS('text-decoration', /line-through/);
  });
});
```

### Task 3: Create Shipping Threshold Tests
**File:** `apps/e2e/tests/cart/shipping-threshold.spec.ts`

```typescript
import { test, expect } from '../../fixtures';

const FREE_SHIPPING_THRESHOLD = 10000; // $100 in cents

test.describe('Free Shipping Threshold', () => {
  test('should show free shipping when cart exceeds threshold', async ({ page, dataFactory }) => {
    // Create cart with items exceeding threshold
    const products = await dataFactory.getAvailableProducts();
    const expensiveVariant = products
      .flatMap(p => p.variants)
      .find(v => v.price >= FREE_SHIPPING_THRESHOLD);
    
    if (!expensiveVariant) {
      // Add multiple items to exceed threshold
      const cart = await dataFactory.createCart([
        { variant_id: products[0].variants[0].id, quantity: 10 }
      ]);
    }
    
    await page.goto('/checkout');
    
    // Verify free shipping option
    const freeShipping = page.locator('[data-testid="shipping-option-ground"]');
    await expect(freeShipping).toContainText('$0.00');
    await expect(freeShipping.locator('.original-price')).toHaveCSS('text-decoration', /line-through/);
  });
  
  test('should show regular shipping below threshold', async ({ page, dataFactory }) => {
    const product = await dataFactory.getRandomProduct();
    const cheapVariant = product.variants.find(v => v.price < FREE_SHIPPING_THRESHOLD / 2);
    
    if (!cheapVariant) {
      test.skip();
      return;
    }
    
    await dataFactory.createCart([
      { variant_id: cheapVariant.id, quantity: 1 }
    ]);
    
    await page.goto('/checkout');
    
    // Verify shipping has a cost
    const shippingCost = page.locator('[data-testid="shipping-cost"]');
    const costText = await shippingCost.textContent();
    expect(costText).not.toBe('$0.00');
  });
});
```

---

## Definition of Done

- [x] Single item subtotal calculation test passes
- [x] Multiple items total calculation test passes
- [x] Quantity update recalculates total correctly
- [x] Discounted prices display both original and sale price
- [x] Free shipping threshold displays correctly
- [x] Regular shipping displays when below threshold
- [x] All calculations match expected values

---

## References

- Design Spec: `.kiro/specs/e2e-testing-overhaul/design.md`
- Requirements: FR15.1, FR15.2, FR15.4
- Property 1: Cart State Consistency
