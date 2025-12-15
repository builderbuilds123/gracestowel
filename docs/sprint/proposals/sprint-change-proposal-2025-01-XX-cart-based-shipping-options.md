# Sprint Change Proposal: Migrate to Cart-Based Shipping Options

**Date:** 2025-01-XX
**Author:** Development Team
**Status:** Proposed
**Scope:** Large
**Trace ID:** gt_scp_cart_shipping_2025_01_XX

---

## 1. Issue Summary

### Problem Statement

The current shipping options implementation has critical limitations that prevent accurate promotion calculations and proper display of original shipping costs:

1. **No Promotion Context**: Shipping options are fetched by `region_id` only, which doesn't account for:
   - Cart total (e.g., free shipping over $99)
   - Cart items (for item-based promotions)
   - Customer context (for customer-specific promotions)

2. **Missing originalAmount**: When free shipping promotions apply, the `originalAmount` field is often missing because:
   - Region-based API doesn't include promotion calculations
   - Medusa may not provide `original_amount` without cart context
   - Current fallback logic attempts to extract base prices but often fails

3. **Shipping Address Not Considered**: Shipping options are fetched before the shipping address is known, leading to:
   - Inaccurate shipping rates
   - Missing location-specific options
   - Incorrect tax calculations

4. **Inefficient API Usage**: The current implementation:
   - Sends `subtotal` in request body but doesn't use it
   - Makes unnecessary region lookups
   - Attempts fallback fetches that may fail

### Root Cause

The application uses a **localStorage-based cart** (not Medusa carts) and fetches shipping options using the **region-based endpoint** (`GET /store/shipping-options?region_id={id}`). This approach doesn't leverage Medusa's promotion engine, which requires cart context to calculate discounts accurately.

### Discovery Context

- **Discovered during**: Investigation of `originalAmount` display issue for free shipping
- **Affected Stories**: Shipping rate calculation, promotion display, checkout flow
- **Business Impact**: 
  - Customers may not see accurate shipping costs
  - Free shipping promotions may not display original price (missing "was $X" display)
  - Potential for incorrect shipping calculations

---

## 2. Current Implementation Documentation

### Cart System Architecture

**Frontend Cart (`apps/storefront/app/context/CartContext.tsx`)**:
- **Storage**: localStorage-based cart (not Medusa carts)
- **Structure**: `CartItem[]` with fields:
  ```typescript
  {
    id: ProductId;           // string | number
    variantId?: string;      // Medusa variant ID (optional)
    title: string;
    price: string;           // Formatted price (e.g., "$35.00")
    quantity: number;
    color?: string;
    sku?: string;
    // ... other fields
  }
  ```
- **Operations**: `addToCart`, `removeFromCart`, `updateQuantity`, `clearCart`
- **Total Calculation**: Client-side using `calculateTotal()` utility
- **Persistence**: localStorage (survives page refresh)

**Shipping Options Fetch (`apps/storefront/app/routes/api.shipping-rates.ts`)**:
- **Current Endpoint**: `GET /store/shipping-options?region_id={id}`
- **Request Body**: `{ currency?: string, subtotal?: number }` (only `currency` is used)
- **Flow**:
  1. Parse request body for `currency` (defaults to "CAD")
  2. Fetch regions: `GET /store/regions`
  3. Find region matching currency
  4. Fetch shipping options: `GET /store/shipping-options?region_id={region.id}`
  5. Map to frontend format
  6. Attempt to extract `originalAmount` from:
     - `option.original_amount`
     - `option.metadata.original_amount`
     - `option.prices` array (with conversion logic)
     - Fallback fetch to `/store/shipping-options/{id}` (may fail)

**Checkout Flow (`apps/storefront/app/routes/checkout.tsx`)**:
- Calls `/api/shipping-rates` with `{ subtotal: cartTotal }`
- Updates shipping options when `cartTotal` changes (useEffect)
- Updates shipping options when address changes (Stripe Address Element)
- Does NOT use Medusa carts
- Does NOT pass cart items to shipping API

### Current Limitations

1. **No Cart Context**: Region-based fetching doesn't provide:
   - Cart total for promotion eligibility
   - Cart items for item-based promotions
   - Customer context for personalized promotions

2. **No Shipping Address Context**: Options fetched before address is known

3. **originalAmount May Be Missing**: Without cart context, Medusa may not provide `original_amount` when promotions apply

