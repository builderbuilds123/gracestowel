# Story 6.2: Redis Connection Failure Handling

Status: Ready for Review

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

- [x] Task 1: Safe Redis Wrapper (AC: 1, 3, 4, 5, 6, 7)
  - [x] **Location**: `apps/backend/src/subscribers/order-placed.ts`.
  - [x] Wrap `schedulePaymentCapture` calls in try-catch.
  - [x] **Error Catch**: Catch specific codes: `ECONNREFUSED`, `ETIMEDOUT`, `ENOTFOUND`.
  - [x] **Metadata**: Update Order metadata with `{ needs_recovery: true, recovery_reason: 'redis_failure' }`.
  - [x] **Logging**: Use `[CRITICAL][DLQ]` pattern.

- [x] Task 2: Recovery Logic (AC: 8, 9, 10, 11, 12, 13)
  - [x] **Reuse**: Modified `apps/backend/src/jobs/fallback-capture.ts`.
  - [x] **Query**: DB-side fetch for `needs_recovery: true` via custom repository helper (avoids full-table scans).
  - [x] **Cleanup**: Added `clearRecoveryFlag()` helper to remove metadata after success.
  - [x] **Test**: Added test for recovery order processing and flag clearing.
  - [x] Idempotency handled by existing job deduplication.

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
- **Recovery Cadence**: The `Fallback Cron` runs every **hour** (schedule: `0 * * * *` in `apps/backend/src/jobs/fallback-capture.ts`). Redis failures will be resolved within this window.
- **Error Handling**: Use `logger.error` for initial connection failures, but `logger.warn` for subsequent retry attempts to reduce noise.
- **Metadata Cleanup**: The `clearRecoveryFlag()` helper function removes `needs_recovery` and `recovery_reason` from order metadata after successful capture scheduling.
- **Monitoring**: 
  - Track `redis_failure_impact` metric (count of orders tagged `needs_recovery`).
  - Alert if `needs_recovery` count > 10 orders in queue.

## Dev Agent Record

### Context Reference

- `docs/product/epics/payment-integration.md` - Epic 6 Source.
- `apps/backend/src/lib/payment-capture-queue.ts` - Existing queue logic.
- `apps/backend/src/jobs/fallback-capture.ts` - Existing fallback job.
- `docs/project_context.md` - Error handling patterns.

### Agent Model Used

Antigravity (Google Deepmind)

### Completion Notes List

- Implemented Redis error handling in `order-placed.ts` with `[CRITICAL][DLQ]` logging.
- Orders flagged with `needs_recovery: true, recovery_reason: redis_failure` in metadata when Redis fails.
- `fallback-capture.ts` modified to explicitly query for `needs_recovery: true` orders via DB helper (no full-table scan).
- Added `clearRecoveryFlag()` helper to remove metadata after successful capture scheduling.
- Added unit tests: 10 tests in `order-placed.unit.spec.ts`, 11 tests in `fallback-capture.unit.spec.ts`.
- All 222 unit tests pass.

### File List

- `apps/backend/src/subscribers/order-placed.ts` (MODIFIED)
- `apps/backend/src/jobs/fallback-capture.ts` (MODIFIED)
- `apps/backend/src/lib/payment-capture-queue.ts` (MODIFIED)
- `apps/backend/integration-tests/subscribers/order-placed.unit.spec.ts` (MODIFIED)
- `apps/backend/integration-tests/unit/fallback-capture.unit.spec.ts` (MODIFIED)
- `apps/backend/jest.config.js` (MODIFIED)
- `docs/sprint/sprint-artifacts/sprint-status.yaml` (MODIFIED)
- `docs/sprint/sprint-artifacts/6-2-redis-connection-failure-handling.md` (MODIFIED)

### Change Log

- 2025-12-11: Implemented Story 6.2 - Redis connection failure handling with graceful degradation.
