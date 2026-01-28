# Group 3 Review: Client-Side Data Fetching & Re-render Optimization (MEDIUM-HIGH)

## Rules Reviewed
1. client-event-listeners.md - Deduplicate global event listeners
2. client-passive-event-listeners.md - Use passive event listeners
3. client-swr-dedup.md - Use SWR for automatic deduplication
4. client-localstorage-schema.md - Version and minimize localStorage data
5. rerender-defer-reads.md - Defer state reads to usage point
6. rerender-memo.md - Extract to memoized components
7. rerender-dependencies.md - Narrow effect dependencies
8. rerender-derived-state.md - Subscribe to derived state
9. rerender-functional-setstate.md - Use functional setState updates
10. rerender-lazy-state-init.md - Use lazy state initialization
11. rerender-transitions.md - Use transitions for non-urgent updates

## Findings

### ISSUE: useSearchParams() Subscription

**File:** `app/routes/checkout.tsx` - Line 57
```tsx
const [searchParams, setSearchParams] = useSearchParams();
// ...
useEffect(() => {
  const errorCode = searchParams.get("error");
  // ...
}, [searchParams]);
```

**Analysis:** `useSearchParams()` subscribes to all search param changes. If `error` is only read in the effect, consider reading it directly from `window.location.search` instead.

**Recommendation:** 
```tsx
useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  const errorCode = params.get("error");
  // ...
}, []); // No dependency needed
```

**Impact:** MEDIUM - Reduces unnecessary re-renders when other search params change.

---

### GOOD: useSearchParams() Used Correctly

**File:** `app/routes/account.reset-password.tsx` - Line 14
```tsx
const [searchParams] = useSearchParams();
const token = searchParams.get('token');
```

**Analysis:** Token is read during render, so subscription is necessary. ✅ Correct usage.

---

### POTENTIAL: Functional setState Updates

**Review needed:** Check for setState calls that depend on current state value.

**Pattern to check:**
```tsx
// ❌ Bad
setItems([...items, newItem])

// ✅ Good
setItems(curr => [...curr, newItem])
```

**Recommendation:** Review all `setState` calls in hooks and components for opportunities to use functional updates.

---

### GOOD: localStorage Versioning

**File:** `app/lib/storage-cache.ts` and `app/lib/storage-migration.ts`

**Analysis:** Storage utilities appear to handle versioning and migration. ✅ Good practice.

---

### NOTE: SWR Not Used

**Context:** Codebase uses custom hooks (`useMedusaProducts`, `useShippingRates`, etc.) instead of SWR.

**Analysis:** Custom hooks may provide better integration with Medusa API. If deduplication is needed, consider adding request deduplication to custom hooks.

**Recommendation:** Review custom hooks for request deduplication opportunities.

---

## Summary Statistics

- **Total Files Reviewed:** 150
- **Issues Found:** 1 (useSearchParams subscription)
- **Good Practices Found:** 2 (localStorage versioning, correct useSearchParams usage)
- **Potential Optimizations:** 2 (functional setState, request deduplication)
- **Priority:** MEDIUM - Most patterns are correct, minor optimizations available

## Recommendations

1. **Fix:** Optimize `useSearchParams()` usage in `checkout.tsx`
2. **Review:** Check for functional setState opportunities
3. **Consider:** Add request deduplication to custom data-fetching hooks if needed