4. **Inefficient**: Unused request data, unnecessary API calls, fallback fetches that may fail

---

## 3. Medusa v2 Cart API Research

### Cart Creation

**Endpoint**: `POST /store/carts`

**Request Body**:
```json
{
  "region_id": "reg_xxx",    // Optional, can be set later
  "currency_code": "usd",    // Optional
  "metadata": {}             // Optional
}
```

**Response**:
```json
{
  "cart": {
    "id": "cart_xxx",
    "region_id": "reg_xxx",
    "currency_code": "usd",
    "items": [],
    "total": 0,
    "subtotal": 0,
    "tax_total": 0,
    "shipping_total": 0,
    "discount_total": 0,
    "shipping_address": null,
    "shipping_methods": [],
    "created_at": "...",
    "updated_at": "..."
  }
}
```

### Adding Line Items

**Endpoint**: `POST /store/carts/:id/line-items`

**Request Body**:
```json
{
  "variant_id": "variant_xxx",  // Required: Medusa variant ID
  "quantity": 1,                 // Required
  "metadata": {}                // Optional
}
```

**Response**: Updated cart with new line item

**Note**: Each line item requires a `variant_id`. Cart items must have `variantId` field populated.

### Updating Cart with Shipping Address

**Endpoint**: `POST /store/carts/:id` or `PATCH /store/carts/:id`

**Request Body**:
```json
{
  "shipping_address": {
    "first_name": "John",
    "last_name": "Doe",
    "address_1": "123 Main St",
    "city": "New York",
    "country_code": "us",
    "postal_code": "10001",
    "province": "NY",           // Optional
    "phone": "+1234567890"      // Optional
  }
}
```

### Fetching Shipping Options with Cart Context

**Endpoint**: `GET /store/shipping-options?cart_id={cart_id}`

**Alternative**: May also support `GET /store/carts/:id/shipping-options` (verify in Medusa v2)

**Response**:
```json
{
  "shipping_options": [
    {
      "id": "so_xxx",
      "name": "Standard Shipping",
      "amount": 0,              // Calculated with promotions (free shipping)
      "original_amount": 895,    // Provided when discounted (in cents)
      "price_type": "flat",
      "data": {},
      "metadata": {}
    }
  ]
}
```

**Key Benefits**:
- ✅ Includes promotion calculations (free shipping over $99)
- ✅ Considers cart items and totals
- ✅ Accounts for shipping address
- ✅ May provide `original_amount` when discounts apply
- ✅ Accurate tax calculations

### Cart Management

- **Retrieve Cart**: `GET /store/carts/:id`
- **Update Cart**: `POST /store/carts/:id` or `PATCH /store/carts/:id`
- **Delete Cart**: `DELETE /store/carts/:id` (optional cleanup)

---

## 4. Proposed Solution

### Architecture Overview

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

### Phase 1: Cart Service Layer

**Create**: `apps/storefront/app/services/medusa-cart.ts`

**Responsibilities**:
- Create/get Medusa cart
- Sync local cart items to Medusa cart
- Update shipping address
- Fetch shipping options with cart context
- Cache cart ID in sessionStorage
- Handle errors and fallbacks

**Key Functions**:
```typescript
// Cart management
async function getOrCreateCart(regionId: string, currencyCode: string): Promise<string>
async function getCart(cartId: string): Promise<Cart>
async function updateCartRegion(cartId: string, regionId: string): Promise<Cart>

// Line items
async function syncCartItems(cartId: string, localItems: CartItem[]): Promise<Cart>
async function addLineItem(cartId: string, variantId: string, quantity: number): Promise<Cart>
async function updateLineItem(cartId: string, lineItemId: string, quantity: number): Promise<Cart>
async function removeLineItem(cartId: string, lineItemId: string): Promise<Cart>

// Shipping
async function updateShippingAddress(cartId: string, address: ShippingAddress): Promise<Cart>
async function getShippingOptions(cartId: string): Promise<ShippingOption[]>
```

### Phase 2: Update Shipping Rates API

**Modify**: `apps/storefront/app/routes/api.shipping-rates.ts`

**New Flow**:
1. Parse request body: `{ cartItems: CartItem[], shippingAddress?: Address, currency: string }`
2. Get or create Medusa cart:
   - Check sessionStorage for existing cart ID
   - If exists, retrieve cart
   - If not exists or invalid, create new cart
