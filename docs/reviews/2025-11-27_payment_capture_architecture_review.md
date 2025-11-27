# Code Architecture Review: Payment Capture Strategy

**Date**: 2025-11-27
**Reviewer**: Code Architecture Reviewer Agent
**Context**: Reviewing the "Capture Job" proposal in the Implementation Plan.

## Executive Summary

The initial proposal to use a **15-minute Cron Job** to poll for uncaptured payments is **rejected** in favor of an **Event-Driven Delayed Job** architecture.

**Why?**
1.  **Precision**: A cron job running every 15 minutes introduces a variability of 0-15 minutes *after* the 1-hour window. A delayed job executes exactly when needed.
2.  **Efficiency**: Polling the database ("Find orders > 60 mins ago") is inefficient, especially as the order table grows.
3.  **Scalability**: A message queue (BullMQ) handles high throughput better than a single cron process.

## Critical Issues (Must Fix)

### 1. Replace Polling with Delayed Events
*   **Current Plan**: `Cron(*/15) -> DB Query -> Loop -> Capture`
*   **Recommended Plan**: `Order Placed -> Schedule Job (Delay 1h) -> Queue -> Worker -> Capture`

## Architecture Considerations

### Recommended Stack: BullMQ + Redis
Medusa already uses Redis. We should leverage **BullMQ** (standard in Node.js/Medusa ecosystem) to handle the delay.

**Workflow:**
1.  **Subscriber**: Listen to `order.placed`.
2.  **Producer**: Add a job to `payment-capture-queue` with `{ delay: 3600000 }` (1 hour).
3.  **Consumer**: A dedicated worker processes this job.
    *   **Idempotency**: The worker must check if the order is already canceled or captured before proceeding.
    *   **Retries**: Configure exponential backoff for failed capture attempts (e.g., Stripe API errors).

## Next Steps
Update `implementation_plan.md` to specify the **Queue-based** architecture instead of the Cron job.
