# Story 1.1: Initialize PostHog SDK for Client-Side Tracking

Status: Ready for Review

## Story

As a developer,
I want to initialize the PostHog SDK in the storefront application,
so that we can start capturing client-side events.

## Acceptance Criteria

1. **Given** the PostHog project API key and host are configured as environment variables.
2. **When** the storefront application loads.
3. **Then** the PostHog SDK is initialized and ready to capture events.
4. **And** the SDK is configured to only be active in production environments (or explicitly enabled).

## Tasks / Subtasks

- [x] Verify/Implement PostHog SDK initialization in `apps/storefront`
  - [x] Check `apps/storefront/app/utils/posthog.ts` implementation
  - [x] Ensure `VITE_POSTHOG_API_KEY` and `VITE_POSTHOG_HOST` are used
  - [x] Verify `posthog.init` options (autocapture, etc.)
- [x] Implement Environment Guard
  - [x] Ensure SDK does not initialize if API Key is missing
  - [x] Verify logical restriction for production-only or opt-in usage
- [x] Integrate in Root
  - [x] Verify `apps/storefront/app/root.tsx` calls initialization
  - [x] Ensure client-side only check (`typeof window !== 'undefined'`)

## Dev Notes

- **Existing Code detected**: `apps/storefront/app/utils/posthog.ts` and `apps/storefront/app/root.tsx` already contain PostHog initialization code. **ACTION**: Audit this code against the AC. Do not rewrite if it works, but fix the "production only" logic if it depends solely on API key presence (unless that is the intended "configuration" mechanic).
- **Environment Variables**:
  - `VITE_POSTHOG_API_KEY`
  - `VITE_POSTHOG_HOST` (default: `https://app.posthog.com`)
- **Architecture**:
  - Storefront only (React Router v7).
  - Use `posthog-js`.
  - Information-only cookie policy means **NO gating** required for initialization (Architecture Decision 2.2). Init immediately.

### Project Structure Notes

- Keep utilities in `apps/storefront/app/utils/posthog.ts`.
- Initialize in specific `useEffect` or root script logic in `apps/storefront/app/root.tsx`.

### References

- [Epics: Story 1.1](file:///Users/leonliang/Github%20Repo/gracestowel/docs/epics.md#story-11-initialize-posthog-sdk-for-client-side-tracking)
- [Architecture: PostHog Integration](file:///Users/leonliang/Github%20Repo/gracestowel/docs/architecture.md#posthog-analytics-integration)
- [Project Context](file:///Users/leonliang/Github%20Repo/gracestowel/docs/project_context.md)

## Dev Agent Record

### Context Reference

- **Architecture Decision 2.2**: PostHog initializes immediately. Cookie popup is info-only.
- **Tech Stack**: `posthog-js` (already installed in `apps/storefront/package.json`).

### Agent Model Used

Antigravity (bmad-bmm-create-story)

### Debug Log References

- Existing implementation found in `posthog.ts`.

### Completion Notes List

- Story is ready for verification/implementation. Code exists but validation of "production only" AC is needed.
- Added comprehensive unit tests in `apps/storefront/app/utils/posthog.test.ts`.
- Verified implementation against ACs.

### File List

- apps/storefront/app/utils/posthog.ts
- apps/storefront/app/root.tsx
- apps/storefront/app/utils/posthog.test.ts
