# Story 6.2: Redis Connection Failure Handling

Status: ready-for-dev

## Story

As a DevOps Engineer,
I want the application to degrade gracefully if Redis is temporarily unreachable,
So that checkout doesn't 500 hard and orders are still accepted.

## Acceptance Criteria

1.  **Given** Redis is down or unreachable.
2.  **When** an order is placed.
3.  **Then** the "Capture Intent" token creation (which depends on Redis) logic should catch the connection error.
4.  **And** REUSE: `apps/backend/src/subscribers/order-placed.ts` calls `schedulePaymentCapture`. This is where the try-catch belongs.
5.  **And** it should LOG the error as CRITICAL.
6.  **And** it should NOT block the checkout completion (return success to storefront).
7.  **And** the system should flag this order in the DB (metadata: `needs_recovery: true`, `recovery_reason: redis_failure`).
8.  **Given** Redis comes back online.
9.  **When** the "Recovery Mode" script or Fallback Cron runs.
10. **And** REUSE: Update existing `apps/backend/src/jobs/fallback-capture.ts`.
11. **Then** it should scan for orders with `needs_recovery: true`.
12. **And** generate necessary tokens or schedule capture immediately.
13. **And** remove the recovery flag upon success.

## Tasks / Subtasks

- [ ] Task 1: Safe Redis Wrapper (AC: 1, 3, 4, 5, 6, 7)
  - [ ] **Location**: `apps/backend/src/subscribers/order-placed.ts`.
  - [ ] Wrap `paymentCaptureQueue.add` calls in try-catch.
  - [ ] **Error Catch**: Catch specific codes: `ECONNREFUSED`, `ETIMEDOUT`, `ENOTFOUND`.
  - [ ] **Metadata**: Update Order metadata with `{ needs_recovery: true, recovery_reason: 'redis_outage' }`.
  - [ ] **Logging**: Use established `[CRITICAL][DLQ]` pattern (Reference: `apps/backend/src/lib/payment-capture-queue.ts`).

- [ ] Task 2: Recovery Logic (AC: 8, 9, 10, 11, 12, 13)
  - [ ] **Reuse**: Update existing `apps/backend/src/jobs/fallback-capture.ts`.
  - [ ] **Query**: Expand job to select orders with `needs_recovery: true`.
  - [ ] **Tracking**: Add PostHog event `redis_recovery_triggered` on successful recovery.
  - [ ] Ensure idempotency: if token already exists (intermittent failure), just update TTL.

## Dev Notes

- **Existing Logic**: `CaptureIntentService` pattern is actually implemented in `payment-capture-queue.ts`.
- **Reuse**: STRICTLY modify `fallback-capture.ts`, do NOT create new cron job.
- **Pattern**: Simple error suppression for the *specific* Redis call.

## Testing Strategy

- **Simulate Outage**: Temporarily block Redis port or use a mock that throws connection error.
- **Verify Checkout**: Ensure `cart.complete()` returns 200 OK.
- **Verify DB**: Check order metadata has `needs_recovery: true`.
- **Verify Recovery**: Restore Redis, run Fallback Cron manually, verify token created and flag cleared.

### Project Structure Notes

- **Subscriber**: `apps/backend/src/subscribers/order-placed.ts`
- **Job**: `apps/backend/src/jobs/fallback-capture.ts`
- **Queue**: `apps/backend/src/lib/payment-capture-queue.ts`

### References

- [Redis Error Handling](https://github.com/redis/node-redis#error-handling)

## Previous Story Intelligence

- **Epic 6 Context**: This story handles the specific failure case of the capture token infrastructure.
- **Related Stories**:
  - Story 6.1 (Webhooks): Reusing the retry patterns established there.
  - Story 6.3 (Race Conditions): Redis used here is also critical for the locking mechanism in 6.3.
- **Learnings**: We must assume Redis is ephemeral and can fail; the Postgres `needs_recovery` flag is our source of truth.

### Refined Anti-Patterns & Implementation Details

- **Metadata Updates**: Do NOT use raw SQL for metadata updates. Use the service layer:
  ```typescript
  // E2: Metadata Update Pattern
  await orderService.updateOrders([{
      id: order.id,
      metadata: { ...order.metadata, needs_recovery: true, recovery_reason: 'redis_failure' }
  }]);
  ```
- **Recovery Cadence**: The `Fallback Cron` runs every **5 minutes** (as defined in `apps/backend/src/jobs/fallback-capture.ts`). Redis failures will be resolved within this window.
- **Error Handling**: Use `logger.error` for initial connection failures, but `logger.warn` for subsequent retry attempts to reduce noise.
- **Monitoring**: 
  - Track `redis_outage_impact` metric (count of orders tagged `needs_recovery`).
  - Alert if `needs_recovery` count > 10 in 5 minutes.

## Dev Agent Record

### Context Reference

- `docs/product/epics/payment-integration.md` - Epic 6 Source.
- `apps/backend/src/lib/payment-capture-queue.ts` - Existing queue logic.
- `apps/backend/src/jobs/fallback-capture.ts` - Existing fallback job.
- `docs/project_context.md` - Error handling patterns.

### Agent Model Used

Antigravity (Google Deepmind)

### Completion Notes List

- Corrected implementation location to `order-placed.ts`.
- Referenced `payment-capture-queue.ts` logic.
- Explicitly reused `fallback-capture.ts`.
- Added specific error codes to catch.
- Added PostHog tracking requirement.
- Added "Previous Story Intelligence" and monitoring metrics.

### File List

- `apps/backend/src/subscribers/order-placed.ts`
- `apps/backend/src/jobs/fallback-capture.ts`
- `apps/backend/src/lib/payment-capture-queue.ts` (reference only)
