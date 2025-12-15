# Agent Implementation Prompt: Epic 9 Cart-Based Shipping & Promotion Engine

## Mission

Implement the **Cart-Based Shipping & Promotion Engine** epic (9.x). This enables accurate shipping calculations by syncing localStorage cart to Medusa cart, leveraging Medusa's promotion engine for free shipping and other promotions.

Iterate on each implementation until it meets all acceptance criteria, passes tests, and adheres to project standards.

## Stories to Implement (In Order)

Located in `docs/sprint/sprint-artifacts/`:

| Story | File | Status | Description |
|-------|------|--------|-------------|
| 9.1 | `9-1-medusa-cart-service-layer.md` | Ready | Medusa cart service layer |
| 9.2 | `9-2-update-shipping-rates-api.md` | Ready | Update shipping API for cart context |
| 9.3 | `9-3-update-checkout-flow.md` | Ready | Update checkout flow for cart-based shipping |
| 9.4 | `9-4-client-side-caching-debouncing.md` | Ready | Client-side caching & debouncing |
| 9.5 | `9-5-cart-expiration-error-handling.md` | Ready | Cart expiration & error handling |
| 9.6 | `9-6-integration-tests-cart-shipping.md` | Ready | Integration tests |

Reference the epic overview: `docs/product/epics/cart-based-shipping.md`

## Critical Context Files

**MUST READ before implementation:**

1. **Project Context & Rules**: `docs/project_context.md`
   - Cloudflare Workers constraints (no Node.js APIs in storefront)
   - Environment variable access patterns (`window.ENV` on client, not `process.env`)
   - MCP server integration requirements
   - Testing rules (Vitest + happy-dom for storefront)

2. **Architecture**:
   - `docs/architecture/overview.md` - System overview
   - `docs/architecture/storefront.md` - Storefront patterns
   - `docs/architecture/backend.md` - Medusa backend patterns

3. **Steering Files**: Check `.kiro/steering/` for additional coding standards

## Architecture Overview

```
┌─────────────────┐
│  LocalStorage   │
│     Cart        │  ← User interactions (add/remove/update)
└────────┬────────┘
         │
         │ Sync (on shipping fetch)
         ▼
┌─────────────────┐
│  Medusa Cart    │  ← Promotion calculations
│  (Server-side)  │  ← Shipping options
└─────────────────┘
```

## Implementation Requirements

### Technical Constraints

```typescript
// ✅ CORRECT: SSR-safe code
if (typeof window !== 'undefined') {
  sessionStorage.setItem('medusa_cart_id', cartId);
}

// ✅ CORRECT: Environment variable access in Cloudflare Workers
const apiUrl = typeof window !== 'undefined' ? window.ENV?.MEDUSA_BACKEND_URL : null;

// 🛑 WRONG: Will crash in Cloudflare Workers
const apiUrl = process.env.MEDUSA_BACKEND_URL;
```

### File Structure

```
apps/storefront/app/
├── services/
│   ├── medusa-cart.ts              # Story 9.1 - Cart service layer
│   └── medusa-cart.test.ts         # Story 9.1 - Unit tests
├── routes/
│   ├── api.shipping-rates.ts       # Story 9.2 - Updated API
│   └── api.shipping-rates.test.ts  # Story 9.2 - API tests
│   └── checkout.tsx                # Story 9.3 - Checkout flow
├── hooks/
│   └── useShippingOptions.ts       # Story 9.4 - Caching hook (optional)
├── utils/
│   ├── cart-hash.ts                # Story 9.4 - Cache key generation
│   ├── debounce.ts                 # Story 9.4 - Debounce utility
│   └── retry.ts                    # Story 9.5 - Retry with backoff
├── components/
│   └── OrderSummary.tsx            # Story 9.3 - Display updates
└── tests/
    └── e2e/
        └── checkout-shipping.spec.ts  # Story 9.6 - E2E tests
```

### Key Interfaces

```typescript
// Medusa Cart Service (Story 9.1)
interface MedusaCartService {
  getOrCreateCart(regionId: string, currencyCode: string): Promise<string>;
  getCart(cartId: string): Promise<Cart | null>;
  syncCartItems(cartId: string, localItems: CartItem[]): Promise<Cart>;
  updateShippingAddress(cartId: string, address: ShippingAddress): Promise<Cart>;
  getShippingOptions(cartId: string): Promise<ShippingOption[]>;
}

// Shipping Option with promotion support (Story 9.2)
interface ShippingOption {
  id: string;
  name: string;
  amount: number;           // Discounted price (0 for free shipping)
  originalAmount?: number;  // Original price before promotion
  price_type: string;
  provider_id: string;
  is_return: boolean;
}

// API Request (Story 9.2)
interface ShippingRatesRequest {
  cartItems: CartItem[];
  shippingAddress?: ShippingAddress;
  currency: string;
  cartId?: string;
}

// API Response (Story 9.2)
interface ShippingRatesResponse {
  shippingOptions: ShippingOption[];
  cartId: string;
}
```

