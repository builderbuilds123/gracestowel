# Story 5.2.5: Form Interaction Tracking

Status: Done

## Story
As a UX Analyst,
I want form_interaction events,
So that we can spot form friction without capturing values.

## Acceptance Criteria
- Emit on focus, blur, submit, error with form_name, field_name (no values), interaction_type, error_message for validation only.
- Exclude sensitive fields; never send values; honor `respect_dnt`.
- Minimal payload; no PII.

## Notes
- Gate under `frontend-event-tracking` flag.

## Dev Agent Record
- Implemented `useFormTracking` hook in `apps/storefront/app/hooks/useFormTracking.ts`.
- Captures focus, blur, and submit interactions.
- Explicitly excludes password and hidden fields.
- Does not capture values, only field names.
- Added unit tests in `apps/storefront/app/hooks/useFormTracking.test.ts`.
- Verified with tests and typecheck.
