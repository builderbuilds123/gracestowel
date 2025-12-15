# Story 9.5: Cart Expiration & Error Handling

Status: Ready for Development

## Story

As a Developer,
I want the system to handle cart expiration and API failures gracefully,
So that checkout never breaks due to cart sync issues.

## Acceptance Criteria

### Cart Expiration
1. **Given** a stored `cartId` references an expired or invalid cart
2. **When** the system attempts to use it
3. **Then** the system SHALL detect the error (404 or invalid response)
4. **And** create a new Medusa cart automatically
5. **And** clear the old `cartId` from sessionStorage

### API Failure Fallback
6. **Given** Medusa API is unavailable or returns an error
7. **When** shipping options are requested
8. **Then** the system SHALL fall back to region-based shipping fetch
9. **And** log the error with trace ID for debugging
10. **And** NOT block checkout flow

### Missing variantId Handling
11. **Given** a cart item lacks `variantId`
12. **When** syncing to Medusa cart
13. **Then** the system SHALL skip that item (not fail the sync)
14. **And** log a warning: "Item {title} skipped - no variantId"

### Partial Sync Failure
15. **Given** line item sync fails for a specific item
16. **When** the error is not critical (e.g., variant not found)
17. **Then** the system SHALL continue syncing remaining items
18. **And** return partial results rather than failing entirely

### Retry Logic
19. **Given** a transient network error occurs
20. **When** the first request fails
21. **Then** the system SHALL retry up to 2 times with exponential backoff
22. **And** fall back to region-based fetch if all retries fail

## Technical Contracts

### Error Detection & Recovery

```typescript
// apps/storefront/app/services/medusa-cart.ts

async function getCart(cartId: string): Promise<Cart | null> {
  try {
    const response = await medusaClient.store.cart.retrieve(cartId);
    return response.cart;
  } catch (error) {
    if (error.status === 404) {
      // Cart expired or deleted
      logger.warn('Cart not found, will create new', { cartId });
      sessionStorage.removeItem('medusa_cart_id');
      return null;
    }
    throw error;
  }
}

async function getOrCreateCart(regionId: string, currency: string): Promise<string> {
  const existingCartId = sessionStorage.getItem('medusa_cart_id');
  
  if (existingCartId) {
    const cart = await getCart(existingCartId);
    if (cart) return existingCartId;
    // Cart was invalid, fall through to create new
  }
  
  // Create new cart
  const response = await medusaClient.store.cart.create({
    region_id: regionId,
    currency_code: currency
  });
  
  const newCartId = response.cart.id;
  sessionStorage.setItem('medusa_cart_id', newCartId);
  return newCartId;
}
```

### Retry Logic with Exponential Backoff

```typescript
// apps/storefront/app/utils/retry.ts

interface RetryOptions {
  maxRetries: number;
  initialDelayMs: number;
  backoffFactor: number;
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 2,
  initialDelayMs: 200,
  backoffFactor: 2
};

async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = DEFAULT_RETRY_OPTIONS
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      // Don't retry on client errors (4xx)
      if (error.status >= 400 && error.status < 500) {
        throw error;
      }
      
      if (attempt < options.maxRetries) {
        const delay = options.initialDelayMs * Math.pow(options.backoffFactor, attempt);
        await sleep(delay);
      }
    }
  }
  
  throw lastError!;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

### Partial Sync with Error Collection

```typescript
async function syncCartItems(
  cartId: string, 
  localItems: CartItem[]
): Promise<{ cart: Cart; errors: SyncError[] }> {
  const errors: SyncError[] = [];
  
  // Filter items with variantId
  const syncableItems = localItems.filter(item => {
    if (!item.variantId) {
      logger.warn('Item skipped - no variantId', { title: item.title });
      errors.push({
        item: item.title,
        reason: 'missing_variant_id'
      });
      return false;
    }
    return true;
  });
  
  // Sync each item, collecting errors
  for (const item of syncableItems) {
    try {
      await medusaClient.store.cart.createLineItem(cartId, {
        variant_id: item.variantId,
        quantity: item.quantity
      });
    } catch (error) {
      if (error.status === 404) {
        logger.warn('Variant not found, skipping', { variantId: item.variantId });
        errors.push({
          item: item.title,
          reason: 'variant_not_found',
          variantId: item.variantId
        });
        continue; // Don't fail entire sync
      }
      throw error; // Re-throw unexpected errors
    }
  }
  
  // Retrieve updated cart
  const cart = await getCart(cartId);
  return { cart: cart!, errors };
}

