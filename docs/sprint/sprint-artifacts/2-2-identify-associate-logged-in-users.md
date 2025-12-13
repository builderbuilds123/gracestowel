# Story 2.2: Identify and Associate Logged-in Users with Events

Status: Ready for Review

## Story

As a developer,
I want to identify logged-in users and associate their events with their user ID,
So that we can track their behavior across sessions and devices.

## Acceptance Criteria

1. **Given** a user is logged in.
2. **When** the user performs a tracked event (e.g., `product_viewed`).
3. **Then** the event is associated with their unique user ID (Medusa customer ID) in PostHog.
4. **And** their anonymous ID is aliased to their user ID to merge their pre-login and post-login activity.

## Tasks / Subtasks

- [x] Task 1: Validate Existing Implementation (AC: 1, 2, 3)
  - [x] Review `CustomerContext.tsx` to confirm `posthog.identify()` is called on login/auth
  - [x] Verify customer ID is used as distinct_id
  - [x] Verify user properties (email, first_name, last_name) are sent
  - [x] Confirm `posthog.reset()` is called on logout

- [x] Task 2: Add Unit Tests for PostHog Identify Integration (AC: 1, 2, 3)
  - [x] Create `CustomerContext.test.tsx` with tests for:
    - [x] `posthog.identify()` called with customer.id when customer data is fetched
    - [x] User properties passed correctly to identify()
    - [x] `posthog.reset()` called on logout
  - [x] Mock PostHog module appropriately

- [x] Task 3: Verify Anonymous ID Aliasing Behavior (AC: 4)
  - [x] Document that PostHog's `identify()` automatically aliases anonymous ID
  - [x] Add test confirming identify() is called (which triggers aliasing)
  - [x] Update Dev Notes with aliasing confirmation

- [x] Task 4: Add Event Tracking Test for Logged-in User (AC: 2, 3)
  - [x] Verify that events include distinct_id after login (via identify() call)
  - [x] Test that identify() sets customer ID as distinct_id

## Dev Notes

### Existing Implementation Discovery

**IMPORTANT:** Implementation already exists in `apps/storefront/app/context/CustomerContext.tsx`:

```typescript
// Line 86-96: PostHog identify on customer fetch
if (typeof window !== 'undefined' && data.customer) {
    import('../utils/posthog').then(({ default: posthog }) => {
        posthog.identify(data.customer.id, {
            email: data.customer.email,
            first_name: data.customer.first_name,
            last_name: data.customer.last_name,
            created_at: data.customer.created_at,
        });
    });
}

// Line 194-200: PostHog reset on logout
if (typeof window !== 'undefined') {
    import('../utils/posthog').then(({ default: posthog }) => {
        posthog.reset();
    });
}
```

### What This Story Needs

1. **Validation** — Confirm implementation meets all ACs
2. **Tests** — Add unit tests for CustomerContext PostHog integration (currently missing)
3. **Documentation** — Document aliasing behavior (AC4)

### PostHog Aliasing Note (AC4)

PostHog's `identify(distinctId)` automatically handles aliasing:
- When called, PostHog links the current anonymous ID to the provided distinct_id
- All previous events under the anonymous ID are retroactively associated with the user
- No explicit `alias()` call is needed when using `identify()`

Reference: https://posthog.com/docs/product-analytics/identify

### Architecture Notes

- **Location:** `apps/storefront/app/context/CustomerContext.tsx`
- **PostHog Client:** `apps/storefront/app/utils/posthog.ts`
- **Test Framework:** Vitest with jsdom
- **Test Location:** `apps/storefront/app/context/CustomerContext.test.tsx` (to be created)

### Testing Strategy

Use Vitest with jsdom environment. Mock:
- `posthog-js` module
- `fetch` for API calls to Medusa backend

## Dev Agent Record

### Context Reference

- `docs/project_context.md` - Frontend testing rules
- `apps/storefront/app/utils/posthog.test.ts` - Existing PostHog tests for reference

### Agent Model Used

Claude Opus 4.5 (via Cursor)

### Completion Notes List

- **Discovery:** Implementation already existed in `CustomerContext.tsx`:
  - `posthog.identify(customer.id, {...})` on line 89 when customer data is fetched
  - `posthog.reset()` on line 197 when user logs out
  - User properties sent: email, first_name, last_name, created_at

- **Tests Added (2025-12-13):**
  - Created `apps/storefront/app/context/CustomerContext.test.tsx` with 7 tests:
    - `posthog.identify()` called with customer.id when customer data is fetched
    - Medusa customer ID used as distinct_id (AC3)
    - User properties (email, first_name, last_name, created_at) sent correctly
    - No identify call on auth failure
    - `posthog.reset()` called on logout
    - Customer state cleared on logout
    - Anonymous ID aliasing verified (AC4) - identify() handles this automatically

- **AC4 Aliasing Verification:**
  - PostHog's `identify(distinctId)` automatically aliases the current anonymous ID to the provided distinct_id
  - All previous events under the anonymous ID are retroactively associated with the user
  - No explicit `alias()` call needed - this is PostHog's documented behavior
  - Reference: https://posthog.com/docs/product-analytics/identify

- **Test Results:** 114 storefront tests pass (0 failures, 0 regressions)

### File List

- `apps/storefront/app/context/CustomerContext.tsx` - PostHog identify/reset integration (pre-existing)
- `apps/storefront/app/utils/posthog.ts` - PostHog client utility (pre-existing)
- `apps/storefront/app/context/CustomerContext.test.tsx` - **NEW**: PostHog integration tests
- `docs/sprint/sprint-artifacts/2-2-identify-associate-logged-in-users.md` - Story file (created)
- `docs/sprint/sprint-artifacts/sprint-status.yaml` - **MODIFIED**: Story status updated

### Change Log

- 2025-12-13: Created story file, added 7 unit tests for PostHog identify/reset integration. Story validated and marked Ready for Review.
