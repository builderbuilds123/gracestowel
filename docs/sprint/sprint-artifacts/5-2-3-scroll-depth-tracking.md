# Story 5.2.3: Scroll Depth Tracking

Status: Todo

## Story
As a PM,
I want scroll depth milestones,
So that we understand content engagement.

## Acceptance Criteria
- Emit `scroll_depth` at 25/50/75/100 with depth_percentage, page_path, page_height, time_to_depth_ms.
- Debounced handling and requestAnimationFrame; no duplicate emissions per threshold per pageview.
- Honor `respect_dnt`; gated under `frontend-event-tracking` flag.

## Notes
- Keep handler overhead minimal; avoid jank.
