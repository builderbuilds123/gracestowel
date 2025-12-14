# Story 5.2.1: Monitored Fetch & API Request Events

Status: Done

## Story
As a Developer,
I want a monitored fetch wrapper that records api_request events with sanitized URL and route context,
So that API calls are consistently tracked across the storefront.

## Acceptance Criteria
- All storefront fetch calls use the monitored wrapper.
- `api_request` fires on success and failure with sanitized URLs (no tokens) and route.
- Duration measured client-side; errors include message only, never body/payload.
- Rollout gated under `frontend-event-tracking` flag; DNT/opt-out not offered.

## Notes
- Target handler overhead <5ms median; avoid blocking UI thread.
- Minimal payload; no request/response bodies.

## File List
- apps/storefront/app/utils/monitored-fetch.ts
- apps/storefront/app/utils/monitored-fetch.test.ts
- apps/storefront/app/context/CustomerContext.tsx
- apps/storefront/app/hooks/useMedusaProducts.ts
- apps/storefront/app/components/AddItemsDialog.tsx
- apps/storefront/app/routes/account.tsx
- apps/storefront/app/routes/api.checkout-session.ts
- apps/storefront/app/routes/api.payment-intent.ts
- apps/storefront/app/routes/api.shipping-rates.ts
- apps/storefront/app/routes/api/$.tsx
- apps/storefront/app/routes/checkout.success.tsx
- apps/storefront/app/routes/order_.status.$id.tsx
- apps/storefront/app/routes/products.$handle.tsx
- docs/epics.md
- docs/sprint/sprint-artifacts/sprint-status.yaml

## Dev Agent Record
- Implemented `monitoredFetch` SSR-safe PostHog initialization (dynamic import on client).
- Hardened URL sanitization to prevent query-string PII leakage by defaulting to an allowlist.
- Ensured analytics tracking is non-blocking and does not surface unhandled rejections.
- Added server-side `api_request` capture support when `POSTHOG_API_KEY` is configured.
- Updated tests to reflect async tracking and sanitization behavior.
- **Code Review Fixes (2025-12-14):**
  - Fixed critical `process.env` crash in `api.shipping-rates.ts` (Cloudflare Worker).
  - Standardized env var access (`window.ENV`) in client-side hooks and components.
  - Updated File List to include all modified files.
