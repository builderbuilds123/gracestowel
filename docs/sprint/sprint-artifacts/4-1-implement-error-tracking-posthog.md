# Story 4-1: Implement Error Tracking with PostHog

**Epic:** Epic 4 - Production Monitoring & Observability
**Status:** Done
**Prerequisites:** ✅ Story 1.1

---

## User Story

As a developer,
I want to capture and track JavaScript errors in PostHog,
So that I can quickly identify and debug production issues.

---

## Acceptance Criteria

| AC | Given | When | Then |
|----|-------|------|------|
| 1 | The PostHog SDK is initialized in the storefront | An unhandled error or promise rejection occurs | An `$exception` event is captured in PostHog with error type, message, and stack trace |
| 2 | An error is captured | The event is sent to PostHog | The error event is linked to the user's session for debugging context |

---

## Tasks / Subtasks

- [x] Task 1: Implement Global Error Handlers (AC: 1)
  - [x] Add `window.onerror` handler for unhandled JavaScript errors
  - [x] Add `window.onunhandledrejection` handler for promise rejections
  - [x] Capture `$exception` events with PostHog standard properties

- [x] Task 2: Include Session Context (AC: 2)
  - [x] Include URL in exception events
  - [x] Include user agent for debugging
  - [x] Session recording already enabled (posthog.ts:27-29)

- [x] Task 3: Update ErrorBoundary (AC: 1, 2)
  - [x] Update React ErrorBoundary to use `$exception` event format
  - [x] Mark ErrorBoundary errors as `$exception_handled: true`

- [x] Task 4: Add Unit Tests
  - [x] Test window.onerror captures $exception events
  - [x] Test window.onunhandledrejection captures $exception events
  - [x] Test captureException utility function
  - [x] Verify stack trace and session context included

- [x] Task 5: Export Utility for Manual Exception Capture
  - [x] Create `captureException(error, context)` function
  - [x] Allow developers to manually capture handled exceptions

---

## Implementation Details

### New Functions in `posthog.ts`

```typescript
// Setup global error tracking
setupErrorTracking()

// Manually capture handled exceptions
captureException(error: Error, context?: Record<string, unknown>)
```

### PostHog $exception Event Properties

| Property | Description |
|----------|-------------|
| `$exception_type` | Error name (e.g., TypeError, Error) |
| `$exception_message` | Error message |
| `$exception_stack_trace_raw` | Full stack trace |
| `$exception_handled` | true/false - was it caught? |
| `$exception_synthetic` | false (not synthetic) |
| `$exception_source` | Source file (for onerror) |
| `$exception_lineno` | Line number |
| `$exception_colno` | Column number |
| `$exception_is_promise_rejection` | true if from promise |
| `url` | Current page URL |
| `user_agent` | Browser user agent |

---

## Dev Agent Record

### Context Reference

- `apps/storefront/app/utils/posthog.ts` - Error tracking implementation
- `apps/storefront/app/root.tsx` - ErrorBoundary and initialization

### Agent Model Used

Claude Opus 4.5 (via Cursor)

### Completion Notes List

- **Implementation (2025-12-13):**
  - Added `setupErrorTracking()` function with global error handlers
  - Added `captureException()` utility for manual exception capture
  - Updated ErrorBoundary to use `$exception` event format
  - Called `setupErrorTracking()` in root.tsx initialization

- **Tests Added:**
  - 8 new tests in `posthog.test.ts`:
    - window.onerror handler setup
    - window.onunhandledrejection handler setup
    - $exception event capture with correct properties
    - Stack trace inclusion
    - Session context (URL, user_agent)
    - captureException utility function

- **Test Results:** 122 storefront tests pass (0 failures, 0 regressions)

### File List

- `apps/storefront/app/utils/posthog.ts` - **MODIFIED** - Added setupErrorTracking(), captureException()
- `apps/storefront/app/utils/posthog.test.ts` - **MODIFIED** - Added 8 error tracking tests
- `apps/storefront/app/root.tsx` - **MODIFIED** - Updated ErrorBoundary, added setupErrorTracking() call
- `docs/sprint/sprint-artifacts/4-1-implement-error-tracking-posthog.md` - **NEW** - Story file
- `docs/sprint/sprint-artifacts/sprint-status.yaml` - **MODIFIED** - Status updated

### Change Log

- 2025-12-13: Implemented global error tracking with window.onerror and onunhandledrejection. Added captureException utility. Updated ErrorBoundary. Added 8 unit tests. All ACs met.
