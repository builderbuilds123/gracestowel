# Story 2-1: Create Cart API Test Suite

**Epic:** Epic 2 - Cart Flow Testing  
**Status:** drafted  
**Created:** 2025-12-14  
**Requirements:** FR2.2, FR12.1

---

## User Story

As a **developer**,  
I want **API tests that verify cart add, update, and remove operations**,  
So that **I can ensure cart functionality works correctly without UI dependencies**.

---

## Acceptance Criteria

### AC1: Add Product to Cart
**Given** an empty cart  
**When** I add a product via the cart API  
**Then** the cart contains the product with correct quantity

### AC2: Update Cart Item Quantity
**Given** a cart with items  
**When** I update the quantity of an item  
**Then** the cart reflects the new quantity

### AC3: Remove Item from Cart
**Given** a cart with items  
**When** I remove an item  
**Then** the item is no longer in the cart

### AC4: Cart Persistence
**Given** a cart with items  
**When** I reload the page  
**Then** the cart items are restored from localStorage

---

## Technical Context

### API Endpoints
- `POST /store/carts` - Create cart
- `POST /store/carts/:id/line-items` - Add item
- `POST /store/carts/:id/line-items/:item_id` - Update item
- `DELETE /store/carts/:id/line-items/:item_id` - Remove item
- `GET /store/carts/:id` - Get cart

### Cart State Structure
```typescript
interface Cart {
  id: string;
  items: CartItem[];
  subtotal: number;
  total: number;
  region_id: string;
}

interface CartItem {
  id: string;
  variant_id: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}
```

---

## Implementation Tasks

### Task 1: Create Cart API Test File
**File:** `apps/e2e/tests/cart/cart-operations.api.spec.ts`

```typescript
import { test, expect } from '../../fixtures';

test.describe('Cart API Operations', () => {
  test('should create empty cart', async ({ dataFactory, request }) => {
    const cart = await dataFactory.createCart();
    
    expect(cart.id).toBeTruthy();
    expect(cart.items).toHaveLength(0);
  });
  
  test('should add product to cart', async ({ dataFactory, request }) => {
    const product = await dataFactory.getRandomProduct();
    const variant = product.variants[0];
    
    const cart = await dataFactory.createCart([
      { variant_id: variant.id, quantity: 1 }
    ]);
    
    expect(cart.items).toHaveLength(1);
    expect(cart.items[0].variant_id).toBe(variant.id);
    expect(cart.items[0].quantity).toBe(1);
  });
  
  test('should update item quantity', async ({ dataFactory, request }) => {
    const product = await dataFactory.getRandomProduct();
    const variant = product.variants[0];
    
    const cart = await dataFactory.createCart([
      { variant_id: variant.id, quantity: 1 }
    ]);
    
    // Update quantity
    const response = await request.post(
      `/store/carts/${cart.id}/line-items/${cart.items[0].id}`,
      { data: { quantity: 3 } }
    );
    
    const { cart: updatedCart } = await response.json();
    expect(updatedCart.items[0].quantity).toBe(3);
  });
  
  test('should remove item from cart', async ({ dataFactory, request }) => {
    const product = await dataFactory.getRandomProduct();
    const variant = product.variants[0];
    
    const cart = await dataFactory.createCart([
      { variant_id: variant.id, quantity: 1 }
    ]);
    
    // Remove item
    const response = await request.delete(
      `/store/carts/${cart.id}/line-items/${cart.items[0].id}`
    );
    
    const { cart: updatedCart } = await response.json();
    expect(updatedCart.items).toHaveLength(0);
  });
  
  test('should handle multiple items', async ({ dataFactory, request }) => {
    const products = await dataFactory.getAvailableProducts();
    const variant1 = products[0].variants[0];
    const variant2 = products[1]?.variants[0] || products[0].variants[1];
    
    const cart = await dataFactory.createCart([
      { variant_id: variant1.id, quantity: 2 },
      { variant_id: variant2.id, quantity: 1 },
    ]);
    
    expect(cart.items).toHaveLength(2);
  });
});
```

### Task 2: Create Cart Persistence Test
**File:** `apps/e2e/tests/cart/cart-persistence.spec.ts`

```typescript
import { test, expect } from '../../fixtures';

test.describe('Cart Persistence', () => {
  test('should persist cart across page reload', async ({ page, dataFactory }) => {
    const product = await dataFactory.getRandomProduct();
    
    // Navigate to product and add to cart
    await page.goto(`/products/${product.handle}`);
    await page.getByRole('button', { name: /add to cart/i }).click();
    
    // Verify cart has item
    await page.getByRole('button', { name: /cart/i }).click();
    await expect(page.getByText(product.title)).toBeVisible();
    
    // Reload page
    await page.reload();
    
    // Verify cart still has item
    await page.getByRole('button', { name: /cart/i }).click();
    await expect(page.getByText(product.title)).toBeVisible();
  });
  
  test('should restore cart from localStorage', async ({ page, context }) => {
    // Set cart in localStorage before navigation
    const cartData = {
      id: 'cart_test_123',
      items: [{ variant_id: 'var_1', quantity: 2 }]
    };
    
    await context.addInitScript((data) => {
      localStorage.setItem('cart', JSON.stringify(data));
    }, cartData);
    
    await page.goto('/');
    
    // Cart badge should show item count
    const cartBadge = page.locator('[data-testid="cart-count"]');
    await expect(cartBadge).toContainText('2');
  });
});
```

---

## Definition of Done

- [ ] Cart creation API test passes
- [ ] Add item to cart API test passes
- [ ] Update item quantity API test passes
- [ ] Remove item from cart API test passes
- [ ] Multiple items in cart test passes
- [ ] Cart persistence across reload test passes
- [ ] All tests use DataFactory for cleanup
- [ ] Tests run in parallel without conflicts

---

## References

- Design Spec: `.kiro/specs/e2e-testing-overhaul/design.md`
- Requirements: FR2.2, FR12.1
- Medusa Cart API: https://docs.medusajs.com/api/store#carts
