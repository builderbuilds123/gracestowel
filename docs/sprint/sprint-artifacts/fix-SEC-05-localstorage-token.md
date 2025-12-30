# IMPL-SEC-05: Modification Token in localStorage

**Epic**: Checkout Audit Fixes
**Priority**: High
**Status**: Drafted

## Problem
Modification tokens are stored in `localStorage`, making them vulnerable to XSS attacks and prone to persisting on shared devices.

## Solution Overview
Move token storage to `sessionStorage` (tab-limited) or just memory state if persistence isn't strictly required across reloads (though usually it is for good UX). `sessionStorage` is safer than `localStorage` for shared devices. For XSS protection, HttpOnly cookies are best, but that requires significant architecture change. Stick to `sessionStorage` + explicit clearing as a pragmatic fix.

## Implementation Steps

### 1. Storefront (`apps/storefront/app/routes/checkout.success.tsx`)
- [ ] Change `localStorage.setItem('modificationToken', ...)` to `sessionStorage.setItem(...)`.
- [ ] Update any token retrieval logic (e.g., hooks) to check `sessionStorage` instead of `localStorage`.
- [ ] **Clear Token**: Implement logic to clear the token:
  - When the order is completely finalized (capture confirmed).
  - When the window expires.
  - On a generic logout/cleanup action.

## Verification
- **Manual**:
  - Complete checkout. Check Application -> Local Storage (should be empty of token). Check Session Storage (should have token).
  - Close tab/browser. Reopen. Token should be gone (Session Storage clears on session end).

## Dependencies
- None.
