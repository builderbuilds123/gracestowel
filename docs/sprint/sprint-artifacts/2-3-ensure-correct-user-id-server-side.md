# Story 2-3: Ensure Correct User ID Association for Server-Side Events

**Epic:** Epic 2 - Server-Side Tracking
**Status:** Done
**Prerequisites:** ✅ Story 2.1, ✅ Story 2.2

---

## User Story

As a developer,
I want to ensure that server-side events are associated with the correct user ID,
So that we have a complete and accurate user journey.

---

## Acceptance Criteria

| AC | Given | When | Then |
|----|-------|------|------|
| 1 | A server-side event is tracked (e.g., `order_placed`) | The event is processed | The event is associated with the user's distinct ID (Medusa customer ID) |

---

## Implementation Discovery

### Pre-existing Implementation Found

The server-side PostHog tracking in `order-placed.ts` already correctly handles user ID association:

```typescript
// apps/backend/src/subscribers/order-placed.ts:96
distinctId: order.customer_id || `guest_${order.id}`,
```

**Behavior:**
- **Authenticated users:** Uses `order.customer_id` (Medusa customer ID, e.g., `cust_01ABC...`)
- **Guest checkout:** Falls back to `guest_${order.id}` as a unique identifier

### Other Server-Side Events (System Events)

| Event | distinctId | Purpose |
|-------|------------|---------|
| `redis_recovery_triggered` | `system` | Infrastructure monitoring |
| `health_check` | `system_health_check` | Service health monitoring |

These are correctly using system identifiers since they are not user-initiated events.

---

## Tasks / Subtasks

- [x] Task 1: Validate Existing Implementation (AC: 1)
  - [x] Verify `order.customer_id` is correctly populated for authenticated orders
  - [x] Verify guest fallback logic works correctly
  - [x] Review Query graph to ensure customer_id is fetched (line 46)

- [x] Task 2: Unit Tests for distinctId Logic (AC: 1) — PRE-EXISTING
  - [x] Test: authenticated user order uses customer_id (lines 340-362)
  - [x] Test: guest order uses guest_${order.id} fallback (lines 365-388)
  - [x] Mock order data with/without customer_id

- [x] Task 3: Document User ID Flow
  - [x] Document end-to-end flow from client identify to server-side events
  - [x] Confirm PostHog user merging across client/server

---

## Dev Notes

- Medusa's `order.customer_id` is populated when customer is authenticated at checkout
- Guest checkouts have `customer_id: null`, hence the fallback pattern
- PostHog will automatically merge events when the same distinct_id is used across client and server
- The order Query graph already includes `customer_id` in the fields list (line 46)

---

## Dev Agent Record

### Context Reference

- `apps/backend/src/subscribers/order-placed.ts` - Main implementation
- `apps/backend/src/jobs/fallback-capture.ts` - System event reference
- `docs/project_context.md` - Testing rules

### Agent Model Used

Claude Opus 4.5 (via Cursor)

### Completion Notes List

- **Discovery:** Implementation and tests already exist from Story 2.1 work
- **Implementation verified in `order-placed.ts` line 96:**
  ```typescript
  distinctId: order.customer_id || `guest_${order.id}`,
  ```
- **Existing Tests (order-placed.unit.spec.ts):**
  - Lines 340-362: Validates `customer_id` used for authenticated orders
  - Lines 365-388: Validates `guest_${order.id}` fallback for guest checkout
- **Query graph includes `customer_id`** in fields list (line 46)
- **User ID Flow:**
  - Client: `posthog.identify(customer_id)` on login (CustomerContext.tsx)
  - Server: `order.customer_id` used as `distinctId` for order_placed
  - PostHog automatically merges events with same distinct_id
- **Test Results:** 270 backend unit tests pass (0 failures)

### File List

- `apps/backend/src/subscribers/order-placed.ts` - Implementation (line 96)
- `apps/backend/integration-tests/subscribers/order-placed.unit.spec.ts` - Tests (pre-existing)
- `docs/sprint/sprint-artifacts/2-3-ensure-correct-user-id-server-side.md` - Story file (created)
- `docs/sprint/sprint-artifacts/sprint-status.yaml` - Status updated

### Change Log

- 2025-12-13: Story created, validated existing implementation, confirmed test coverage. All ACs met by pre-existing code.
