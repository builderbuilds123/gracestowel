# Story 9.3: Update Checkout Flow for Cart-Based Shipping

Status: Ready for Development

## Story

As a Shopper,
I want shipping options to update accurately when I change my cart or address,
So that I see correct shipping costs including any promotions.

## Acceptance Criteria

### Initial Load
1. **Given** I am on the checkout page
2. **When** the page loads
3. **Then** the system SHALL pass full `cartItems` array to the shipping rates API
4. **And** store the returned `cartId` in sessionStorage

### Address Change
5. **Given** I enter or change my shipping address (via Stripe Address Element)
6. **When** the address is complete
7. **Then** the system SHALL call shipping rates API with `shippingAddress`
8. **And** shipping options SHALL update to reflect address-specific rates

### Free Shipping Display
9. **Given** free shipping promotion applies (cart >= $99)
10. **When** shipping options are displayed
11. **Then** I SHALL see the original price crossed out (e.g., "~~$8.95~~")
12. **And** the promotional price displayed (e.g., "FREE")

### Promotion Threshold Crossing
13. **Given** my cart total drops below the free shipping threshold
14. **When** shipping options refresh
15. **Then** the original shipping cost SHALL be restored
16. **And** the free shipping indicator SHALL be removed

### Cart ID Reuse
17. **Given** the shipping API returns a `cartId`
18. **When** subsequent requests are made
19. **Then** the system SHALL include `cartId` in the request for cart reuse

## Technical Contracts

### Checkout Component Changes

```typescript
// apps/storefront/app/routes/checkout.tsx

// State additions
const [medusaCartId, setMedusaCartId] = useState<string | null>(
  () => sessionStorage.getItem('medusa_cart_id')
);

// Shipping fetch function
async function fetchShippingOptions() {
  const response = await fetch('/api/shipping-rates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      cartItems: items,           // Full cart items array
      shippingAddress: address,   // From Stripe Address Element
      currency: 'CAD',
      cartId: medusaCartId        // Reuse existing cart
    })
  });

  const data = await response.json();
  setShippingOptions(data.shippingOptions);
  
  // Store cart ID for reuse
  if (data.cartId) {
    setMedusaCartId(data.cartId);
    sessionStorage.setItem('medusa_cart_id', data.cartId);
  }
}
```

### Address Mapping (Stripe → Medusa)

```typescript
function mapStripeAddressToMedusa(stripeAddress: StripeAddress): MedusaAddress {
  return {
    first_name: stripeAddress.name?.split(' ')[0] || '',
    last_name: stripeAddress.name?.split(' ').slice(1).join(' ') || '',
    address_1: stripeAddress.address?.line1 || '',
    address_2: stripeAddress.address?.line2 || undefined,
    city: stripeAddress.address?.city || '',
    country_code: stripeAddress.address?.country?.toLowerCase() || 'ca',
    postal_code: stripeAddress.address?.postal_code || '',
    province: stripeAddress.address?.state || undefined,
    phone: stripeAddress.phone || undefined
  };
}
```

### OrderSummary Display

```tsx
// apps/storefront/app/components/OrderSummary.tsx

{shippingOption && (
  <div className="flex justify-between">
    <span>Shipping</span>
    <span>
      {shippingOption.amount === 0 ? (
        <>
          {shippingOption.originalAmount && (
            <span className="line-through text-gray-400 mr-2">
              {formatPrice(shippingOption.originalAmount)}
            </span>
          )}
          <span className="text-green-600 font-medium">FREE</span>
        </>
      ) : (
        formatPrice(shippingOption.amount)
      )}
    </span>
  </div>
)}
```

## Dev Notes

### Architecture Compliance

- **File**: `apps/storefront/app/routes/checkout.tsx`
- **Pattern**: React hooks for state, useEffect for data fetching
- **Integration**: Stripe Address Element onChange handler

### useEffect Dependencies

```typescript
// Fetch shipping when cart items or address change
useEffect(() => {
  if (items.length > 0) {
    fetchShippingOptions();
  }
}, [items, address, medusaCartId]);
```

### Stripe Address Element Integration

```typescript
<AddressElement
  options={{ mode: 'shipping' }}
  onChange={(event) => {
    if (event.complete) {
      const mappedAddress = mapStripeAddressToMedusa(event.value);
      setAddress(mappedAddress);
      // Shipping fetch will trigger via useEffect
    }
  }}
/>
```

## Tasks / Subtasks

- [ ] **State**: Add `medusaCartId` state with sessionStorage persistence
- [ ] **Fetch**: Update shipping fetch to pass `cartItems` and `cartId`
- [ ] **Address**: Map Stripe Address Element to Medusa format
- [ ] **Display**: Update OrderSummary to show originalAmount strikethrough
- [ ] **useEffect**: Update dependencies to trigger on cart/address change
- [ ] **Storage**: Persist cartId in sessionStorage

## Testing Requirements

### Unit Tests
- [ ] `mapStripeAddressToMedusa`: Correct field mapping
- [ ] OrderSummary: Shows strikethrough for free shipping
- [ ] OrderSummary: Shows normal price when no promotion

### Integration Tests
- [ ] Page load: Shipping options fetched with cart items
- [ ] Address change: Shipping options refresh
- [ ] Cart ID: Persisted and reused across requests

### E2E Tests
- [ ] Full checkout flow with free shipping display
- [ ] Address change updates shipping options
- [ ] Cart modification updates shipping (if cart page integration)

---

## File List

### New Files
- None

### Modified Files
- `apps/storefront/app/routes/checkout.tsx`
- `apps/storefront/app/components/OrderSummary.tsx` (verify/update)

---

## Dependencies

| Dependency | Type | Notes |
|------------|------|-------|
| Story 9.2 | Blocking | Shipping API must accept new format |
| Stripe Address Element | Existing | Already integrated |

---

## UI/UX Notes

### Free Shipping Display

When free shipping applies:
- Original price shown with strikethrough: ~~$8.95~~
- "FREE" label in green
- Tooltip (optional): "Free shipping on orders over $99"

### Loading State

While shipping options are being fetched:
- Show skeleton loader or spinner
- Disable "Continue to Payment" button
- Show "Calculating shipping..." text

---

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2025-12-14 | Initial story creation from Epic 9 | PM Agent |