3. Sync local cart items to Medusa cart:
   - For each item with `variantId`, add/update line item
   - Remove items not in local cart
   - Handle items without `variantId` (skip or log warning)
4. If `shippingAddress` provided, update cart
5. Fetch shipping options: `GET /store/shipping-options?cart_id={cart_id}`
6. Map response to frontend format:
   - Use `original_amount` if provided
   - Fallback to `amount` if no original
7. Return shipping options with cart ID for caching

**Request Body Changes**:
```typescript
{
  cartItems: CartItem[];      // Full cart items (not just subtotal)
  shippingAddress?: {          // Optional, for address-based calculations
    first_name: string;
    last_name: string;
    address_1: string;
    city: string;
    country_code: string;
    postal_code: string;
    province?: string;
    phone?: string;
  };
  currency: string;
  cartId?: string;            // Optional, for cart reuse
}
```

**Response Changes**:
```typescript
{
  shippingOptions: ShippingOption[];
  cartId: string;             // Return for client-side caching
}
```

### Phase 3: Update Checkout Flow

**Modify**: `apps/storefront/app/routes/checkout.tsx`

**Changes**:
- Pass full `items` array to shipping-rates API (not just `subtotal`)
- Pass `shippingAddress` when available from Stripe Address Element
- Store `cartId` in sessionStorage for reuse
- Pass `cartId` in subsequent requests
- Handle cart expiration (create new cart if needed)

### Phase 4: Cart Synchronization Strategy

**Selected Strategy: Lazy Sync (Recommended)**

- **When**: Only sync when fetching shipping options
- **Pros**: 
  - Fewer API calls
  - Simpler implementation
  - Less server load
- **Cons**: 
  - May miss promotion updates between syncs
  - Slight delay on first shipping fetch

**Alternative: Real-time Sync**
- **When**: Sync on every cart change (add/remove/update)
- **Pros**: Always accurate, supports real-time promotions
- **Cons**: More API calls, higher server load, more complex

**Alternative: Hybrid**
- **When**: Sync on cart changes AND before shipping fetch
- **Pros**: Balance of accuracy and performance
- **Cons**: Most complex, potential for race conditions

---

## 5. Optimization Options Analysis

### Option 1: Client-Side Caching

**Approach**: Cache shipping options in memory/sessionStorage with cart hash as key.

**Implementation**:
```typescript
// Generate cache key from cart state
const cacheKey = `shipping_${hashCart(cartItems)}_${shippingAddress?.postal_code}`;

// Check cache before API call
const cached = sessionStorage.getItem(cacheKey);
if (cached && !isExpired(cached)) {
  return JSON.parse(cached);
}

// Fetch and cache
const options = await fetchShippingOptions(...);
sessionStorage.setItem(cacheKey, JSON.stringify({ data: options, timestamp: Date.now() }));
```

**Pros**:
- ✅ Eliminates redundant API calls
- ✅ Instant response for repeated requests
- ✅ Reduces server load
- ✅ Works offline (for cached data)

**Cons**:
- ❌ Cache invalidation complexity
- ❌ May serve stale data if cart changes
- ❌ Memory/storage usage
- ❌ Cache key generation overhead

**Recommendation**: **Implement with TTL (5 minutes)** - Good balance of freshness and performance.

---

### Option 2: Server-Side Response Caching (Cloudflare)

**Approach**: Use Cloudflare Workers cache API to cache shipping options responses.

**Implementation**:
```typescript
// In api.shipping-rates.ts
const cacheKey = `shipping_${cartId}_${hashAddress(shippingAddress)}`;
const cache = caches.default;

// Check cache
const cachedResponse = await cache.match(cacheKey);
if (cachedResponse) {
  return cachedResponse;
}

// Fetch and cache
const options = await fetchShippingOptions(...);
const response = Response.json({ shippingOptions: options });
response.headers.set('Cache-Control', 'public, max-age=300'); // 5 min
await cache.put(cacheKey, response.clone());
```

**Pros**:
- ✅ Shared cache across users (same cart state)
- ✅ Reduces Medusa API load
- ✅ Fast response times
- ✅ Automatic cache management

**Cons**:
- ❌ Requires careful cache key design
- ❌ Cache invalidation on cart changes
- ❌ May serve stale data
- ❌ Cloudflare-specific (not portable)

**Recommendation**: **Implement with short TTL (2-3 minutes)** - Effective for high-traffic scenarios.

---

