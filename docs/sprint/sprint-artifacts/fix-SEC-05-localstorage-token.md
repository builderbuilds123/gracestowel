# IMPL-SEC-05: Modification Token in localStorage

## User Story

**As a** Security-Conscious Customer,
**I want** my session tokens to be cleared when I am done or when I close my browser,
**So that** my order cannot be modified by subsequent users on a shared device.

## Acceptance Criteria

### Scenario 1: Ephemeral Storage

**Given** I have received a modification token
**When** I verify where it is stored
**Then** it should be in `sessionStorage` (which clears on tab close), NOT `localStorage` (which persists)

### Scenario 2: Explicit Cleanup

**Given** I have an active modification session
**When** the order is fully captured OR the modification window expires
**Then** the token should be explicitly removed from storage

## Technical Implementation Plan (Original)

### Problem

Modification tokens are stored in `localStorage`, making them vulnerable to XSS attacks and prone to persisting on shared devices.

### Solution Overview

Move token storage to `sessionStorage` (tab-limited) or just memory state if persistence isn't strictly required across reloads (though usually it is for good UX). `sessionStorage` is safer than `localStorage` for shared devices. For XSS protection, HttpOnly cookies are best, but that requires significant architecture change. Stick to `sessionStorage` + explicit clearing as a pragmatic fix.

### Implementation Steps

#### 1. Storefront (`apps/storefront/app/routes/checkout.success.tsx`)


- [ ] Change `localStorage.setItem('modificationToken', ...)` to `sessionStorage.setItem(...)`.

- [ ] Update any token retrieval logic (e.g., hooks) to check `sessionStorage` instead of `localStorage`.

- [ ] **Clear Token**: Implement logic to clear the token:

  - When the order is completely finalized (capture confirmed).

  - When the window expires.

  - On a generic logout/cleanup action.

### Verification


- **Manual**:

  - Complete checkout. Check Application -> Local Storage (should be empty of token). Check Session Storage (should have token).

  - Close tab/browser. Reopen. Token should be gone (Session Storage clears on session end).

### Dependencies


- None.
