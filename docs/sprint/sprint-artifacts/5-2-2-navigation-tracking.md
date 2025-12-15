# Story 5.2.2: Navigation Tracking

Status: Todo

## Story
As a User Researcher,
I want navigation events on every route change,
So that we know flow patterns and dwell time between pages.

## Acceptance Criteria
- Emit `navigation` with from_path, to_path, navigation_type (link, back, forward, direct), and time_on_previous_page_ms.
- Works with React Router transitions and browser back/forward.
- Honor `respect_dnt`; gated under `frontend-event-tracking` flag.

## Notes
- Use existing PostHog client; ensure payload is minimal.
