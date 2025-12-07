# Story 2.2: Validate Delayed Capture Infrastructure

## Goal
Validate and enable the existing **BullMQ-based Payment Capture Queue**. The codebase nominally implements delayed capture, but we must confirm it is correctly instantiated and resilient to server restarts.

## Context
- **Epic**: [Epic 2: Grace Period & Delayed Capture Engine](../product/epics/payment-integration.md)
- **Existing Code**:
    - `src/lib/payment-capture-queue.ts` (Defines Queue & Worker)
    - `src/loaders/payment-capture-worker.ts` (Starts Worker)
    - `src/subscribers/order-placed.ts` (Schedules Job)
    - `src/loaders/index.ts` (Verify loader is called here)

## Implementation Steps

### 1. Verify Configuration
- [ ] Ensure `paymentCaptureWorkerLoader` is actually imported and used in `medusa-config.ts` (or `src/loaders/index.ts`).
- [ ] Verify `REDIS_URL` is correctly set in the environment.

### 2. Integration Test
- [ ] Manually test the flow:
    - Place an Order.
    - Check Redis (via CLI or GUI) to see a job in the `payment-capture` queue with a `delay`.
    - **Verification Command**: `redis-cli KEYS "bull:payment-capture:*"` should show keys.
    - Verify `delay` is 3600000ms (1 hour).

### 3. Reliability Check
- [ ] **Restart Test**: Schedule a job -> Restart Backend -> Ensure job is still in queue and not lost.

## Acceptance Criteria
- [ ] **Job Scheduling**: Placing an order creates a delayed job.
- [ ] **Persistence**: Jobs survive server restarts.
- [ ] **Worker Active**: The worker logs "Payment capture worker started" on boot.

## Technical Notes
- This story is primarily *verification* and *configuration* of existing code.
