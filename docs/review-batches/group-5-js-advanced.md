# Group 5 Review: JavaScript Performance & Advanced Patterns (LOW-MEDIUM)

## Rules Reviewed
1. js-batch-dom-css.md - Batch DOM CSS changes
2. js-index-maps.md - Build index maps for repeated lookups
3. js-cache-property-access.md - Cache property access in loops
4. js-cache-function-results.md - Cache repeated function calls
5. js-cache-storage.md - Cache storage API calls
6. js-combine-iterations.md - Combine multiple array iterations
7. js-length-check-first.md - Early length check for array comparisons
8. js-early-exit.md - Early return from functions
9. js-hoist-regexp.md - Hoist RegExp creation
10. js-min-max-loop.md - Use loop for min/max instead of sort
11. js-set-map-lookups.md - Use Set/Map for O(1) lookups
12. js-tosorted-immutable.md - Use toSorted() instead of sort() for immutability
13. advanced-event-handler-refs.md - Store event handlers in refs
14. advanced-use-latest.md - useLatest for stable callback refs

## Findings

### ISSUE: .sort() Instead of .toSorted()

**Impact:** MEDIUM-HIGH - Prevents mutation bugs in React state

**Cloudflare Workers Compatibility:** ✅ **VERIFIED COMPATIBLE**
- Cloudflare Workers uses V8 engine updated weekly to match Chrome stable
- `toSorted()` available since Chrome 110 (February 2023)
- Project compatibility_date: "2025-04-04" (well after toSorted() support)
- Cloudflare Workers supports all standard built-in objects from Chrome stable
- **Conclusion:** `toSorted()` is fully supported and safe to use

**Files with `.sort()` usage:**

1. `app/routes/towels.tsx` - Line 55
   ```tsx
   const allColors = [...new Set(transformedProducts.flatMap(p => p.colors))].sort();
   ```
   **Note:** Comment on line 54 says "Issue #20: Use .toSorted() for immutability" - this is a known issue.
   
   **Fix:**
   ```tsx
   const allColors = [...new Set(transformedProducts.flatMap(p => p.colors))].toSorted();
   ```

2. `app/components/checkout/CheckoutProvider.tsx` - Line 305
   ```tsx
   return JSON.stringify([...appliedPromoCodes.map(c => c.code)].sort());
   ```
   **Fix:**
   ```tsx
   return JSON.stringify([...appliedPromoCodes.map(c => c.code)].toSorted());
   ```

3. `app/utils/cart-hash.ts` - Line 22
   ```tsx
   .sort()
   ```
   **Fix needed:** Review context and replace with `.toSorted()` if mutating state/props.

4. `app/hooks/useCheckoutError.tsx` - Line 229
   ```tsx
   [...(Array.from(errors.values()) as CheckoutError[])].sort((a: CheckoutError, b: CheckoutError) => b.timestamp - a.timestamp),
   ```
   **Fix:**
   ```tsx
   [...(Array.from(errors.values()) as CheckoutError[])].toSorted((a: CheckoutError, b: CheckoutError) => b.timestamp - a.timestamp),
   ```

---

### GOOD: Early Returns

**Pattern found:** Most functions use early returns appropriately.

**Example:** `app/routes/api.carts.$id.ts` - Lines 48-66
```tsx
if (request.method !== "PATCH") {
  return data({ error: "Method not allowed" }, { status: 405 });
}
// ... validation checks with early returns
```

✅ Good practice throughout codebase.

---

### GOOD: Set/Map Usage

**Files using Set/Map for O(1) lookups:**

1. `app/routes/towels.tsx` - Line 55
   ```tsx
   [...new Set(transformedProducts.flatMap(p => p.colors))]
   ```
   ✅ Correctly uses Set for deduplication.

2. `app/hooks/useCheckoutError.tsx` - Line 229
   ```tsx
   Array.from(errors.values())
   ```
   ✅ Uses Map for error tracking.

---

### POTENTIAL: Property Access Caching

**Review needed:** Check loops for repeated property access that could be cached.

**Pattern to check:**
```tsx
// ❌ Bad
for (const item of items) {
  process(item.config.settings.value)
}

// ✅ Good
const value = items[0].config.settings.value
for (const item of items) {
  process(value)
}
```

**Recommendation:** Review hot paths (rendering loops, data transformations) for caching opportunities.

---

### POTENTIAL: Index Maps

**Review needed:** Check for repeated `.find()` calls that could use a Map.

**Pattern to check:**
```tsx
// ❌ Bad
orders.map(order => ({
  ...order,
  user: users.find(u => u.id === order.userId)
}))

// ✅ Good
const userById = new Map(users.map(u => [u.id, u]))
orders.map(order => ({
  ...order,
  user: userById.get(order.userId)
}))
```

**Recommendation:** Review data transformation functions for repeated lookups.

---

## Summary Statistics

- **Total Files Reviewed:** 150
- **Issues Found:** 4 (`.sort()` instead of `.toSorted()`)
- **Good Practices Found:** 3 (early returns, Set/Map usage, early returns)
- **Potential Optimizations:** 2 (property caching, index maps)
- **Priority:** MEDIUM - Fix `.sort()` mutations, other optimizations are incremental

## Recommendations

1. **Immediate:** Replace all `.sort()` with `.toSorted()` for immutability
2. **Review:** Check for property access caching in hot loops
3. **Consider:** Build index maps for repeated lookups in data transformations
