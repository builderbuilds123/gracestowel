# Story 5.2.4: Engagement & Idle Tracking

Status: Todo

## Story
As a PM,
I want page_engagement data,
So that we can measure engaged vs idle time.

## Acceptance Criteria
- Detect idle after 30s of no mouse/keyboard activity.
- On unload/navigation, emit `page_engagement` with engaged_time_ms, idle_time_ms, total_time_ms, page_path.
- Honor `respect_dnt`; gated under `frontend-event-tracking` flag.

## Notes
- Keep overhead low; use listeners efficiently.
