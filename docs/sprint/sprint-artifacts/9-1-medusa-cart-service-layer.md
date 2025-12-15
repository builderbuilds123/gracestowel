# Story 9.1: Medusa Cart Service Layer

Status: Ready for Development

## Story

As a Developer,
I want a service layer that manages Medusa cart lifecycle,
So that we can sync local cart state to Medusa for promotion calculations.

## Acceptance Criteria

### Cart Creation & Retrieval
1. **Given** the storefront needs shipping options
2. **When** no Medusa cart exists for the session
3. **Then** the system SHALL create a new Medusa cart via `POST /store/carts`
4. **And** store the `cart_id` in sessionStorage for reuse

5. **Given** a Medusa cart already exists
6. **When** the cart ID is found in sessionStorage
7. **Then** the system SHALL retrieve the existing cart via `GET /store/carts/:id`
8. **And** handle cart expiration gracefully (create new if expired/404)

### Cart Item Synchronization
9. **Given** local cart items need to sync to Medusa
10. **When** `syncCartItems()` is called
11. **Then** the system SHALL add/update line items via `POST /store/carts/:id/line-items`
12. **And** only sync items that have a valid `variantId`
13. **And** log warnings for items without `variantId` (skip, don't fail)

### Shipping Address Update
14. **Given** a shipping address is provided
15. **When** `updateShippingAddress()` is called
16. **Then** the system SHALL update the cart via `POST /store/carts/:id`
17. **And** include all required address fields (first_name, last_name, address_1, city, country_code, postal_code)

### Shipping Options Fetch
18. **Given** a Medusa cart exists with items and optional address
19. **When** `getShippingOptions()` is called
20. **Then** the system SHALL fetch via `GET /store/shipping-options?cart_id={cart_id}`
21. **And** return shipping options with `amount` and `original_amount` fields

## Technical Contracts

### Service Interface

```typescript
// apps/storefront/app/services/medusa-cart.ts

interface MedusaCartService {
  getOrCreateCart(regionId: string, currencyCode: string): Promise<string>;
  getCart(cartId: string): Promise<Cart | null>;
  syncCartItems(cartId: string, localItems: CartItem[]): Promise<Cart>;
  updateShippingAddress(cartId: string, address: ShippingAddress): Promise<Cart>;
  getShippingOptions(cartId: string): Promise<ShippingOption[]>;
}

interface ShippingAddress {
  first_name: string;
  last_name: string;
  address_1: string;
  address_2?: string;
  city: string;
  country_code: string;  // ISO 3166-1 alpha-2
  postal_code: string;
  province?: string;
  phone?: string;
}

interface CartItem {
  variantId?: string;
  quantity: number;
  title: string;
  // ... other local cart fields
}
```

### Medusa API Endpoints

| Operation | Endpoint | Method |
|-----------|----------|--------|
| Create Cart | `/store/carts` | POST |
| Get Cart | `/store/carts/:id` | GET |
| Add Line Item | `/store/carts/:id/line-items` | POST |
| Update Cart | `/store/carts/:id` | POST |
| Get Shipping Options | `/store/shipping-options?cart_id={id}` | GET |

## Dev Notes

### Architecture Compliance

- **Location**: `apps/storefront/app/services/medusa-cart.ts`
- **Pattern**: Service layer following existing BFF patterns
- **SDK**: Use Medusa JS SDK (`@medusajs/js-sdk`) for API calls
- **Storage**: sessionStorage for cart ID (survives page refresh, clears on tab close)

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
```

### Pre-Implementation Verification

**CRITICAL**: Before implementing, verify these Medusa v2 endpoints exist:
1. `GET /store/shipping-options?cart_id={id}` — primary endpoint
2. Alternative: Check if shipping options are included in `GET /store/carts/:id` response

## Tasks / Subtasks

- [ ] **Verify API**: Test Medusa endpoints exist in dev environment
- [ ] **Service**: Create `apps/storefront/app/services/medusa-cart.ts`
    - [ ] Implement `getOrCreateCart()`
    - [ ] Implement `getCart()`
    - [ ] Implement `syncCartItems()`
    - [ ] Implement `updateShippingAddress()`
    - [ ] Implement `getShippingOptions()`
- [ ] **Types**: Add TypeScript interfaces for Cart, ShippingOption, etc.
- [ ] **Error Handling**: Implement graceful error handling with fallbacks
- [ ] **Logging**: Add structured logging with trace IDs

## Testing Requirements

### Unit Tests
- [ ] `getOrCreateCart`: Creates new cart when none exists
- [ ] `getOrCreateCart`: Returns existing cart ID from sessionStorage
- [ ] `getCart`: Returns null for expired/invalid cart (404)
- [ ] `syncCartItems`: Skips items without variantId
- [ ] `syncCartItems`: Handles partial failures gracefully
- [ ] `getShippingOptions`: Returns mapped shipping options

### Integration Tests
- [ ] Full flow: Create cart → sync items → get shipping options
- [ ] Cart expiration: Expired cart → automatic recreation
- [ ] Missing variantId: Items without variantId skipped, others synced

---

## File List

### New Files
- `apps/storefront/app/services/medusa-cart.ts`
- `apps/storefront/app/services/medusa-cart.test.ts`

### Modified Files
- None (new service)

---

## Dependencies

| Dependency | Type | Notes |
|------------|------|-------|
| Medusa JS SDK | Existing | Already installed |
| sessionStorage | Browser API | Standard, no polyfill needed |
| Medusa v2 Cart API | External | Must verify endpoints exist |

---

## Open Questions

1. **Cart Expiration**: How long do Medusa carts persist? Need to handle expiration gracefully.
2. **Region Detection**: How to determine `regionId` for cart creation? Use currency-based lookup?
3. **Line Item Sync**: Should we diff local vs Medusa cart, or always replace all items?

---

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2025-12-14 | Initial story creation from Epic 9 | PM Agent |