interface SyncError {
  item: string;
  reason: 'missing_variant_id' | 'variant_not_found' | 'unknown';
  variantId?: string;
}
```

### Fallback to Region-Based Fetch

```typescript
// apps/storefront/app/routes/api.shipping-rates.ts

async function fetchShippingWithFallback(
  cartItems: CartItem[],
  address?: ShippingAddress,
  currency: string,
  cartId?: string
): Promise<ShippingResponse> {
  try {
    // Try cart-based fetch
    return await fetchCartBasedShipping(cartItems, address, currency, cartId);
  } catch (error) {
    logger.error('Cart-based shipping failed, using fallback', {
      error: error.message,
      traceId: getTraceId()
    });
    
    // Fallback to region-based fetch
    return await fetchRegionBasedShipping(currency);
  }
}

async function fetchRegionBasedShipping(currency: string): Promise<ShippingResponse> {
  const regions = await medusaClient.store.region.list();
  const region = regions.regions.find(r => r.currency_code === currency.toLowerCase());
  
  if (!region) {
    throw new Error(`No region found for currency: ${currency}`);
  }
  
  const options = await medusaClient.store.shippingOption.list({
    region_id: region.id
  });
  
  return {
    shippingOptions: options.shipping_options.map(mapShippingOption),
    cartId: null // No cart in fallback mode
  };
}
```

### Structured Logging

```typescript
// Error logging with trace IDs
logger.error('Cart sync failed', {
  traceId: getTraceId(),
  cartId,
  error: error.message,
  stack: error.stack,
  itemCount: localItems.length
});

// Warning for skipped items
logger.warn('Items skipped during sync', {
  traceId: getTraceId(),
  cartId,
  skippedCount: errors.length,
  reasons: errors.map(e => e.reason)
});
```

## Dev Notes

### Architecture Compliance

- **Pattern**: Graceful degradation with fallback
- **Logging**: Structured JSON logs with trace IDs
- **Resilience**: Retry for transient errors, skip for data errors

### Error Categories

| Error Type | Action | Retry? |
|------------|--------|--------|
| Cart 404 | Create new cart | No |
| Variant 404 | Skip item, continue | No |
| Network timeout | Retry with backoff | Yes |
| 5xx Server Error | Retry with backoff | Yes |
| 4xx Client Error | Fail immediately | No |

## Tasks / Subtasks

- [ ] **Utility**: Create `apps/storefront/app/utils/retry.ts`
    - [ ] Implement `withRetry()` with exponential backoff
    - [ ] Implement `sleep()` helper
- [ ] **Service**: Update `medusa-cart.ts`
    - [ ] Add cart expiration detection
    - [ ] Add automatic cart recreation
    - [ ] Add partial sync with error collection
- [ ] **API**: Update `api.shipping-rates.ts`
    - [ ] Add fallback to region-based fetch
    - [ ] Add structured error logging
- [ ] **Logging**: Ensure all errors include trace IDs

## Testing Requirements

### Unit Tests
- [ ] `getCart`: Returns null for 404, clears sessionStorage
- [ ] `getOrCreateCart`: Creates new cart when existing is invalid
- [ ] `syncCartItems`: Skips items without variantId
- [ ] `syncCartItems`: Continues after variant 404
- [ ] `withRetry`: Retries on 5xx, not on 4xx
- [ ] `withRetry`: Respects max retries

### Integration Tests
- [ ] Cart expiration: Old cart → automatic recreation → sync succeeds
- [ ] Partial sync: 2 valid items + 1 invalid → 2 synced, 1 error logged
- [ ] Fallback: Medusa down → region-based fetch succeeds
- [ ] Retry: First call fails, second succeeds → returns data

### E2E Tests
- [ ] Checkout completes even when cart sync partially fails
- [ ] Shipping options display even when Medusa is slow (fallback)

---

## File List

### New Files
- `apps/storefront/app/utils/retry.ts`

### Modified Files
- `apps/storefront/app/services/medusa-cart.ts`
- `apps/storefront/app/routes/api.shipping-rates.ts`

---

## Dependencies

| Dependency | Type | Notes |
|------------|------|-------|
| Story 9.1 | Blocking | Base service must exist |
| Story 9.2 | Blocking | API must support fallback |
| Logging utility | Existing | `lib/logger.ts` already exists |

---

## Monitoring & Alerts

### Metrics to Track
- Cart recreation rate (should be low)
- Fallback activation rate (should be rare)
- Sync error rate by reason
- Retry success rate

### Alert Thresholds
- Fallback rate > 5% → Warning
- Cart recreation rate > 10% → Warning
- Sync error rate > 1% → Investigate

---

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2025-12-14 | Initial story creation from Epic 9 | PM Agent |
