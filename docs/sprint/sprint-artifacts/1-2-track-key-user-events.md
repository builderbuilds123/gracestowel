# Story 1.2: Track Key User Events on the Storefront

Status: Done

## Story

As a developer,
I want to track key user events on the storefront,
so that we can understand user behavior.

## Acceptance Criteria

1.  **Given** the PostHog SDK is initialized.
2.  **When** a user views a product page.
    -   **Then** a `product_viewed` event is captured with: `product_id`, `product_name`, `product_price`, `product_handle`, `stock_status`.
3.  **When** a user adds a product to the cart.
    -   **Then** a `product_added_to_cart` event is captured with: `product_id`, `product_name`, `product_price`, `quantity`, `color`, `has_embroidery`, `variant_id`.
4.  **When** a user starts the checkout process (lands on checkout page).
    -   **Then** a `checkout_started` event is captured with: `cart_total`, `item_count`, `currency`, and `items` array.

## Tasks / Subtasks

- [ ] Refactor `product_viewed` tracking in `products.$handle.tsx`
    - [ ] **BUG FIX**: Change from `useState` initializer to `useEffect` to prevent multiple firings and side-effects in render.
    - [ ] Verify payload properties against AC.
- [ ] Verify `product_added_to_cart` in `ProductActions.tsx`
    - [ ] Ensure payload matches AC.
    - [ ] Verify `has_embroidery` logic.
- [ ] Verify `checkout_started` in `checkout.tsx`
    - [ ] Ensure event fires ONCE on mount (useEffect is correct).
    - [ ] Verify payload matches AC.
- [ ] Add Tests for Event Tracking
    - [ ] Create/Update unit tests for `products.$handle.tsx`, `ProductActions.tsx`, and `checkout.tsx` to mock PostHog and assert calls.

## Dev Notes

-   **Existing Code**:
    -   `apps/storefront/app/routes/products.$handle.tsx`: Has tracking but uses **ANTIPATTERN** `useState` for side-effect. Must fix.
    -   `apps/storefront/app/components/ProductActions.tsx`: Looks correct.
    -   `apps/storefront/app/routes/checkout.tsx`: Looks correct.
-   **Naming**: Ensure `snake_case` properties (Decision 1.1).
-   **Testing**: Use `vi.spyOn` for dynamic imports or mock existing `apps/storefront/app/utils/posthog.ts`.

### Project Structure Notes

-   Components: `apps/storefront/app/components/`
-   Routes: `apps/storefront/app/routes/`

### References

-   [Epic Overview](../../product/epics/overview.md)
-   [Architecture: PostHog Integration](../../architecture/integrations.md)
-   [Project Context](../../project_context.md)

## Dev Agent Record

### Context Reference

-   Architecture Decision 1.1: Event naming convention `simple_snake_case`.
-   Identified bug in `products.$handle.tsx`.

### Agent Model Used

Antigravity (bmad-bmm-create-story)

### Debug Log References

-   Found existing code during analysis.
-   Identified `useState` side-effect issue.

### Notes
- Identified and fixed an anti-pattern in `products.$handle.tsx` where `useState` initializer was used for side effects. Refactored to `useEffect`.
- Identified and fixed a race condition in `checkout.tsx` where `checkout_started` event was missed if cart data loaded asynchronously. Implemented a `useRef` guard with proper dependency tracking.
- Verified `product_added_to_cart` payload in `ProductActions.tsx`.
- Added comprehensive unit tests in `apps/storefront/app/routes/products.$handle.test.tsx`, `apps/storefront/app/components/ProductActions.test.tsx`, and `apps/storefront/app/routes/checkout.test.tsx`.

### File List
- `apps/storefront/app/routes/products.$handle.tsx`
- `apps/storefront/app/routes/checkout.tsx`
- `apps/storefront/app/components/ProductActions.tsx` (Verification only)
- `apps/storefront/app/routes/products.$handle.test.tsx` (New)
- `apps/storefront/app/components/ProductActions.test.tsx` (New)
- `apps/storefront/app/routes/checkout.test.tsx` (New)
