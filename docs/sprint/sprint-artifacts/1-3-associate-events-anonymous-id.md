# Story 1.3: Associate Events with Anonymous User IDs

Status: Done

## Story

As a developer,
I want to associate captured events with an anonymous user ID,
so that we can analyze user journeys.

## Acceptance Criteria

1. **Given** events are being captured.
2. **When** a user visits the storefront for the first time.
   - **Then** a unique anonymous ID is generated for the user by PostHog.
3. **And** all subsequent events from that user are associated with this anonymous ID.

## Tasks / Subtasks

- [x] Verify `posthog-js` configuration in `apps/storefront/app/utils/posthog.ts`
  - [x] Ensure `persistence` is NOT disabled (default is cookie+localStorage, which is correct for our "info-only" policy).
  - [x] Explicitly check `bootstrap` options to ensure no ID overrides are happening unintentionally.
- [x] Add Test Verification
  - [x] Update `posthog.test.ts` to verify that `posthog.get_distinct_id()` returns a value after initialization (mocking `posthog-js` behavior or verifying the library is called correctly).
  - [x] Note: Since we mock `posthog-js` in tests, we are verifying OUR configuration passed to it, and trusting the library to generate IDs.

## Dev Notes

- **Architecture Decision**: Cookie Policy is "Decision 2.1: Information-only". We do not need to wait for consent to set cookies. Default `posthog-js` persistence is acceptable.
- **Technical Note**: This is largely a "verification" story. We rely on the SDK's default behavior.
- **Verification**: In a real browser, we check `posthog.get_distinct_id()`. In code, we ensure we don't pass `persistence: 'memory'` or `bootstrap: { distinctID: ... }` unless intended.

### Project Structure Notes

- `apps/storefront/app/utils/posthog.ts`

### References

- [Epic Overview](../../product/epics/overview.md)
- [Architecture Overview](../../architecture/overview.md)

## Dev Agent Record

### Context Reference

- Architecture Decision 2.1 & 2.2.

### Agent Model Used

Antigravity (bmad-bmm-create-story)

### Debug Log References

- Confirmed `posthog.init` in `posthog.ts` uses standard defaults which include persistence.

### Completion Notes List

- Story is ready-for-dev. Primarily verification work.
- [Code Review] explicit persistence added to posthog.ts.
- [Code Review] Added tests for reportWebVitals and loaded callback.

### File List

- apps/storefront/app/utils/posthog.ts
- apps/storefront/app/utils/posthog.test.ts
