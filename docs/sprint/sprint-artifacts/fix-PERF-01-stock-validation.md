# IMPL-PERF-01: Stock validation is slow

**Epic**: Checkout Audit Fixes
**Priority**: Medium
**Status**: Drafted

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
