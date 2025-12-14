# Story 5.2.1: Monitored Fetch & API Request Events

Status: Todo

## Story
As a Developer,
I want a monitored fetch wrapper that records api_request events with sanitized URL and route context,
So that API calls are consistently tracked across the storefront.

## Acceptance Criteria
- All storefront fetch calls use the monitored wrapper.
- `api_request` fires on success and failure with sanitized URLs (no tokens) and route.
- Duration measured client-side; errors include message only, never body/payload.
- Honor `respect_dnt`; rollout gated under `frontend-event-tracking` flag.

## Notes
- Target handler overhead <5ms median; avoid blocking UI thread.
- Minimal payload; no request/response bodies.
