# IMPL-SEC-04: PI Client Secret Leak via Referrer

**Epic**: Checkout Audit Fixes
**Priority**: High
**Status**: Drafted

## Problem
The `payment_intent_client_secret` is present in the URL query parameters on the checkout success page. Third-party requests (e.g., geocoding) initiated from this page can leak the secret via the `Referer` header.

## Solution Overview
Clean the URL immediately upon loading the success page and restrict Referrer Policy.

## Implementation Steps

### 1. Storefront Page (`apps/storefront/app/routes/checkout.success.tsx`)
- [ ] **URL Cleanup**: In `useEffect`, after extracting `payment_intent_client_secret` and other params, call `window.history.replaceState` to strip the query string from the address bar.
- [ ] **Referrer Policy**: Add `<meta name="referrer" content="no-referrer" />` or strict-origin to the page head (via Remix `MetaFunction`).
- [ ] **Review Fetches**: Ensure `monitoredFetch` calls to external services (Nominatim) do not explicitly include the current URL in any custom headers.

## Verification
- **Automated**:
  - E2E Test: Navigate to success page. Check `window.location.search` is empty after load.
  - Network Monitor: Verify calls to Nominatim do not have the full URL in `Referer` header.

## Dependencies
- None.
