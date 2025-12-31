# IMPL-SEC-04: PI Client Secret Leak via Referrer

## User Story

**As a** Customer,
**I want** my payment session secrets to remain private on the success page,
**So that** third-party services cannot hijack my session or infer my order details.

## Acceptance Criteria

### Scenario 1: URL Cleanup

**Given** I have just landed on the checkout success page
**When** the page finishes loading
**Then** the `payment_intent_client_secret` query parameter is removed from the browser address bar

### Scenario 2: Referrer Policy

**Given** the checkout success page
**When** the page makes requests to third parties (e.g., maps, analytics)
**Then** the `Referer` header DOES NOT contain the `payment_intent_client_secret`

## Technical Implementation Plan

### Problem

The `payment_intent_client_secret` is present in the URL query parameters on the checkout success page. Third-party requests (e.g., Nominatim geocoding) initiated from this page can leak the secret via the `Referer` header.

### Solution Overview

1. Clean the URL immediately upon loading the success page using `window.history.replaceState`
2. Add a Remix `meta` export with `referrer` meta tag set to `strict-origin-when-cross-origin`

### Implementation Steps

#### 1. Storefront Page (`apps/storefront/app/routes/checkout.success.tsx`)

- [x] **Task 1: URL Cleanup** - In the `useEffect` hook, after extracting the `payment_intent_client_secret`, immediately call `window.history.replaceState()` to strip ALL query parameters from the address bar
  - Added at lines 97-102: `window.history.replaceState({}, '', window.location.pathname);`
  - This happens BEFORE any third-party requests (Nominatim geocoding)

- [x] **Task 2: Referrer Policy Meta Tag** - Add a Remix `meta` export to set the referrer policy
  - Added `export const meta: MetaFunction = () => [{ name: "referrer", content: "strict-origin-when-cross-origin" }];`
  - Imported `MetaFunction` from `react-router`
  - Export placed at lines 45-53

- [x] **Task 3: Verify External Fetches** - Reviewed the `monitoredFetch` call to Nominatim
  - Confirmed `monitoredFetch` does not explicitly pass referer/origin headers
  - The meta tag handles browser-level referrer policy

### Verification

- **Manual/E2E Test**:
  - Navigate to success page with `?payment_intent=...&payment_intent_client_secret=...&redirect_status=succeeded`
  - Verify `window.location.search` is empty after React hydration
  - Open Network tab, verify Nominatim request has no `payment_intent_client_secret` in Referer header

### Dependencies

- None. This is a standalone security fix.

---

## Dev Notes

### Architecture Requirements

- **Framework**: Remix/React Router 7 on Cloudflare Workers
- **Meta Tags**: Use Remix `MetaFunction` export pattern, not direct DOM manipulation
- **History API**: Use `window.history.replaceState({}, '', pathname)` to preserve state object

### Key Code Locations

- **Target file**: `apps/storefront/app/routes/checkout.success.tsx`
- **Lines 93-95**: Where `payment_intent_client_secret` is extracted from URL
- **Lines 97-102**: URL cleanup with history.replaceState
- **Lines 45-53**: Meta export with referrer policy

### Anti-Patterns Avoided

- Used Remix `meta` export instead of JSX `<meta>` tag
- URL cleanup happens AFTER extracting payment_intent_client_secret but BEFORE third-party requests
- Used `strict-origin-when-cross-origin` to preserve analytics cross-origin functionality

---

## Dev Agent Record

### Implementation Plan

1. Add `MetaFunction` import from `react-router`
2. Add meta export with referrer policy `strict-origin-when-cross-origin`
3. Add `window.history.replaceState` call after extracting client secret

### Debug Log

No issues encountered during implementation.

### Completion Notes

- ✅ Added `MetaFunction` type import at line 3
- ✅ Added meta export at lines 45-53 with `strict-origin-when-cross-origin` referrer policy
- ✅ Added URL cleanup at lines 97-102 using `window.history.replaceState`
- ✅ Verified monitoredFetch doesn't pass custom referrer headers

---

## File List

| Action | File |
|--------|------|
| Modified | `apps/storefront/app/routes/checkout.success.tsx` |
| Added | `apps/storefront/app/routes/checkout.success.test.ts` |

---

## Change Log

| Date | Change |
|------|--------|
| 2025-12-30 | Story created with validation context |
| 2025-12-30 | Implementation complete - URL cleanup + referrer policy |
| 2025-12-30 | Security hardening: server-side param stripping + regression tests added |

---

## Status

**Status:** review
