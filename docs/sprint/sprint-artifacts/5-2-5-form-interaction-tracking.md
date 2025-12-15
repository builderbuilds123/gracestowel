# Story 5.2.5: Form Interaction Tracking

Status: Todo

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
