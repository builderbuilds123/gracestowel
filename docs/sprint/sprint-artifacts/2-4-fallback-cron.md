# Story 2.4: Fallback Cron

## Goal
Implement a **Safety Net Cron Job** that runs periodically to catch any orders that "slipped through the cracks" (e.g., Redis event was missed during a server restart). This ensures 100% revenue assurance.

## Context
- **Epic**: [Epic 2: Grace Period & Delayed Capture Engine](../product/epics/payment-integration.md)
- **PRD**: [FR-4.2 Fallback Cron](../prd/payment-integration.md)
- **Risk Mitigation**: Handles the "fire-and-forget" nature of Redis Pub/Sub.

## Implementation Steps

### 1. Cron Definition
- [ ] Create a scheduled job (e.g., `src/jobs/fallback-capture.ts`).
- [ ] Schedule: Every 1 hour (e.g., `0 * * * *`).

### 2. Query Logic
- [ ] Find orders where:
    - `payment_status` = `awaiting` (or `not_paid` depending on exact lifecycle).
    - `created_at` < `NOW() - 65 minutes` (Giving 5 mins buffer over the 60 min grace period).
    - `status` != `archived/canceled`.

### 3. Execution Integration
- [ ] Iterate through found orders.
- [ ] For each "stuck" order:
    - Check if a valid Redis Token exists (validation check).
    - If NO token -> Trigger the **Capture Workflow** (Story 2.3) directly.
    - Log: "Fallback Capture Triggered for Order X".

## Acceptance Criteria
- [ ] **Missed Order Catch**: Manually create an order, verify Redis key, DELETE the key (simulating outage), wait 65 mins (mock time). Cron MUST find and capture it.
- [ ] **No False Positives**: Does not capture orders that are < 60 mins old.
- [ ] **No Double Capture**: Does not capture already captured orders.

## Technical Notes
- This is critical for reliability.
- Performance: Ensure the query is indexed properly on `created_at` and `payment_status`.
