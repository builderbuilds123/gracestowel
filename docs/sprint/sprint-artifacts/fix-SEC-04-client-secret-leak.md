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

1. **Primary Fix (Server-Side)**: Strip sensitive params from URL via server-side redirect in loader, storing them in a short-lived secure cookie
2. **Secondary Fix (Client-Side)**: Clean URL using `window.history.replaceState` in `useLayoutEffect` as defense-in-depth
3. **Referrer Protection**: Add a Remix `meta` export with `referrer` meta tag set to `strict-origin-when-cross-origin`

### Implementation Steps

#### 1. Storefront Page (`apps/storefront/app/routes/checkout.success.tsx`)

- [x] **Task 1: Server-Side URL Stripping (Primary Fix)** - In the `loader` function, detect `payment_intent_client_secret` in URL params and redirect to clean URL while storing params in secure cookie
  - Implemented at lines 76-80: Server-side redirect with cookie storage
  - Cookie has 600s TTL, `SameSite=Strict`, `Secure`, `HttpOnly` flags (line 42)
  - `HttpOnly` prevents JavaScript access (XSS protection) - cookie is only read server-side
  - This prevents the secret from ever appearing in the browser URL bar
  - Cookie is consumed and cleared on subsequent request (lines 83-89)

- [x] **Task 2: Client-Side URL Cleanup (Defense-in-Depth)** - In `useLayoutEffect` hook, ensure URL is clean before page renders
  - Added at lines 137-144: `window.history.replaceState({}, "", window.location.pathname);`
  - Executes synchronously before paint, ensuring URL is clean before any third-party requests
  - Only runs if `initialParams` are provided (from cookie)

- [x] **Task 3: Referrer Policy Meta Tag** - Add a Remix `meta` export to set the referrer policy
  - Added `export const meta: MetaFunction = () => [{ name: "referrer", content: "strict-origin-when-cross-origin" }];`
  - Imported `MetaFunction` from `react-router` at line 3
  - Export placed at lines 108-110

- [x] **Task 4: Verify External Fetches** - Reviewed the `monitoredFetch` call to Nominatim
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
- **Lines 62-100**: Loader function with server-side redirect and cookie handling
  - Lines 69-74: Extract params from URL
  - Lines 76-80: Server-side redirect with cookie storage (PRIMARY FIX)
  - Lines 83-89: Cookie consumption and clearing
- **Lines 137-144**: Client-side URL cleanup via `useLayoutEffect` (defense-in-depth)
- **Lines 108-110**: Meta export with referrer policy

### Anti-Patterns Avoided

- Used Remix `meta` export instead of JSX `<meta>` tag
- Server-side redirect prevents secret from appearing in URL at all (better than client-side only)
- Client-side cleanup in `useLayoutEffect` (not `useEffect`) ensures URL is clean before paint
- Cookie-based param passing avoids URL exposure entirely
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

- ✅ Implemented server-side redirect in loader (lines 76-80) - PRIMARY FIX
  - Strips sensitive params from URL before page load
  - Stores params in secure cookie with 600s TTL
  - Cookie consumed and cleared on subsequent request
- ✅ Added `MetaFunction` type import at line 3
- ✅ Added meta export at lines 108-110 with `strict-origin-when-cross-origin` referrer policy
- ✅ Added client-side URL cleanup at lines 137-144 using `window.history.replaceState` in `useLayoutEffect` (defense-in-depth)
- ✅ Added `HttpOnly` flag to cookie (line 42) for XSS protection - cookie only accessible server-side
- ✅ Verified monitoredFetch doesn't pass custom referrer headers
- ✅ Added comprehensive test coverage:
  - Server-side redirect and cookie handling (4 tests, including HttpOnly verification)
  - Referrer policy meta tag export (1 test)
  - Client-side URL cleanup logic (2 tests)

---

## File List

| Action | File |
|--------|------|
| Modified | `apps/storefront/app/routes/checkout.success.tsx` |
| Modified | `apps/storefront/app/routes/checkout.success.test.ts` (added 4 new tests) |

---

## Change Log

| Date | Change |
|------|--------|
| 2025-12-30 | Story created with validation context |
| 2025-12-30 | Implementation complete - Server-side redirect (primary) + client-side cleanup + referrer policy |
| 2025-12-30 | Security hardening: server-side param stripping + regression tests added |
| 2025-12-30 | Code review fixes: Updated story documentation with correct line numbers, documented server-side redirect as primary fix, added test coverage for client-side cleanup and meta tag |

---

## Status

**Status:** done
