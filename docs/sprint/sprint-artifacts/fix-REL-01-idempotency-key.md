# IMPL-REL-01: Stripe idempotency key generation is not idempotent

**Epic**: Checkout Audit Fixes
**Priority**: Medium
**Status**: Drafted

## Problem
Idempotency key includes `Math.random()`, making retries ineffective.

## Solution Overview
Generate key deterministically from request content.

## Implementation Steps

### 1. Storefront (`apps/storefront/app/routes/api.payment-intent.ts`)
- [ ] **Hashing**: Create key using `hash(cartId + amount + currency)`.
- [ ] **Handling**: If params change, key changes (good). If params same, key same (good).

## Verification
- **Automated**:
  - Unit Test: Call generate twice with same input. Verify same key.

## Dependencies
- None.
