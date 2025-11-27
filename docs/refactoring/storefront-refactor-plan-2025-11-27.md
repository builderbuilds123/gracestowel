# Grace Stowel Storefront Refactoring Plan

**Date**: 2025-11-27  
**Scope**: `apps/storefront` (React Router v7 + Cloudflare Workers)  
**Status**: Draft

---

## Executive Summary

This refactoring plan addresses technical debt, code smells, and architectural improvements in the Grace Stowel storefront. The primary goals are:

1. **Type Safety**: Fix type mismatches between legacy numeric IDs and Medusa string IDs
2. **Code Organization**: Extract reusable logic and reduce component complexity
3. **Duplication Removal**: Consolidate repeated patterns across routes and components
4. **Data Layer Consistency**: Unify product data access patterns
5. **Performance**: Optimize re-renders and data fetching

---

## Current State Analysis

### 1. Type System Issues (Critical)

**Problem**: The codebase has a hybrid ID system causing type errors and potential runtime bugs.

| Location | Issue |
|----------|-------|
| `CartContext.tsx:108` | `removeFromCart(id: number)` but `CartItem.id` is `string \| number` |
| `CartContext.tsx:117` | `updateQuantity(id: number)` same issue |
| `CartContext.tsx:26-27` | Interface declares `id: string \| number` but functions expect `number` |
| `data/products.ts` | Uses numeric `id: 1, 2, 3, 4` |
| Medusa API | Returns string IDs like `"prod_01HXY..."` |

**Impact**: TypeScript errors, potential cart bugs when mixing Medusa and static products.

### 2. Large Component Files (Major)

| Component | Lines | Responsibility Violations |
|-----------|-------|---------------------------|
| `products.$handle.tsx` | 639 | Data fetching, transformation, reviews, SEO, embroidery state, cart |
| `checkout.tsx` | 290 | Payment intent creation, shipping calculation, cart summary, form |
| `CartDrawer.tsx` | 160 | Cart display, quantity controls, embroidery preview, free gift logic |

### 3. Duplicated Logic (Major)

**Price Parsing**: Repeated `parseFloat(item.price.replace('$', ''))` pattern:
- `CartContext.tsx:68, 137-138`
- `checkout.tsx:22-27`

**Product Transformation**: Similar transformation logic in:
- `products.$handle.tsx:52-95` (transformMedusaProduct)
- `towels.tsx:45-60` (inline transformation)

**API Fetching Patterns**: Payment intent creation duplicated:
- `checkout.tsx:37-58` (initial creation)
- `checkout.tsx:67-91` (update with shipping)

### 4. Magic Numbers & Hardcoded Values (Minor)

| Location | Value | Should Be |
|----------|-------|-----------|
| `CartContext.tsx:54` | `giftLegacyId = 4` | Constant or config |
| `CartContext.tsx:56` | `giftThreshold = 35` | Site config |
| `Header.tsx:25` | `0.8` (scroll threshold) | Constant |
| Various | `"#8A6E59"` (accent color) | CSS variable reference |

---

## Identified Issues and Opportunities

### Critical Priority
1. **Fix ID type system** - Prevents runtime errors in cart operations
2. **Consolidate price utilities** - Single source of truth for price parsing

### High Priority
3. **Extract product transformer service** - Reusable Medusa → UI transformation
4. **Split large route components** - Improve maintainability
5. **Create usePaymentIntent hook** - Encapsulate Stripe logic

### Medium Priority
6. **Extract cart business logic** - Free gift rules, total calculations
7. **Create shared types package** - CartItem, Product, etc.
8. **Consolidate API patterns** - Standard fetch wrapper

### Low Priority
9. **Extract constants to config** - Thresholds, magic numbers
10. **Component composition** - Break down CartDrawer, CheckoutForm

---

## Proposed Refactoring Plan

### Phase 1: Type Safety & Core Utilities (Effort: 2-3 hours)

**Goal**: Fix type system and create foundational utilities

#### Step 1.1: Unify Product ID Type
```typescript
// app/types/product.ts (NEW)
export type ProductId = string; // Always use Medusa string IDs

export interface Product {
    id: ProductId;
    handle: string;
    // ... rest
}
```

#### Step 1.2: Fix CartContext Types
- Change `removeFromCart(id: string | number)` → `removeFromCart(id: ProductId)`
- Update all cart operations to handle string IDs
- Migrate legacy numeric IDs to handles

#### Step 1.3: Create Price Utilities
```typescript
// app/lib/price.ts (NEW)
export function parsePrice(formatted: string): number {
    return parseFloat(formatted.replace(/[$,]/g, ''));
}

export function formatPriceCents(cents: number, currency = 'USD'): string {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
    }).format(cents / 100);
}
```

**Files Changed**:
- `app/types/product.ts` (new)
- `app/lib/price.ts` (new)
- `app/context/CartContext.tsx`
- `app/routes/checkout.tsx`

---

### Phase 2: Data Layer Consolidation (Effort: 3-4 hours)

**Goal**: Single transformation layer for Medusa products

#### Step 2.1: Create Product Transformer Service
```typescript
// app/lib/product-transformer.ts (NEW)
import type { MedusaProduct } from './medusa';
import type { Product } from '../types/product';

export function transformMedusaProduct(
    medusaProduct: MedusaProduct,
    currency = 'usd'
): Product {
    // Consolidate logic from products.$handle.tsx and towels.tsx
}

export function transformMedusaProducts(
    products: MedusaProduct[],
    currency = 'usd'
): Product[] {
    return products.map(p => transformMedusaProduct(p, currency));
}
```

