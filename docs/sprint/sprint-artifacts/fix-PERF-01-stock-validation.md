# IMPL-PERF-01: Stock validation is slow

**Epic**: Checkout Audit Fixes
**Priority**: Medium
**Status**: Ready for Dev
## Story

**As a** Customer,
**I want** the checkout process to be fast and responsive,
**So that** I can complete my purchase quickly without waiting for slow stock validations.

**Acceptance Criteria:**

**Given** a customer is proceeding to checkout with multiple items
**When** stock availability is validated
**Then** the system should batch the stock checks into a single request or parallelize them
**And** the validation time should not scale linearly with the number of items (N+1)
**And** the system should handle partial availability correctly

## Problem

Stock validation iterates items with sequential fetches, causing N+1 latency.

## Solution Overview

Batch the stock check.

## Implementation Steps

### 1. Storefront (`apps/storefront/app/routes/api.payment-intent.ts`)


- [ ] **Batch API**: Create or use a backend endpoint that accepts an array of variant IDs (e.g. `POST /store/variants/check-availability`).

- [ ] **Parallel Fetch**: If batch API unavailable, use `Promise.all` for current fetches.

## Verification


- **Automated**:

  - Test: 10 items in cart. Measure validation time. Should be ~1x fetch duration, not 10x.

## Dependencies


- None.
