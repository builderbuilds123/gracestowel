# Epic 9: Cart-Based Shipping & Promotion Engine

**Goal:** Enable accurate shipping option calculations by syncing localStorage cart to Medusa cart, leveraging Medusa's promotion engine for free shipping and other promotions.

**Status:** Proposed
**Author:** Big Dick
**Date:** 2025-12-14
**Trace ID:** gt_epic_cart_shipping_2025_12_14
**Related:** [Sprint Change Proposal](../../sprint/proposals/sprint-change-proposal-2025-01-XX-cart-based-shipping-options.md)

---

## Problem Statement

The current shipping options implementation uses region-based fetching (`GET /store/shipping-options?region_id={id}`) which doesn't leverage Medusa's promotion engine. This causes:

1. **No Promotion Context**: Free shipping promotions can't show original price ("was $8.95")
2. **Missing originalAmount**: Medusa doesn't provide `original_amount` without cart context
3. **No Address Context**: Shipping fetched before address is known → inaccurate rates
4. **Inefficient API Usage**: Unused request data, unnecessary fallback fetches

## Solution Overview

**Hybrid Approach**: Maintain localStorage cart for UI state, sync to Medusa cart for shipping calculations.

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

---

## Stories

### Story 9.1: Medusa Cart Service Layer

As a Developer,
I want a service layer that manages Medusa cart lifecycle,
So that we can sync local cart state to Medusa for promotion calculations.

**Acceptance Criteria:**

**Given** the storefront needs shipping options
**When** no Medusa cart exists for the session
**Then** the system SHALL create a new Medusa cart via `POST /store/carts`
**And** store the `cart_id` in sessionStorage for reuse

**Given** a Medusa cart already exists
**When** the cart ID is found in sessionStorage
**Then** the system SHALL retrieve the existing cart via `GET /store/carts/:id`
**And** handle cart expiration gracefully (create new if expired)

