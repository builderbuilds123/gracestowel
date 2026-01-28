# Group 2 Review: Server-Side Performance (HIGH)

## Rules Reviewed
1. server-auth-actions.md - Authenticate server actions like API routes
2. server-dedup-props.md - Avoid duplicate serialization in RSC props
3. server-cache-lru.md - Cross-request LRU caching
4. server-serialization.md - Minimize serialization at RSC boundaries
5. server-parallel-fetching.md - Parallel data fetching with component composition
6. server-cache-react.md - Per-request deduplication with React.cache()
7. server-after-nonblocking.md - Use after() for non-blocking operations

## Findings

### GOOD: CSRF Validation on All API Routes

**Impact:** CRITICAL - Security requirement

All mutation API routes properly validate CSRF tokens:

✅ **Files with CSRF validation:**
- `app/routes/api.carts.$id.ts` - Line 58
- `app/routes/api.carts.ts` - Line 31
- `app/routes/api.carts.$id.complete.ts` - Line 27
- `app/routes/api.carts.$id.transfer.ts` - Line 25
- `app/routes/api.carts.$id.shipping-methods.ts` - Line 37
- `app/routes/api.checkout-session.ts` - Line 20
- `app/routes/api.payment-collections.ts` - Line 51
- `app/routes/api.payment-collections.$id.sessions.ts` - Line 34
- `app/routes/api.shipping-rates.ts` - Line 108
- `app/routes/api/$.tsx` - Line 19
- `app/routes/order_.$id.edit.tsx` - Line 276
- `app/routes/order_.status.$id.tsx` - Line 197

**Pattern:**
```tsx
const isValidCSRF = await validateCSRFToken(request, jwtSecret);
if (!isValidCSRF) {
  return data({ error: "Invalid CSRF token" }, { status: 403 });
}
```

✅ **Security:** All mutation endpoints are properly protected.

---

### GOOD: Parallel Data Fetching

**Files with proper parallelization:**

1. `app/routes/products.$handle.tsx` - Lines 84-96
   ```tsx
   const [regionInfo, productResponse] = await Promise.all([
       getDefaultRegion(medusa),
       medusa.store.product.list({...})
   ]);
   ```

2. `app/routes/towels.tsx` - Lines 35-43
   ```tsx
   const [regionInfo, productResponse] = await Promise.all([
       getDefaultRegion(medusa),
       medusa.store.product.list({...})
   ]);
   ```

3. `app/routes/products.$handle.tsx` - Lines 141-158
   ```tsx
   const reviewsPromise = fetchReviews(medusaProduct.id, context);
   const relatedProductsPromise = (async () => {...})();
   ```
   ✅ Reviews and related products fetched in parallel.

---

### NOTE: React.cache() Not Applicable

**Context:** This is React Router v7, not Next.js. React Router v7 doesn't use React Server Components in the same way, so `React.cache()` for per-request deduplication may not be applicable.

**Recommendation:** Review React Router v7 documentation for equivalent caching mechanisms if needed.

---

### NOTE: after() Not Available

**Context:** `after()` is a Next.js-specific API. React Router v7 doesn't have an equivalent.

**Current Pattern:** Logging and analytics are handled client-side via PostHog (deferred in `root.tsx`).

**Recommendation:** If server-side logging is needed, consider using Cloudflare Workers' `waitUntil()` API for non-blocking operations.

---

### POTENTIAL: Serialization Optimization

**File:** `app/routes/products.$handle.tsx` - Loader returns full product data

**Analysis:** The loader returns transformed product data. Need to verify if client components only use specific fields.

**Recommendation:** Review client components to ensure only necessary fields are passed across server/client boundary.

**Example check needed:**
```tsx
// Server loader
return { product, reviews, relatedProducts };

// Client component - verify only needed fields are used
function ProductPage({ product }) {
  // Does this component use all product fields?
  // Or could we pass only: { id, title, price, images, variants }?
}
```

---

### POTENTIAL: Duplicate Serialization

**File:** `app/routes/towels.tsx` - Line 55
```tsx
const allColors = [...new Set(transformedProducts.flatMap(p => p.colors))].sort;
```

**Note:** This creates a new array. If `allColors` is passed to a client component along with `transformedProducts`, there may be duplicate serialization of color data.

**Recommendation:** Extract colors on the client side if `transformedProducts` is already passed.

---

## Summary Statistics

- **Total Files Reviewed:** 150
- **Security Issues Found:** 0 ✅
- **Good Practices Found:** 2 (CSRF validation, parallel fetching)
- **Potential Optimizations:** 2 (serialization, duplicate props)
- **Priority:** MEDIUM - Security is solid, optimizations are incremental

## Recommendations

1. **Maintain:** Continue CSRF validation on all mutation endpoints
2. **Review:** Check for opportunities to minimize serialization at loader boundaries
3. **Consider:** If React Router v7 supports request-level caching, implement for expensive operations
4. **Monitor:** Ensure new API routes include CSRF validation
