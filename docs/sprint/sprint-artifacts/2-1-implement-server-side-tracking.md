# Story 2.1: Implement Server-Side Event Tracking for Key Order Events

Status: ready-for-dev

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

- [ ] Task 1: Install and Configure PostHog Node SDK (AC: 1)
  - [ ] Install `posthog-node` package in `apps/backend`.
  - [ ] Add `POSTHOG_API_KEY` and `POSTHOG_HOST` to `apps/backend/.media.env` (and `.env` for dev).
  - [ ] Create a dedicated service/utility for PostHog client initialization (singleton pattern suggested).
  - [ ] Ensure distinct configuration for development/test vs production (e.g. `flushAt: 1` in dev/lambda-like).

- [ ] Task 2: Implement Order Placed Event Listener (AC: 2, 3)
  - [ ] Create a subscriber for `order.placed` event in Medusa.
  - [ ] In the subscriber handler, retrieve necessary order details (ID, user_id, total, currency).
  - [ ] Capture `order_placed` event using PostHog client.
  - [ ] Map order properties to event properties.

- [ ] Task 3: Ensure User Association (AC: 4, 5, 6)
  - [ ] Ensure `distinct_id` is set to the Medusa Customer ID if available.
  - [ ] If guest checkout, use email or a persistent session ID if available (consider privacy).
  - [ ] Verify handling of anonymous vs authenticated users.

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
- [Epic 2 Overview](docs/product/epics/overview.md#epic-2-comprehensive-data-capture--user-identification)

## Dev Agent Record

### Context Reference

- `docs/project_context.md` - **CRITICAL**: Deployment rules for Medusa backend.
- `docs/architecture/backend.md` - Backend architecture.
- `docs/architecture/integration.md` - Integration map.

### Agent Model Used

{{agent_model_name_version}}

### Completion Notes List

### File List
