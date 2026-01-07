# Story 2.1: Implement Server-Side Event Tracking for Key Order Events

Status: Ready for Review

## Story

As a developer,
I want to implement server-side event tracking for key order events,
So that we can reliably capture conversion data.

## Acceptance Criteria

1.  **Given** the PostHog SDK is configured on the backend.
2.  **When** an order is successfully placed (e.g., `order.placed` event).
3.  **Then** a server-side `order_placed` event is captured with the order ID, total amount, and currency.
4.  **And** the event is associated with the correct user ID.
5.  **Given** a user ID is available in the context.
6.  **Then** the event uses `distinct_id` matching the Medusa Customer ID.

## Tasks / Subtasks

- [x] Task 1: Install and Configure PostHog Node SDK (AC: 1)
  - [x] Install `posthog-node` package in `apps/backend`.
  - [x] Add `POSTHOG_API_KEY` and `POSTHOG_HOST` to `apps/backend/.env.example` (and `.env` for dev).
  - [x] Create a dedicated service/utility for PostHog client initialization (singleton pattern suggested).
  - [x] Ensure distinct configuration for development/test vs production (e.g. `flushAt: 1` in dev/lambda-like).

- [x] Task 2: Implement Order Placed Event Listener (AC: 2, 3)
  - [x] Create a subscriber for `order.placed` event in Medusa.
  - [x] In the subscriber handler, retrieve necessary order details (ID, user_id, total, currency).
  - [x] Capture `order_placed` event using PostHog client.
  - [x] Map order properties to event properties.

- [x] Task 3: Ensure User Association (AC: 4, 5, 6)
  - [x] Ensure `distinct_id` is set to the Medusa Customer ID if available.
  - [x] If guest checkout, use `guest_${order.id}` as fallback (privacy-safe).
  - [x] Verify handling of anonymous vs authenticated users.

## Dev Notes

- **Library**: Use `posthog-node` (v5.17.2+ recommended).
- **Architecture**:
  - Encapsulate PostHog logic in a module or service, do not scatter `posthog.capture` calls.
  - Use Medusa Subscribers (`src/subscribers`) for async event handling.
  - **Do NOT** block the main thread. PostHog SDK caches and flushes async, but be mindful of process termination (ensure flush on shutdown if needed).
- **Testing**:
  - Mock PostHog client in unit tests.
  - Verify event payload structure.

### Project Structure Notes

- **Backend Location**: `apps/backend`
- **Modules**: Consider if this belongs in `core` or a separate `analytics` module. Given implementation rules, `services` within modules is preferred, but for cross-cutting like this, a shared provider or subscriber in `src/subscribers` is common.
- **Config**: Use `medusa-config.ts` if creating a plugin/module, or standard env vars.

### References

- [PostHog-Node SDK](https://posthog.com/docs/libraries/node)
- [Medusa Subscribers](https://docs.medusajs.com/v2/advanced-development/events-and-subscribers)
- [Epic 2 Overview](../../product/epics/overview.md)

## Dev Agent Record

### Context Reference

- `docs/project_context.md` - **CRITICAL**: Deployment rules for Medusa backend.
- `docs/architecture/backend.md` - Backend architecture.
- `docs/architecture/integration.md` - Integration map.

### Agent Model Used

Claude Opus 4.5 (via Cursor)

### Completion Notes List

- **Discovery:** Implementation was already complete in codebase prior to story execution:
  - `posthog-node` v5.14.1 already installed in `package.json`
  - PostHog utility already exists at `src/utils/posthog.ts` with singleton pattern and serverless config
  - `order_placed` event tracking already implemented in `src/subscribers/order-placed.ts`
  - All ACs were already satisfied by existing code

- **Gap Identified:** Comprehensive unit tests for PostHog functionality were missing

- **Tests Added (2025-12-13):**
  - Created `integration-tests/unit/posthog.unit.spec.ts` - 9 tests covering:
    - AC1: SDK initialization with API key and host
    - AC1: Default host fallback
    - AC1: Graceful degradation when not configured
    - AC1: Singleton pattern verification
    - AC1: Serverless configuration (flushAt: 1)
    - Shutdown functionality
  
  - Extended `integration-tests/subscribers/order-placed.unit.spec.ts` - Added 9 tests covering:
    - AC2, AC3: Event captured with correct properties (order_id, total, currency, items)
    - AC4, AC5, AC6: customer_id used as distinctId for authenticated users
    - AC4, AC6: guest_${order.id} fallback for guest checkout
    - AC3: Multi-item orders include all items
    - Graceful handling of null PostHog client
    - Error handling for PostHog API failures

- **Test Results:** 270 unit tests pass (0 failures, 0 regressions)

### File List

- `apps/backend/src/utils/posthog.ts` - PostHog client utility (pre-existing)
- `apps/backend/src/subscribers/order-placed.ts` - Order placed event handler with PostHog tracking (pre-existing)
- `apps/backend/package.json` - posthog-node dependency (pre-existing)
- `apps/backend/.env.example` - POSTHOG_API_KEY, POSTHOG_HOST env vars (pre-existing)
- `apps/backend/integration-tests/unit/posthog.unit.spec.ts` - **NEW**: PostHog utility tests
- `apps/backend/integration-tests/subscribers/order-placed.unit.spec.ts` - **MODIFIED**: Added PostHog tracking tests
- `docs/sprint/sprint-artifacts/sprint-status.yaml` - **MODIFIED**: Story status updated

### Change Log

- 2025-12-13: Added comprehensive PostHog unit tests (18 new tests). Story validated and marked Ready for Review.