### Error Handling Strategy

```typescript
// Cart not found (expired) → create new cart
if (error.status === 404) {
  sessionStorage.removeItem('medusa_cart_id');
  return await getOrCreateCart(regionId, currencyCode);
}

// Variant not found → skip item, log warning
if (error.status === 404 && error.message.includes('variant')) {
  console.warn(`Skipping item - variant not found: ${item.variantId}`);
  continue;
}

// API failure → fallback to region-based fetch
try {
  return await fetchCartBasedShipping(cartItems, address, currency, cartId);
} catch (error) {
  logger.error('Cart-based shipping failed, using fallback', { error });
  return await fetchRegionBasedShipping(currency);
}
```

## Iteration Protocol

For each story, follow this cycle:

### 1. Read & Understand
- Read the story file completely
- Understand acceptance criteria
- Note dependencies on previous stories

### 2. Implement
- Follow patterns from existing code
- Use Medusa JS SDK for API calls
- Handle SSR/client-side correctly

### 3. Test
- Write unit tests (Vitest + happy-dom)
- Run: `pnpm --filter storefront test`
- Ensure all tests pass

### 4. Validate
- Check for TypeScript errors: `pnpm --filter storefront typecheck`
- Check for lint errors: `pnpm --filter storefront lint`
- Verify SSR compatibility (no `window` access without guards)

### 5. Iterate
- If any check fails, fix and re-validate
- Continue until all criteria met

### 6. Update Story Status
- Update the story file's `Status:` field to `Done`
- Add/update the `## Dev Agent Record` section with:
  - Implementation notes
  - File list of all modified files
  - Any deviations from spec with justification

## Story Dependencies

```
9.1 (Cart Service) ──┬──► 9.2 (API Update) ──┬──► 9.3 (Checkout Flow)
                     │                        │
                     │                        └──► 9.4 (Caching)
                     │
                     └──► 9.5 (Error Handling)
                     
All (9.1-9.5) ──────────────────────────────────► 9.6 (Integration Tests)
```

**Implementation Order**: 9.1 → 9.2 → 9.5 → 9.3 → 9.4 → 9.6

## Success Criteria

Implementation is complete when:

- [ ] All 6 stories have `Status: Done`
- [ ] Medusa cart service layer functional (`medusa-cart.ts`)
- [ ] Shipping API accepts cart items and returns `originalAmount`
- [ ] Checkout displays free shipping with strikethrough original price
- [ ] Shipping requests are cached (5-min TTL) and debounced (300ms)
- [ ] Cart expiration handled gracefully (auto-recreation)
- [ ] Fallback to region-based fetch works when Medusa fails
- [ ] `pnpm --filter storefront test` passes
- [ ] `pnpm --filter storefront typecheck` passes
- [ ] `pnpm --filter storefront lint` passes
- [ ] No `process.env` usage in client code
- [ ] All changes committed to branch `feature/9-cart-based-shipping`
- [ ] Commit messages follow conventional commits format

## Commands Reference

```bash
# Create feature branch
git checkout -b feature/9-cart-based-shipping

# Run storefront tests
pnpm --filter storefront test

# Type check
pnpm --filter storefront typecheck

# Lint
pnpm --filter storefront lint

# Run specific test file
pnpm --filter storefront test medusa-cart

# Run E2E tests
pnpm --filter storefront test:e2e

# Dev server (for manual verification)
pnpm --filter storefront dev
```

## Pre-Implementation Verification

**CRITICAL**: Before implementing Story 9.1, verify these Medusa v2 endpoints exist:

1. `POST /store/carts` - Create cart
2. `GET /store/carts/:id` - Retrieve cart
3. `POST /store/carts/:id/line-items` - Add line items
4. `GET /store/shipping-options?cart_id={id}` - Get shipping with cart context

Test against the dev Medusa instance to confirm API availability.

## Begin

1. First, create the feature branch: `git checkout -b feature/9-cart-based-shipping`
2. Start with Story 9.1 (Medusa Cart Service Layer)
3. Read the story file, implement, test, validate, iterate until done
4. Proceed through stories in dependency order: 9.1 → 9.2 → 9.5 → 9.3 → 9.4 → 9.6
