# IMPL-MNY-01: Money unit mismatch

**Epic**: Checkout Audit Fixes
**Priority**: High
**Status**: Drafted

## Problem
Mixing major units (Medusa v2 internal) with minor units (Stripe cents) leads to calculation errors (off by 100x).

## Solution Overview
Audit and standardize all currency conversions.

## Implementation Steps

### 1. Audit & Fix
- [ ] **Payment Capture**: Fix `payment-capture-worker.ts` to ensure `order.total` (major) is multiplied by 100 *exactly once* before Stripe call.
- [ ] **Storefront Display**: Ensure `order_.status.$id.tsx` divides by 100 *only if* the API returns cents (Medusa v2 usually returns major units, so verify specific endpoint behavior).
- [ ] **Modifications**: Fix `add-item-to-order.ts` to ensure consistency.

## Verification
- **Automated**:
  - Unit Test: Specific functions for currency conversion.
  - Integration: End-to-end price check.

## Dependencies
- None.
