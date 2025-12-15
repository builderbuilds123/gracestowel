# Story 5.2.2: Navigation Tracking

Status: Done

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

## Dev Agent Record
- Implemented `useNavigationTracking` hook in `apps/storefront/app/hooks/useNavigationTracking.ts`.
- Hook tracks route changes, navigation type, and time spent on previous page.
- Utilized `posthog-js` for event capture.
- Added comprehensive unit tests in `apps/storefront/app/hooks/useNavigationTracking.test.ts`.
- Validated types and linting.
- Modified `apps/storefront/wrangler.jsonc` to fix type generation issues with environment variables.