### Option 3: Embedded Shipping Logic (Frontend)

**Approach**: Implement promotion rules client-side (e.g., "free shipping over $99").

**Implementation**:
```typescript
// Client-side promotion check
function calculateShippingWithPromotions(
  baseOptions: ShippingOption[],
  cartTotal: number
): ShippingOption[] {
  return baseOptions.map(option => {
    // Free shipping over $99
    if (cartTotal >= 9900 && option.name.includes('Standard')) {
      return {
        ...option,
        amount: 0,
        originalAmount: option.amount,
        isFree: true
      };
    }
    return option;
  });
}
```

**Pros**:
- ✅ Instant calculation (no API call)
- ✅ Works offline
- ✅ Reduces server load
- ✅ Full control over logic

**Cons**:
- ❌ Logic duplication (frontend + backend)
- ❌ Hard to maintain (changes require code deploy)
- ❌ Doesn't account for complex promotions
- ❌ Security risk (client can manipulate)
- ❌ Doesn't work with Medusa's promotion engine

**Recommendation**: **Do NOT implement** - Violates single source of truth principle, maintenance burden.

---

### Option 4: Optimistic UI Updates

**Approach**: Show estimated shipping immediately, update when API responds.

**Implementation**:
```typescript
// Show cached/estimated options immediately
const [shippingOptions, setShippingOptions] = useState(getCachedOptions());

// Fetch in background
useEffect(() => {
  fetchShippingOptions().then(options => {
    setShippingOptions(options);
    cacheOptions(options);
  });
}, [cartTotal, shippingAddress]);
```

**Pros**:
- ✅ Perceived performance improvement
- ✅ Better UX (no loading state)
- ✅ Works with caching

**Cons**:
- ❌ May show incorrect data initially
- ❌ Requires cache to be populated
- ❌ More complex state management

**Recommendation**: **Implement as enhancement** - Good UX improvement, but not critical.

---

### Option 5: Batch Cart Operations

**Approach**: Batch multiple cart updates into single API call.

**Implementation**:
```typescript
// Instead of: add item → update item → remove item (3 calls)
// Do: batch update (1 call)
async function batchUpdateCart(cartId: string, operations: CartOperation[]): Promise<Cart> {
  // Medusa may support batch operations, or we implement client-side batching
}
```

**Pros**:
- ✅ Fewer API calls
- ✅ Atomic updates
- ✅ Better performance

**Cons**:
- ❌ Requires Medusa API support (may not exist)
- ❌ More complex error handling
- ❌ Harder to debug

**Recommendation**: **Investigate Medusa API support** - Implement if available, otherwise skip.

---

### Option 6: Debounced Shipping Fetch

**Approach**: Debounce shipping option fetches to avoid rapid API calls.

**Implementation**:
```typescript
// Debounce shipping fetch by 300ms
const debouncedFetch = useMemo(
  () => debounce(fetchShippingOptions, 300),
  []
);

useEffect(() => {
  debouncedFetch(cartItems, shippingAddress);
}, [cartItems, shippingAddress]);
```

**Pros**:
- ✅ Reduces API calls during rapid changes
- ✅ Better performance
- ✅ Lower server load

**Cons**:
- ❌ Slight delay in updates
- ❌ May miss intermediate states

**Recommendation**: **Implement (300ms debounce)** - Already used in payment intent flow, consistent pattern.

---

### Option 7: Prefetch Shipping Options

**Approach**: Prefetch shipping options when user enters checkout page.

**Implementation**:
```typescript
// In checkout.tsx loader
export async function loader() {
  // Prefetch shipping options in parallel with other data
  const shippingPromise = fetchShippingOptions(cartItems);
  // ... other data fetching
  return { shippingOptions: await shippingPromise };
}
```

**Pros**:
- ✅ Options ready when user needs them
- ✅ Better perceived performance
- ✅ Can be done in parallel

**Cons**:
- ❌ May fetch unnecessary data
- ❌ Address not known at loader time
- ❌ Cart may change before user sees options

**Recommendation**: **Skip** - Address is required for accurate shipping, better to fetch on-demand.

---

### Recommended Optimization Stack

**Primary Optimizations**:
1. ✅ **Client-Side Caching** (5 min TTL) - High impact, low complexity
2. ✅ **Debounced Fetch** (300ms) - Prevents rapid API calls
3. ✅ **Cart ID Reuse** - Avoids unnecessary cart creation

