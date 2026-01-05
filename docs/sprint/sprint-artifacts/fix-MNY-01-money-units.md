# IMPL-MNY-01: Money unit mismatch

**Epic**: Checkout Audit Fixes
**Priority**: High
**Status**: Done
## Story

**As a** System Architect,
**I want** all monetary values to be handled consistently across the system (Medusa major units vs. Stripe minor units),
**So that** payment captures, refunds, and displays are accurate and free from 100x scaling errors.

**Acceptance Criteria:**

**Given** a monetary value is being passed between Medusa and Stripe
**When** the conversion occurs
**Then** the system should strictly convert Medusa major units (dollars) to Stripe minor units (cents) at the boundary
**And** the UI should display prices correctly without assuming they are in cents
**And** shipping amounts in metadata should have explicit unit suffixes if possible
**And** no double-conversion or missing conversion should occur

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
