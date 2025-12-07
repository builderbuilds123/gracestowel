# Story 2.4: Fallback Cron (Queue Health Check)

## Goal
Implement a **Safety Net Cron Job** that ensures no orders are left in a "Pending" state indefinitely due to missing or failed BullMQ jobs.

## Context
- **Epic**: [Epic 2: Grace Period & Delayed Capture Engine](../product/epics/payment-integration.md)
- **Gap**: While BullMQ is reliable, manual intervention (flushing Redis) or catastrophic logic bugs could drop jobs. This cron provides 100% catch-all assurance.

## Implementation Steps

### 1. Cron Definition
- [ ] Create `src/jobs/fallback-capture.ts`.
- [ ] Schedule: Every 1 hour.
- [ ] *Ref*: Use Medusa v2 `scheduled-jobs` loader or standard cron pattern used in project.

### 2. Logic
- [ ] Query Orders: `payment_status` = `awaiting`, `created_at` < `NOW - 65 mins`.
- [ ] For each order:
    - check `getPaymentCaptureQueue().getJob('capture-{orderId}')`.
    - If job exists (waiting/active/delayed): **SKIP**.
    - If job is matching `failed`: **LOG & ALERT**.
    - If job is **MISSING**: **TRIGGER CAPTURE** immediately.

### 3. Alerting & Metrics
- [ ] Log: "Fallback Cron: Found X orders needing capture".
- [ ] If capture is triggered, increment a metric (if simple metrics exist) or log `[METRIC] fallback_capture_triggered`.

## Acceptance Criteria
- [ ] **Safety Net**: Simulating a deleted Redis job results in the Cron picking up the order and capturing it.
- [ ] **No Double Processing**: Respects existing queue jobs.

## Technical Notes
- Use `queue.getJob(id)` to check status.
- Ensure the Cron job has access to the Medusa container.
