# Story 5.2.6: Integration & Tests

Status: Todo

## Story
As a Developer,
I want all tracking hooks wired in root.tsx with tests,
So that tracking is reliable and verifiable.

## Acceptance Criteria
- Hooks mounted globally (navigation, scroll, engagement, form, monitored fetch) and PostHog client respects `respect_dnt`.
- 17 tests cover hooks and event payloads; events verified in PostHog test workspace.
- Event handlers add <5ms median overhead; use rAF/debounce where needed; payloads minimal and sanitized.
- Gate rollout under `frontend-event-tracking` flag per environment.

## Notes
- Ensure monitored fetch used everywhere; add CI check if possible.