#### Step 2.2: Update Route Loaders
- Refactor `products.$handle.tsx` loader to use transformer
- Refactor `towels.tsx` loader to use transformer
- Remove duplicated transformation code

**Files Changed**:
- `app/lib/product-transformer.ts` (new)
- `app/routes/products.$handle.tsx`
- `app/routes/towels.tsx`

---

### Phase 3: Component Extraction (Effort: 4-5 hours)

**Goal**: Break down large components into focused units

#### Step 3.1: Extract from products.$handle.tsx

| New Component | Responsibility |
|---------------|----------------|
| `ProductGallery.tsx` | Image gallery with thumbnails |
| `ProductInfo.tsx` | Title, price, description, features |
| `ColorSelector.tsx` | Color swatch selector |
| `QuantitySelector.tsx` | Quantity +/- controls |
| `AddToCartButton.tsx` | Add to cart with stock status |

#### Step 3.2: Extract Checkout Logic
```typescript
// app/hooks/usePaymentIntent.ts (NEW)
export function usePaymentIntent(options: PaymentIntentOptions) {
    const [clientSecret, setClientSecret] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Consolidate both initial creation and update logic
    const createOrUpdate = useCallback(async () => {...}, []);

    return { clientSecret, isLoading, error, createOrUpdate };
}
```

#### Step 3.3: Extract Cart Business Logic
```typescript
// app/lib/cart-rules.ts (NEW)
export const FREE_GIFT_CONFIG = {
    productId: 'the-wool-dryer-ball',
    threshold: 35,
    giftColor: 'Free Gift',
};

export function shouldAddFreeGift(items: CartItem[], total: number): boolean;
export function calculateCartTotal(items: CartItem[]): number;
export function isFreeGiftItem(item: CartItem): boolean;
```

**Files Changed**:
- `app/components/ProductGallery.tsx` (new)
- `app/components/ProductInfo.tsx` (new)
- `app/components/ColorSelector.tsx` (new)
- `app/components/QuantitySelector.tsx` (new)
- `app/hooks/usePaymentIntent.ts` (new)
- `app/lib/cart-rules.ts` (new)
- `app/routes/products.$handle.tsx` (simplified)
- `app/routes/checkout.tsx` (simplified)
- `app/context/CartContext.tsx` (uses cart-rules)

---

### Phase 4: Configuration & Constants (Effort: 1-2 hours)

**Goal**: Centralize magic numbers and business rules

#### Step 4.1: Extend Site Config
```typescript
// app/config/site.ts (MODIFY)
export const siteConfig = {
    // existing...
    cart: {
        freeGiftThreshold: 35,
        freeGiftProductHandle: 'the-wool-dryer-ball',
    },
    shipping: {
        freeThreshold: 100,
    },
    ui: {
        headerScrollThreshold: 0.8,
    },
};
```

#### Step 4.2: Update Consumers
- Replace hardcoded values with config references
- Update CartContext, Header, shipping components

**Files Changed**:
- `app/config/site.ts`
- `app/context/CartContext.tsx`
- `app/components/Header.tsx`

---

## Risk Assessment and Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Cart state corruption during ID migration | Medium | High | Implement migration with backwards compatibility |
| Breaking existing checkout flow | Medium | Critical | Test payment flow thoroughly in staging |
| Regressions in product display | Low | Medium | Add component tests before refactoring |
| Performance degradation | Low | Medium | Profile before/after each phase |

### Rollback Strategy
- Each phase is independently deployable
- Feature flags for new code paths where possible
- Git tags at each phase completion for easy revert

---

## Testing Strategy

### Unit Tests (Required per Phase)
- `price.test.ts` - Price parsing and formatting
- `product-transformer.test.ts` - Medusa transformation
- `cart-rules.test.ts` - Free gift logic, totals

### Integration Tests
- Cart flow: add item → update quantity → checkout
- Payment intent creation and updates
- Product page data loading (Medusa, Hyperdrive, static fallback)

### E2E Tests (Existing)
- Verify existing checkout flow still works
- Mobile cart drawer functionality

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| TypeScript strict errors | ~5 | 0 |
| Largest component LOC | 639 | <200 |
| Code duplication (similar blocks) | 12+ | <3 |
| Test coverage (lib/) | ~0% | >80% |

---

## Next Steps

1. **Review this plan** with stakeholders
2. **Phase 1 first** - Foundation for all other changes
3. **Write tests first** for critical paths before refactoring
4. **Incremental deploys** - Ship each phase separately

---

## Appendix: File Inventory

### Files to Create
```
app/types/product.ts
app/lib/price.ts
app/lib/product-transformer.ts
app/lib/cart-rules.ts
app/hooks/usePaymentIntent.ts
app/components/ProductGallery.tsx
app/components/ProductInfo.tsx
app/components/ColorSelector.tsx
app/components/QuantitySelector.tsx
```

### Files to Modify
```
app/context/CartContext.tsx
app/routes/products.$handle.tsx
app/routes/towels.tsx
app/routes/checkout.tsx
app/components/Header.tsx
app/config/site.ts
app/data/products.ts
```

### Files to Potentially Deprecate
```
(none - all changes are additive or in-place refactoring)
```