**Secondary Optimizations** (Future):
4. ⚠️ **Server-Side Caching** (Cloudflare) - If traffic justifies
5. ⚠️ **Optimistic UI** - UX enhancement

**Not Recommended**:
- ❌ Embedded shipping logic (maintenance burden)
- ❌ Prefetch (address required)
- ❌ Batch operations (investigate first)

---

## 6. Implementation Plan

### Phase 1: Cart Service Layer (Week 1)

**Tasks**:
- [ ] Create `apps/storefront/app/services/medusa-cart.ts`
- [ ] Implement cart creation/retrieval
- [ ] Implement line item sync
- [ ] Implement shipping address update
- [ ] Add error handling and fallbacks
- [ ] Add unit tests

**Files**:
- `apps/storefront/app/services/medusa-cart.ts` (NEW)
- `apps/storefront/app/services/medusa-cart.test.ts` (NEW)

### Phase 2: Update Shipping API (Week 1-2)

**Tasks**:
- [ ] Update `api.shipping-rates.ts` to use cart context
- [ ] Update request/response types
- [ ] Implement cart synchronization
- [ ] Add client-side caching
- [ ] Add debouncing
- [ ] Update error handling
- [ ] Add integration tests

**Files**:
- `apps/storefront/app/routes/api.shipping-rates.ts` (MODIFY)
- `apps/storefront/app/routes/api.shipping-rates.test.ts` (MODIFY)

### Phase 3: Update Checkout Flow (Week 2)

**Tasks**:
- [ ] Update `checkout.tsx` to pass cart items
- [ ] Implement cart ID persistence (sessionStorage)
- [ ] Update address change handler
- [ ] Add loading states
- [ ] Update UI to show originalAmount correctly
- [ ] Add E2E tests

**Files**:
- `apps/storefront/app/routes/checkout.tsx` (MODIFY)
- `apps/storefront/app/components/OrderSummary.tsx` (VERIFY)

### Phase 4: Testing & Validation (Week 2-3)

**Tasks**:
- [ ] Unit tests for cart service
- [ ] Integration tests for shipping API
- [ ] E2E tests for checkout flow
- [ ] Test promotion scenarios (free shipping over $99)
- [ ] Test cart expiration handling
- [ ] Test error scenarios
- [ ] Performance testing

### Phase 5: Documentation & Cleanup (Week 3)

**Tasks**:
- [ ] Update API documentation
- [ ] Document cart synchronization strategy
- [ ] Document caching strategy
- [ ] Update README if needed
- [ ] Code review and cleanup

---

## 7. Testing Strategy

### Unit Tests

**Cart Service**:
- Cart creation/retrieval
- Line item sync (add/update/remove)
- Shipping address update
- Error handling (cart not found, variant not found)
- Cart ID persistence

**Shipping API**:
- Request parsing
- Cart synchronization
- Shipping options mapping
- originalAmount extraction
- Error handling

### Integration Tests

**Full Flow**:
1. Create cart → add items → update address → fetch shipping
2. Update cart items → fetch shipping (verify updates)
3. Remove items → fetch shipping (verify removal)
4. Cart expiration → create new cart

**Promotion Scenarios**:
1. Cart total < $99 → shipping not free
2. Cart total >= $99 → shipping free with originalAmount
3. Multiple promotions → correct calculation
4. Promotion changes → shipping updates

### E2E Tests

**Checkout Flow**:
1. Add items to cart → go to checkout → verify shipping options
2. Change address → verify shipping updates
3. Change cart total → verify promotion applies
4. Free shipping → verify originalAmount display

**Error Scenarios**:
1. Network failure → fallback behavior
2. Cart not found → create new cart
3. Variant not found → skip item, continue

---

## 8. Risk Assessment

### High Risk

**Cart Synchronization Complexity**:
- **Risk**: Items may not sync correctly
- **Mitigation**: Comprehensive testing, error handling, logging

**Performance Impact**:
- **Risk**: Additional API calls may slow checkout
- **Mitigation**: Implement caching, debouncing, lazy sync

### Medium Risk

**Cart Expiration**:
- **Risk**: Cart may expire during checkout
- **Mitigation**: Handle expiration gracefully, create new cart

**Variant ID Missing**:
- **Risk**: Some cart items may not have variantId
- **Mitigation**: Skip items without variantId, log warning

### Low Risk

