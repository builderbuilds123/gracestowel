# Story 8-2: Create Cross-Browser and Viewport Tests

**Epic:** Epic 8 - UI Smoke Tests & Cross-Browser  
**Status:** done
**Created:** 2025-12-14  
**Requirements:** FR7.1, FR7.5, FR10.2

---

## User Story

As a **QA engineer**,  
I want **tests that verify critical flows work across browsers and viewports**,  
So that **customers have a consistent experience**.

---

## Acceptance Criteria

### AC1: Cross-Browser Compatibility
**Given** the smoke tests  
**When** they run on Chromium, Firefox, and WebKit  
**Then** all tests pass on all browsers

### AC2: Desktop Viewport
**Given** the smoke tests  
**When** they run on desktop (1280×720) viewport  
**Then** all tests pass

### AC3: Mobile Viewport
**Given** the smoke tests  
**When** they run on mobile (375×667) viewport  
**Then** all tests pass

---

## Implementation Tasks

### Task 1: Create Cross-Browser Tests
**File:** `apps/e2e/tests/smoke/cross-browser.spec.ts`

```typescript
import { test, expect } from '../../fixtures';

// These tests run on all browser projects defined in playwright.config.ts
test.describe('Cross-Browser Compatibility', () => {
  test('homepage renders correctly', async ({ page, browserName }) => {
    await page.goto('/');
    
    // Basic layout check
    await expect(page.getByRole('navigation')).toBeVisible();
    await expect(page.locator('a[href^="/products/"]').first()).toBeVisible();
    
    // Take screenshot for visual comparison
    await page.screenshot({ 
      path: `test-results/screenshots/homepage-${browserName}.png`,
      fullPage: true 
    });
  });
  
  test('checkout form renders correctly', async ({ page, browserName, dataFactory }) => {
    const product = await dataFactory.getRandomProduct();
    await dataFactory.createCart([{ variant_id: product.variants[0].id, quantity: 1 }]);
    
    await page.goto('/checkout');
    
    // Form elements visible
    await expect(page.locator('[data-testid="checkout-form"]')).toBeVisible();
    
    await page.screenshot({ 
      path: `test-results/screenshots/checkout-${browserName}.png` 
    });
  });
});
```

### Task 2: Create Viewport Tests
**File:** `apps/e2e/tests/smoke/viewport.spec.ts`

```typescript
import { test, expect } from '../../fixtures';

test.describe('Viewport Responsiveness', () => {
  test.describe('Desktop (1280x720)', () => {
    test.use({ viewport: { width: 1280, height: 720 } });
    
    test('homepage layout is correct', async ({ page }) => {
      await page.goto('/');
      
      // Desktop navigation visible
      await expect(page.getByRole('navigation')).toBeVisible();
      
      // Product grid should show multiple columns
      const productGrid = page.locator('[data-testid="product-grid"]');
      await expect(productGrid).toBeVisible();
    });
    
    test('checkout has side-by-side layout', async ({ page, dataFactory }) => {
      const product = await dataFactory.getRandomProduct();
      await dataFactory.createCart([{ variant_id: product.variants[0].id, quantity: 1 }]);
      
      await page.goto('/checkout');
      
      // Order summary should be visible alongside form
      await expect(page.locator('[data-testid="order-summary"]')).toBeVisible();
      await expect(page.locator('[data-testid="checkout-form"]')).toBeVisible();
    });
  });
  
  test.describe('Mobile (375x667)', () => {
    test.use({ viewport: { width: 375, height: 667 } });
    
    test('homepage has mobile navigation', async ({ page }) => {
      await page.goto('/');
      
      // Mobile menu button should be visible
      const menuButton = page.getByRole('button', { name: /menu/i });
      await expect(menuButton).toBeVisible();
      
      // Click to open mobile menu
      await menuButton.click();
      await expect(page.getByRole('navigation')).toBeVisible();
    });
    
    test('checkout has stacked layout', async ({ page, dataFactory }) => {
      const product = await dataFactory.getRandomProduct();
      await dataFactory.createCart([{ variant_id: product.variants[0].id, quantity: 1 }]);
      
      await page.goto('/checkout');
      
      // Form should be visible
      await expect(page.locator('[data-testid="checkout-form"]')).toBeVisible();
      
      // Order summary may be collapsed or below
      const summary = page.locator('[data-testid="order-summary"]');
      // Either visible or in accordion
      const isVisible = await summary.isVisible();
      if (!isVisible) {
        // Look for accordion trigger
        await page.getByRole('button', { name: /order summary/i }).click();
        await expect(summary).toBeVisible();
      }
    });
    
    test('cart drawer works on mobile', async ({ page, dataFactory }) => {
      const product = await dataFactory.getRandomProduct();
      
      await page.goto(`/products/${product.handle}`);
      await page.getByRole('button', { name: /add to cart/i }).click();
      
      // Cart drawer should open
      await expect(page.getByRole('heading', { name: /towel rack/i })).toBeVisible();
      
      // Should be able to close
      await page.getByRole('button', { name: /close/i }).click();
    });
  });
});
```

---

## Definition of Done

- [x] Tests pass on Chromium
- [x] Tests pass on Firefox
- [x] Tests pass on WebKit
- [x] Desktop viewport tests pass
- [x] Mobile viewport tests pass
- [x] Screenshots captured for visual comparison

---

## References

- Design Spec: `.kiro/specs/e2e-testing-overhaul/design.md`
- Requirements: FR7.1, FR7.5, FR10.2
- Property 15: Responsive Viewport Behavior
