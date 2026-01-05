# IMPL-REL-01: Stripe idempotency key generation is not idempotent

**Epic**: Checkout Audit Fixes
**Priority**: Medium
**Status**: Done
## Story

**As a** Developer,
**I want** to ensure that API requests are idempotent based on their content,
**So that** retries due to network failures do not result in duplicate operations or double-charges.

**Acceptance Criteria:**

**Given** a request creates a transaction (e.g., PaymentIntent)
**When** the request is retried with the same parameters
**Then** the system should generate the same idempotency key
**And** the downstream provider (Stripe) should recognize it as a duplicate request
**And** a new transaction should not be created

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