**Given** local cart items need to sync to Medusa
**When** `syncCartItems()` is called
**Then** the system SHALL add/update line items via `POST /store/carts/:id/line-items`
**And** only sync items that have a valid `variantId`
**And** log warnings for items without `variantId` (skip, don't fail)

**Technical Notes:**
- Create `apps/storefront/app/services/medusa-cart.ts`
- Functions: `getOrCreateCart()`, `getCart()`, `syncCartItems()`, `updateShippingAddress()`, `getShippingOptions()`
- Use sessionStorage for cart ID persistence
- Handle errors gracefully with fallback to region-based fetch

**Files:**
- `apps/storefront/app/services/medusa-cart.ts` (NEW)
- `apps/storefront/app/services/medusa-cart.test.ts` (NEW)

---

### Story 9.2: Update Shipping Rates API for Cart Context

As a Developer,
I want the shipping rates API to use Medusa cart context,
So that shipping options include accurate promotion calculations.

**Acceptance Criteria:**

**Given** a request to `/api/shipping-rates`
**When** the request includes `cartItems` and optional `shippingAddress`
**Then** the system SHALL sync cart items to Medusa cart
**And** update shipping address if provided
**And** fetch shipping options via `GET /store/shipping-options?cart_id={cart_id}`

**Given** shipping options are returned from Medusa
**When** a promotion applies (e.g., free shipping over $99)
**Then** the response SHALL include `originalAmount` from Medusa's `original_amount` field
**And** `amount` SHALL reflect the discounted price (0 for free shipping)

**Given** the API request includes a `cartId`
**When** the cart ID is valid
**Then** the system SHALL reuse the existing cart (no recreation)
**And** return the same `cartId` in the response for client caching

**Given** cart sync or Medusa API fails
**When** an error occurs
**Then** the system SHALL fall back to region-based shipping fetch
**And** log the error for debugging

**API Contract Change:**
```typescript
// Request
POST /api/shipping-rates
{
  cartItems: CartItem[];
  shippingAddress?: Address;
  currency: string;
  cartId?: string;
}

// Response
{
  shippingOptions: ShippingOption[];
  cartId: string;
}
```

**Technical Notes:**
- Modify `apps/storefront/app/routes/api.shipping-rates.ts`
- Use `medusa-cart.ts` service for cart operations
- Maintain backward compatibility during migration (accept old format)

**Files:**
- `apps/storefront/app/routes/api.shipping-rates.ts` (MODIFY)
- `apps/storefront/app/routes/api.shipping-rates.test.ts` (MODIFY)

---

### Story 9.3: Update Checkout Flow for Cart-Based Shipping

As a Shopper,
I want shipping options to update accurately when I change my cart or address,
So that I see correct shipping costs including any promotions.

**Acceptance Criteria:**

**Given** I am on the checkout page
**When** the page loads
**Then** the system SHALL pass full `cartItems` array to the shipping rates API
**And** store the returned `cartId` in sessionStorage

**Given** I enter or change my shipping address (via Stripe Address Element)
**When** the address is complete
**Then** the system SHALL call shipping rates API with `shippingAddress`
**And** shipping options SHALL update to reflect address-specific rates

**Given** free shipping promotion applies (cart >= $99)
**When** shipping options are displayed
**Then** I SHALL see the original price crossed out (e.g., "~~$8.95~~")
**And** the promotional price displayed (e.g., "FREE")

**Given** my cart total drops below the free shipping threshold
**When** shipping options refresh
**Then** the original shipping cost SHALL be restored
**And** the free shipping indicator SHALL be removed

**Given** the shipping API returns a `cartId`
**When** subsequent requests are made
**Then** the system SHALL include `cartId` in the request for cart reuse

**Technical Notes:**
- Modify `apps/storefront/app/routes/checkout.tsx`
- Pass `items` array instead of just `subtotal`
- Store `cartId` in sessionStorage, pass in subsequent requests
- Verify `OrderSummary.tsx` correctly displays `originalAmount`

**Files:**
- `apps/storefront/app/routes/checkout.tsx` (MODIFY)
- `apps/storefront/app/components/OrderSummary.tsx` (VERIFY)

---

### Story 9.4: Client-Side Caching & Debouncing

As a Developer,
I want shipping API calls to be cached and debounced,
So that we minimize unnecessary API calls and improve performance.

**Acceptance Criteria:**

**Given** shipping options were recently fetched
**When** the same cart state and address are requested again
**Then** the system SHALL return cached results (5-minute TTL)
**And** skip the API call entirely

**Given** the cart or address changes
**When** a new cache key is generated
**Then** the system SHALL fetch fresh shipping options
**And** cache the new results

**Given** rapid cart changes occur (e.g., quantity adjustments)
**When** multiple shipping fetches would be triggered
**Then** the system SHALL debounce requests (300ms delay)
**And** only execute the final request

**Cache Key Strategy:**
```typescript
const cacheKey = `shipping_${hashCart(cartItems)}_${shippingAddress?.postal_code || 'no-address'}`;
```

**Technical Notes:**
- Implement in checkout component or as a custom hook
- Use sessionStorage for cache persistence
- Cache structure: `{ data: ShippingOption[], timestamp: number, cartId: string }`
- Invalidate cache when cart hash changes
- Consistent with existing debounce pattern in payment intent flow

**Files:**
- `apps/storefront/app/hooks/useShippingOptions.ts` (NEW or integrate into checkout)
- `apps/storefront/app/utils/cart-hash.ts` (NEW)

---

### Story 9.5: Cart Expiration & Error Handling

As a Developer,
I want the system to handle cart expiration and API failures gracefully,
So that checkout never breaks due to cart sync issues.

**Acceptance Criteria:**

**Given** a stored `cartId` references an expired or invalid cart
**When** the system attempts to use it
**Then** the system SHALL detect the error (404 or invalid response)
**And** create a new Medusa cart automatically
**And** clear the old `cartId` from sessionStorage

**Given** Medusa API is unavailable or returns an error
**When** shipping options are requested
**Then** the system SHALL fall back to region-based shipping fetch
**And** log the error with trace ID for debugging
**And** NOT block checkout flow

**Given** a cart item lacks `variantId`
**When** syncing to Medusa cart
**Then** the system SHALL skip that item (not fail the sync)
**And** log a warning: "Item {title} skipped - no variantId"

**Given** line item sync fails for a specific item
**When** the error is not critical (e.g., variant not found)
**Then** the system SHALL continue syncing remaining items
**And** return partial results rather than failing entirely

**Technical Notes:**
- Implement retry logic (max 2 retries with exponential backoff)
- Use structured logging with trace IDs
- Fallback should be seamless to user

**Files:**
- `apps/storefront/app/services/medusa-cart.ts` (MODIFY)
- `apps/storefront/app/routes/api.shipping-rates.ts` (MODIFY)

---

### Story 9.6: Integration Tests for Cart-Based Shipping

As a QA Engineer,
I want automated tests covering the cart-based shipping flow,
So that we can verify promotions and sync work correctly.

**Acceptance Criteria:**

**Given** a test cart with items totaling < $99
**When** shipping options are fetched
**Then** standard shipping SHALL have a non-zero amount
**And** `originalAmount` SHALL equal `amount` (no discount)

**Given** a test cart with items totaling >= $99
**When** shipping options are fetched
**Then** standard shipping SHALL have `amount: 0`
**And** `originalAmount` SHALL show the original price (e.g., 895 cents)

**Given** a cart is synced to Medusa
**When** items are added/removed locally
**Then** re-syncing SHALL update Medusa cart correctly
**And** shipping options SHALL reflect the new total

**Given** Medusa API is mocked to fail
**When** shipping options are requested
**Then** fallback to region-based fetch SHALL work
**And** no errors SHALL be shown to user

**Test Scenarios:**
1. Cart sync with valid items → success
2. Cart sync with missing variantId → partial success with warning
3. Free shipping threshold crossing (below → above → below)
4. Cart expiration → automatic recreation
5. API failure → graceful fallback

**Technical Notes:**
- Use Vitest for unit/integration tests
- Mock Medusa API responses
- Test both happy path and error scenarios

**Files:**
- `apps/storefront/app/services/medusa-cart.test.ts` (NEW)
- `apps/storefront/app/routes/api.shipping-rates.test.ts` (MODIFY)
- `apps/storefront/tests/e2e/checkout-shipping.spec.ts` (NEW - Playwright)

---

## FR Coverage Matrix

| Requirement | Description | Covered By |
| :--- | :--- | :--- |
| Cart Context | Shipping options use cart items for promotion calculation | Story 9.1, 9.2 |
| originalAmount | Display original price when promotions apply | Story 9.2, 9.3 |
| Address Context | Shipping considers shipping address | Story 9.2, 9.3 |
| Performance | Caching and debouncing to minimize API calls | Story 9.4 |
| Resilience | Graceful fallback on errors | Story 9.5 |
| Quality | Automated test coverage | Story 9.6 |

---

## Implementation Timeline

| Phase | Stories | Duration |
| :--- | :--- | :--- |
| Phase 1: Cart Service | 9.1 | Week 1 |
| Phase 2: API Update | 9.2, 9.5 | Week 1-2 |
| Phase 3: Checkout Flow | 9.3, 9.4 | Week 2 |
| Phase 4: Testing | 9.6 | Week 2-3 |

---

## Dependencies

- **Medusa v2 Cart API**: Must support `GET /store/shipping-options?cart_id={id}`
- **Cart Items with variantId**: All products should have variants with IDs
- **Promotion Configuration**: Free shipping promotion must be configured in Medusa

## Open Questions

1. **Medusa API Verification**: Does `GET /store/shipping-options?cart_id={id}` exist in Medusa v2?
   - **Action**: Test with actual Medusa instance
   - **Fallback**: Use alternative endpoint if needed

2. **Cart Expiration**: How long do Medusa carts persist?
   - **Action**: Research Medusa documentation
   - **Fallback**: Implement cart recreation logic

---

_Generated from Sprint Change Proposal via Course Correction workflow_
_For implementation: Use the `dev-story` workflow to implement individual stories_
