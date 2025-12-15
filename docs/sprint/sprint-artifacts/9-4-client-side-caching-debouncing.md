# Story 9.4: Client-Side Caching & Debouncing

Status: Ready for Development

## Story

As a Developer,
I want shipping API calls to be cached and debounced,
So that we minimize unnecessary API calls and improve performance.

## Acceptance Criteria

### Caching
1. **Given** shipping options were recently fetched
2. **When** the same cart state and address are requested again
3. **Then** the system SHALL return cached results (5-minute TTL)
4. **And** skip the API call entirely

5. **Given** the cart or address changes
6. **When** a new cache key is generated
7. **Then** the system SHALL fetch fresh shipping options
8. **And** cache the new results

### Debouncing
9. **Given** rapid cart changes occur (e.g., quantity adjustments)
10. **When** multiple shipping fetches would be triggered
11. **Then** the system SHALL debounce requests (300ms delay)
12. **And** only execute the final request

### Cache Invalidation
13. **Given** the cart hash changes (items added/removed/quantity changed)
14. **When** shipping options are requested
15. **Then** the cache SHALL be invalidated
16. **And** fresh data SHALL be fetched

## Technical Contracts

### Cache Key Strategy

```typescript
// Generate deterministic cache key from cart state
function generateCacheKey(cartItems: CartItem[], postalCode?: string): string {
  const cartHash = hashCart(cartItems);
  return `shipping_${cartHash}_${postalCode || 'no-address'}`;
}

function hashCart(items: CartItem[]): string {
  // Sort items for deterministic hash
  const sorted = [...items].sort((a, b) => 
    (a.variantId || '').localeCompare(b.variantId || '')
  );
  
  const hashInput = sorted.map(item => 
    `${item.variantId}:${item.quantity}`
  ).join('|');
  
  // Simple hash function (or use crypto.subtle for production)
  return btoa(hashInput).slice(0, 16);
}
```

### Cache Structure

```typescript
interface ShippingCache {
  data: ShippingOption[];
  cartId: string;
  timestamp: number;
  expiresAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getCachedShipping(cacheKey: string): ShippingCache | null {
  const cached = sessionStorage.getItem(cacheKey);
  if (!cached) return null;
  
  const parsed: ShippingCache = JSON.parse(cached);
  if (Date.now() > parsed.expiresAt) {
    sessionStorage.removeItem(cacheKey);
    return null;
  }
  
  return parsed;
}

function setCachedShipping(cacheKey: string, data: ShippingOption[], cartId: string): void {
  const cache: ShippingCache = {
    data,
    cartId,
    timestamp: Date.now(),
    expiresAt: Date.now() + CACHE_TTL_MS
  };
  sessionStorage.setItem(cacheKey, JSON.stringify(cache));
}
```

### Debounce Implementation

```typescript
// Custom hook for debounced shipping fetch
function useShippingOptions(cartItems: CartItem[], address?: ShippingAddress) {
  const [shippingOptions, setShippingOptions] = useState<ShippingOption[]>([]);
  const [cartId, setCartId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const debouncedFetch = useMemo(
    () => debounce(async (items: CartItem[], addr?: ShippingAddress) => {
      const cacheKey = generateCacheKey(items, addr?.postal_code);
      
      // Check cache first
      const cached = getCachedShipping(cacheKey);
      if (cached) {
        setShippingOptions(cached.data);
        setCartId(cached.cartId);
        return;
      }

      // Fetch fresh data
      setIsLoading(true);
      try {
        const response = await fetch('/api/shipping-rates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cartItems: items,
            shippingAddress: addr,
            currency: 'CAD',
            cartId
          })
        });

        const data = await response.json();
        setShippingOptions(data.shippingOptions);
        setCartId(data.cartId);
        
        // Cache the result
        setCachedShipping(cacheKey, data.shippingOptions, data.cartId);
      } finally {
        setIsLoading(false);
      }
    }, 300),
    [cartId]
  );

  useEffect(() => {
    if (cartItems.length > 0) {
      debouncedFetch(cartItems, address);
    }
    
    return () => debouncedFetch.cancel();
  }, [cartItems, address, debouncedFetch]);

  return { shippingOptions, cartId, isLoading };
}
```

### Debounce Utility

```typescript
// apps/storefront/app/utils/debounce.ts

interface DebouncedFunction<T extends (...args: any[]) => any> {
  (...args: Parameters<T>): void;
  cancel: () => void;
}

function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): DebouncedFunction<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const debounced = (...args: Parameters<T>) => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };

  debounced.cancel = () => {
    if (timeoutId) clearTimeout(timeoutId);
  };

  return debounced;
}
```

## Dev Notes

### Architecture Compliance

- **Pattern**: Consistent with existing debounce in payment intent flow
- **Storage**: sessionStorage for cache (clears on tab close)
- **Hook**: Custom React hook for reusability

### Performance Considerations

- 300ms debounce balances responsiveness with API efficiency
- 5-minute TTL prevents stale data while reducing API calls
- Cache key includes postal code for address-specific rates

### Edge Cases

1. **Tab Switch**: Cache persists in sessionStorage
2. **Page Refresh**: Cache persists, cartId may need recreation
3. **Multiple Tabs**: Each tab has independent cache (acceptable)

## Tasks / Subtasks

- [ ] **Utility**: Create `apps/storefront/app/utils/cart-hash.ts`
    - [ ] Implement `hashCart()` function
    - [ ] Implement `generateCacheKey()` function
- [ ] **Utility**: Create `apps/storefront/app/utils/debounce.ts`
    - [ ] Implement debounce with cancel support
- [ ] **Cache**: Implement shipping cache functions
    - [ ] `getCachedShipping()`
    - [ ] `setCachedShipping()`
- [ ] **Hook**: Create `useShippingOptions` hook (or integrate into checkout)
- [ ] **Integration**: Wire up in checkout.tsx

## Testing Requirements

### Unit Tests
- [ ] `hashCart`: Same items produce same hash
- [ ] `hashCart`: Different quantities produce different hash
- [ ] `hashCart`: Order of items doesn't affect hash
- [ ] `generateCacheKey`: Includes postal code when provided
- [ ] Cache: Returns null for expired entries
- [ ] Cache: Returns data for valid entries
- [ ] Debounce: Only final call executes

### Integration Tests
- [ ] Rapid quantity changes: Only one API call after 300ms
- [ ] Same cart state: Returns cached data, no API call
- [ ] Cart change: Invalidates cache, fetches fresh data
- [ ] Address change: New cache key, fetches fresh data

---

## File List

### New Files
- `apps/storefront/app/utils/cart-hash.ts`
- `apps/storefront/app/utils/debounce.ts`
- `apps/storefront/app/hooks/useShippingOptions.ts` (optional)

### Modified Files
- `apps/storefront/app/routes/checkout.tsx`

---

## Dependencies

| Dependency | Type | Notes |
|------------|------|-------|
| Story 9.2 | Blocking | API must return cartId for caching |
| Story 9.3 | Parallel | Can be developed alongside checkout changes |

---

## Performance Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Cache Hit Rate | > 50% | Track via logging |
| API Calls Reduced | > 60% | Compare before/after |
| Debounce Effectiveness | < 2 calls per checkout | Monitor in production |

---

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2025-12-14 | Initial story creation from Epic 9 | PM Agent |
