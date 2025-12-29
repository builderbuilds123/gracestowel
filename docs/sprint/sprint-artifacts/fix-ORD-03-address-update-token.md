# IMPL-ORD-03: Address update token transport mismatch

**Epic**: Checkout Audit Fixes
**Priority**: High
**Status**: Drafted

## Problem
Storefront sends modification token in `x-modification-token` header, but backend expects it in the body. Address updates fail.

## Solution Overview
Update backend to accept header-based tokens.

## Implementation Steps

### 1. Backend Route (`apps/backend/src/api/store/orders/[id]/address/route.ts`)
- [ ] Read `req.headers['x-modification-token']`.
- [ ] Use header token if present; fall back to `req.body.token` for backward compatibility.

## Verification
- **Automated**:
  - Test: Call endpoint with token in header. Verify success.
  - Test: Call endpoint with token in body. Verify success.

## Dependencies
- None.
