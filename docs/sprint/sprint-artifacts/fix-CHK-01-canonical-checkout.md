# IMPL-CHK-01: Checkout bypasses Medusa cart completion

**Epic**: Checkout Audit Fixes
**Priority**: High
**Status**: Done
## Story

**As a** System Administrator,
**I want** the checkout flow to utilize the canonical Medusa cart completion process,
**So that** all standard validations, inventory checks, and payment session logic are consistently applied to every order.

**Acceptance Criteria:**

**Given** a customer has a cart with items and a valid payment method
**When** they complete the checkout process on the storefront
**Then** the Storefront should call the Medusa `complete` cart API
**And** the Medusa backend should validate the cart status and inventory
**And** the order should be created synchronously via the completion response
**And** the `cart.completed_at` timestamp should be set

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