**Backward Compatibility**:
- **Risk**: Breaking changes to API contract
- **Mitigation**: Maintain backward compatibility during migration

---

## 9. Success Criteria

### Functional Requirements

- [ ] Shipping options fetched using cart context
- [ ] Promotions correctly applied (free shipping over $99)
- [ ] `originalAmount` displayed when available
- [ ] Shipping address considered in calculations
- [ ] Cart synchronization works correctly
- [ ] Error handling graceful (fallbacks work)

### Performance Requirements

- [ ] Shipping fetch < 500ms (with cache)
- [ ] Shipping fetch < 2s (without cache, first time)
- [ ] Cart sync < 300ms per operation
- [ ] No unnecessary API calls (debouncing works)

### Quality Requirements

- [ ] Unit test coverage > 80%
- [ ] Integration tests cover all scenarios
- [ ] E2E tests cover checkout flow
- [ ] No regressions in existing functionality

---

## 10. Rollout Strategy

### Phase 1: Development (Week 1-2)
- Implement cart service
- Update shipping API
- Update checkout flow
- Internal testing

### Phase 2: Staging (Week 2-3)
- Deploy to staging
- QA testing
- Performance testing
- Fix issues

### Phase 3: Production (Week 3-4)
- Deploy to production
- Monitor metrics
- Gradual rollout (if needed)
- Full rollout

### Rollback Plan

If issues arise:
1. Revert to region-based shipping (keep code in place)
2. Feature flag to switch between implementations
3. Monitor error rates and performance

---

## 11. Metrics & Monitoring

### Key Metrics

**Performance**:
- Shipping API response time (p50, p95, p99)
- Cart sync operation time
- Cache hit rate
- API call count reduction

**Functional**:
- Promotion application rate
- originalAmount display rate
- Error rate (cart sync failures)
- Cart expiration rate

**Business**:
- Checkout completion rate
- Shipping option selection rate
- Free shipping promotion usage

### Monitoring

- Add structured logging for cart operations
- Track API call patterns
- Monitor error rates
- Alert on performance degradation

---

## 12. Dependencies

### External Dependencies

- **Medusa v2 Cart API**: Must support cart-based shipping options
- **Medusa Promotion Engine**: Must calculate promotions correctly
- **Cloudflare Workers**: For server-side caching (optional)

### Internal Dependencies

- **Cart Items with variantId**: All items must have `variantId` for cart sync
- **Shipping Address Format**: Must match Medusa's expected format
- **Error Handling**: Existing error handling infrastructure

---

## 13. Open Questions

1. **Medusa API Verification**: Does `GET /store/shipping-options?cart_id={id}` exist in Medusa v2?
   - **Action**: Test with actual Medusa instance
   - **Fallback**: Use alternative endpoint if needed

2. **Cart Expiration**: How long do Medusa carts persist?
   - **Action**: Research Medusa documentation
   - **Fallback**: Implement cart recreation logic

3. **Variant ID Coverage**: Do all products have variants with IDs?
   - **Action**: Audit product data
   - **Fallback**: Handle missing variantId gracefully

4. **Promotion Configuration**: Are promotions configured in Medusa backend?
   - **Action**: Verify promotion setup
   - **Fallback**: Document promotion requirements

---

## 14. Appendix

### API Contract Changes

**Before**:
```typescript
POST /api/shipping-rates
Body: { currency?: string, subtotal?: number }
Response: { shippingOptions: ShippingOption[] }
```

**After**:
```typescript
POST /api/shipping-rates
Body: { 
  cartItems: CartItem[], 
  shippingAddress?: Address, 
  currency: string,
  cartId?: string 
}
Response: { 
  shippingOptions: ShippingOption[],
  cartId: string 
}
```

### Cart Item Mapping

**Local Cart → Medusa Cart**:
```typescript
CartItem {
  variantId: string,    // Required for Medusa
  quantity: number,     // Required
  metadata?: {          // Optional
    color?: string,
    sku?: string
  }
}
```

### Shipping Address Mapping

**Stripe Address Element → Medusa Address**:
```typescript
{
  first_name: string,
  last_name: string,
  address_1: string,
  address_2?: string,
  city: string,
  country_code: string,  // ISO 3166-1 alpha-2
  postal_code: string,
  province?: string,
  phone?: string
}
```

---

_Generated during Sprint Planning_
_Trace ID: gt_scp_cart_shipping_2025_01_XX_

