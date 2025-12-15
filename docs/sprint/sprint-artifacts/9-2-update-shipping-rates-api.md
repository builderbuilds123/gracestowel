# Story 9.2: Update Shipping Rates API for Cart Context

Status: Ready for Development

## Story

As a Developer,
I want the shipping rates API to use Medusa cart context,
So that shipping options include accurate promotion calculations.

## Acceptance Criteria

### Cart-Based Shipping Fetch
1. **Given** a request to `/api/shipping-rates`
2. **When** the request includes `cartItems` and optional `shippingAddress`
3. **Then** the system SHALL sync cart items to Medusa cart
4. **And** update shipping address if provided
5. **And** fetch shipping options via `GET /store/shipping-options?cart_id={cart_id}`

### Promotion Calculation
6. **Given** shipping options are returned from Medusa
7. **When** a promotion applies (e.g., free shipping over $99)
8. **Then** the response SHALL include `originalAmount` from Medusa's `original_amount` field
9. **And** `amount` SHALL reflect the discounted price (0 for free shipping)

### Cart Reuse
10. **Given** the API request includes a `cartId`
11. **When** the cart ID is valid
12. **Then** the system SHALL reuse the existing cart (no recreation)
13. **And** return the same `cartId` in the response for client caching

### Fallback Behavior
14. **Given** cart sync or Medusa API fails
15. **When** an error occurs
16. **Then** the system SHALL fall back to region-based shipping fetch
17. **And** log the error for debugging
18. **And** NOT block checkout flow

### Backward Compatibility
19. **Given** a request using the old format (subtotal only)
20. **When** no `cartItems` are provided
21. **Then** the system SHALL fall back to region-based fetch
22. **And** return shipping options without promotion context

## Technical Contracts

### API Contract Change

**Before (Current):**
```typescript
POST /api/shipping-rates
Request: { currency?: string, subtotal?: number }
Response: { shippingOptions: ShippingOption[] }
```

**After (New):**
```typescript
POST /api/shipping-rates
Request: {
  cartItems: CartItem[];      // Full cart items
  shippingAddress?: {         // Optional address
    first_name: string;
    last_name: string;
    address_1: string;
    city: string;
    country_code: string;
    postal_code: string;
    province?: string;
  };
  currency: string;
  cartId?: string;            // Optional for cart reuse
}

Response: {
  shippingOptions: ShippingOption[];
  cartId: string;             // Return for client caching
}
```

### ShippingOption Interface

```typescript
interface ShippingOption {
  id: string;
  name: string;
  amount: number;           // Discounted price (0 for free shipping)
  originalAmount?: number;  // Original price before promotion
  price_type: string;
  provider_id: string;
  is_return: boolean;
}
```

## Dev Notes

### Architecture Compliance

- **File**: `apps/storefront/app/routes/api.shipping-rates.ts`
- **Pattern**: BFF route handler (loader/action)
- **Service**: Use `medusa-cart.ts` service from Story 9.1

### Implementation Flow

```typescript
export async function action({ request }: ActionFunctionArgs) {
  const body = await request.json();
  const { cartItems, shippingAddress, currency, cartId } = body;

  // 1. Check if cart-based fetch is possible
  if (!cartItems || cartItems.length === 0) {
    return fallbackToRegionFetch(currency);
  }

  try {
    // 2. Get or create Medusa cart
    const medusaCartId = cartId || await getOrCreateCart(regionId, currency);

    // 3. Sync cart items
    await syncCartItems(medusaCartId, cartItems);

    // 4. Update shipping address if provided
    if (shippingAddress) {
      await updateShippingAddress(medusaCartId, shippingAddress);
    }

    // 5. Fetch shipping options with cart context
    const options = await getShippingOptions(medusaCartId);

    // 6. Map to frontend format
    return json({
      shippingOptions: mapShippingOptions(options),
      cartId: medusaCartId
    });

  } catch (error) {
    // 7. Fallback to region-based fetch
    logger.error('Cart-based shipping failed, falling back', { error });
    return fallbackToRegionFetch(currency);
  }
}
```

### Mapping originalAmount

```typescript
function mapShippingOptions(options: MedusaShippingOption[]): ShippingOption[] {
  return options.map(opt => ({
    id: opt.id,
    name: opt.name,
    amount: opt.amount ?? 0,
    originalAmount: opt.original_amount ?? opt.amount,  // Fallback to amount if no original
    price_type: opt.price_type,
    provider_id: opt.provider_id,
    is_return: opt.is_return ?? false
  }));
}
```

## Tasks / Subtasks

- [ ] **Types**: Update request/response TypeScript interfaces
- [ ] **Route**: Modify `api.shipping-rates.ts`
    - [ ] Parse new request body format
    - [ ] Integrate with `medusa-cart.ts` service
    - [ ] Implement cart sync flow
    - [ ] Map `original_amount` to `originalAmount`
- [ ] **Fallback**: Implement region-based fallback
    - [ ] Detect when cart-based fetch fails
    - [ ] Return valid response without promotion context
- [ ] **Logging**: Add structured logging for debugging
- [ ] **Backward Compat**: Support old request format

## Testing Requirements

### Unit Tests
- [ ] New request format parsed correctly
- [ ] Cart sync called with correct items
- [ ] Shipping address update called when provided
- [ ] `originalAmount` mapped from `original_amount`
- [ ] Fallback triggered on cart sync error
- [ ] Old request format still works (backward compat)

### Integration Tests
- [ ] Full flow: cartItems → sync → shipping options with promotion
- [ ] Free shipping: Cart >= $99 → amount=0, originalAmount=895
- [ ] No promotion: Cart < $99 → amount=originalAmount
- [ ] Fallback: Medusa error → region-based fetch succeeds
- [ ] Cart reuse: Same cartId → no new cart created

---

## File List

### New Files
- None

### Modified Files
- `apps/storefront/app/routes/api.shipping-rates.ts`
- `apps/storefront/app/routes/api.shipping-rates.test.ts`

---

## Dependencies

| Dependency | Type | Notes |
|------------|------|-------|
| Story 9.1 | Blocking | Medusa Cart Service must be implemented first |
| Medusa Promotion Config | External | Free shipping promotion must be configured |

---

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2025-12-14 | Initial story creation from Epic 9 | PM Agent |
