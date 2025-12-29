# IMPL-CHK-01: Checkout bypasses Medusa cart completion

**Epic**: Checkout Audit Fixes
**Priority**: High
**Status**: Drafted

## Problem
The checkout flow uses a Stripe-first approach and never calls `cart.complete()` in Medusa. Order creation is done via webhook only. This bypasses standard validations and payment session logic.

## Solution Overview
Adopt canonical Medusa checkout flow.

## Implementation Steps

### 1. Storefront (`apps/storefront/app/routes/checkout.tsx`)
- [ ] **Initialize Payment Session**: Use `cart.createPaymentSessions()` (Medusa) instead of direct `api.payment-intent` calls, OR ensure `api.payment-intent` wraps Medusa logic.
- [ ] **Complete Cart**: After `stripe.confirmCardPayment` success, call `medusa.carts.complete(cartId)`.
- [ ] **Handle Completion**: Use the order object returned by `complete()` to redirect to success, rather than polling.

### 2. Backend
- [ ] Ensure `cart.complete` workflow handles the Stripe PI status (using the PI ID from the session).

## Verification
- **Automated**:
  - Integration Test: Perform full checkout. Verify `cart.completed_at` is set. Verify order is created synchronously via the completion response.

## Dependencies
- SEC-01 (Client trust) - Fixing checkout flow helps enforce server-side pricing.
