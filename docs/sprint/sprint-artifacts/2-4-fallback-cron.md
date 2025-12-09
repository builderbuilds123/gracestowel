# Story 2.4: Fallback Cron (Queue Health Check)

## Goal
Implement a **Safety Net Cron Job** that ensures no orders are left in a "Pending" state indefinitely due to missing or failed BullMQ jobs.

## Context
- **Epic**: [Epic 2: Grace Period & Delayed Capture Engine](../product/epics/payment-integration.md)
- **Gap**: While BullMQ is reliable, manual intervention (flushing Redis) or catastrophic logic bugs could drop jobs. This cron provides 100% catch-all assurance.

## Implementation Steps

### 1. Cron Definition
- [x] Create `src/jobs/fallback-capture.ts`.
- [x] Schedule: Every 1 hour (cron: `0 * * * *`).
- [x] *Ref*: Use Medusa v2 `scheduled-jobs` pattern.

### 2. Logic
- [x] Query Orders: `created_at` < `NOW - 65 mins`, `status = "pending"`.
- [x] For each order:
    - Check Stripe `PaymentIntent.status === "requires_capture"`.
    - Check `getJobState(orderId)` via new helper in `payment-capture-queue.ts`.
    - If job exists (waiting/active/delayed): **SKIP**.
    - If job is `failed`: **LOG & ALERT** with `[CRITICAL]` tag.
    - If job is **MISSING**: **TRIGGER CAPTURE** immediately.

### 3. Alerting & Metrics
- [x] Log: "Fallback Cron: Found X orders needing capture".
- [x] Log `[METRIC] fallback_capture_triggered` when capture is triggered.
- [x] Log `[METRIC] fallback_capture_alert` when failed job detected.

## Acceptance Criteria
- [x] **Safety Net**: Simulating a deleted Redis job results in the Cron picking up the order and capturing it.
- [x] **No Double Processing**: Respects existing queue jobs by checking Stripe status and job state first.

## Status
**Done** ✅

## Validation
- **Unit Tests**: 10 tests passing in `fallback-capture.unit.spec.ts`
  - Skips orders with already captured payments
  - Skips orders with active BullMQ jobs  
  - Logs critical alert for failed jobs
  - Triggers capture for missing jobs
  - Handles no orders gracefully
  - Skips when `REDIS_URL` is missing
  - Exits gracefully when Redis/BullMQ unavailable
  - Rejects non-pending orders defensively
  - Triggers capture for stale completed jobs
  - Verifies pending-only query filter

## Dev Agent Record

### Files Created/Modified
- **NEW**: `src/jobs/fallback-capture.ts` - Scheduled job (hourly)
- **NEW**: `integration-tests/unit/fallback-capture.unit.spec.ts` - Unit tests
- **MODIFIED**: `src/lib/payment-capture-queue.ts` - Added `getJobState()` helper
