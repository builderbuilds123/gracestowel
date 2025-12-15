# Story 6.1: Webhook Validation & Retry

Status: Done

## Story

As a Backend Developer,
I want to validate Stripe webhook signatures and implement exponential backoff for retries,
So that we don't process fake events or lose data if the server blips.

## Acceptance Criteria

1.  **Given** a webhook request hits the backend.
2.  **When** the request is received.
3.  **Then** the `stripe-signature` header must be verified against the raw body.
4.  **And** REUSE: Ensure existing logic in `apps/backend/src/api/webhooks/stripe/route.ts` is leveraged/enhanced, NOT duplicated.
5.  **Given** a webhook event processing fails.
6.  **Then** release the job back to queue with error.
7.  **And** REUSE: BullMQ retry configuration must match existing pattern in `apps/backend/src/lib/payment-capture-queue.ts` (attempts: 3-5, exponential backoff).
8.  **And** ensure Idempotency deduplication using `event.id`.

## Tasks / Subtasks

- [x] Task 1: Webhook Signature Verification (AC: 1, 2, 3, 4)
  - [x] **Middleware**: Verify `apps/backend/src/api/middlewares.ts` disables body parsing for webhook route.
  - [x] **Handler**: Update/Verify `apps/backend/src/api/webhooks/stripe/route.ts`.
  - [x] **NOTE**: `stripe.webhooks.constructEvent` is ALREADY implemented (lines 52-67). Do not duplicately implement. Raise error if missing.

- [x] Task 2: Robust & Idempotent Event Processing (AC: 5, 6, 7, 8)
  - [x] **Reuse**: Use Medusa subscribers or `payment-capture-queue` pattern.
  - [x] **Config**: Explicitly set Queue Options: `attempts: 5`, `backoff: { type: 'exponential', delay: 1000 }` (Reference: `src/lib/payment-capture-queue.ts`).
  - [x] **Idempotency**: Check `stripe_processed_events` or similar before processing.
  - [x] **Reference**: See `src/lib/payment-capture-queue.ts` for established queue patterns.

## Dev Notes

- **Existing Code**: `apps/backend/src/api/webhooks/stripe/route.ts` already exists. Review it first.
- **Antipattern**: DO NOT create validatoin middleware if the route handler already does it.
- **Library**: Use the `stripe` instance from `src/utils/stripe.ts` (if available) or existing container registration.

### Project Structure Notes

- **Location**: `apps/backend/src/api/webhooks/stripe/route.ts`
- **Modules**: `src/subscribers` for async processing.

### References

- [Stripe Webhook Signatures](https://stripe.com/docs/webhooks/signatures)
- [Medusa Event Bus](https://docs.medusajs.com/v2/advanced-development/events-and-subscribers)

### 3. Testing Strategy

- **Signature Verification Tests**:
  - `POST /webhooks/stripe` with *invalid* signature -> Expect 400.
  - `POST /webhooks/stripe` with *valid* signature + payload -> Expect 200.
  - **Replay Protection**: Verify verification fails if timestamp > 5 minutes old (handled by `constructEvent`).
- **Resilience Tests**:
  - **Idempotency**: Send same `event.id` twice. Second request should return 200 OK immediately *without* processing.
  - **Retry Exhaustion**: Mock worker failure 5 times. Verify message moves to DLQ (or logs `CRITICAL` error).
- **Poison Message**: Send malformed JSON body with valid signature headers. Expect 400, no retry.

## Previous Story Intelligence

- **Epic 6 Context**: This story provides the foundational reliability layer for the entire "Grace Period" feature (Epics 3-5). Reliable webhooks are required to confirm `payment_intent.succeeded` before order processing continues.
- **Related Stories**:
  - Story 6.2 (Redis Reliability): Complements this by handling infrastructure failures.
  - Story 2.3 (Capture Workflow): Consumes the events verified here.

## Integration Patterns

- **Observability**:
  - Metric: `webhook_processing_failure_rate` (Counter).
  - Alert: If retry attempts > 3 for a single event ID, log `WARN`.
- **Error Handling**: Follow strict `CRITICAL` / `WARN` / `INFO` logging levels as defined in `project_context.md`.
- **Security**: Strict signature verification is non-negotiable (see `STRIPE_WEBHOOK_SECRET`).

### Refined Anti-Patters & Snippets

- **Signature Verification**: `stripe.webhooks.constructEvent` is ALREADY called at **Line 61** of `apps/backend/src/api/webhooks/stripe/route.ts`.
- **Idempotency Pattern**:
  ```typescript
  // O1: Idempotency Check Snippet
  const existing = await idempotencyService.retrieve(event.id);
  if (existing) {
      logger.info(`Skipping duplicate event ${event.id}`);
      return;
  }
  await idempotencyService.create({ id: event.id, expiration: 24 * 60 * 60 });
  ```

## Dev Agent Record

### Context Reference

- `docs/product/epics/payment-integration.md` - Epic 6 Source.
- `docs/project_context.md` - Integration and Error Handling Patterns.
- `apps/backend/src/api/webhooks/stripe/route.ts` - Existing webhook handler (See Line 61).
- `apps/backend/src/lib/payment-capture-queue.ts` - Queue config pattern.

### Agent Model Used

Antigravity (Google Deepmind) → Kiro (Implementation)

### Completion Notes List

- Acknowledged existing `route.ts`.
- Referenced `payment-capture-queue.ts` for retry config.
- Added middleware check task.
- Explicitly warned against code duplication.
- Added "Previous Story Intelligence" and "Integration Patterns" sections.
- Added specific line number reference (Line 61) and idempotency snippet.
- **2025-12-11 Implementation (v4 - Code Review Round 2 Fixes):**
  - **AC 1-4 (Signature Verification):** Verified existing `constructEvent` implementation - no changes needed
  - **AC 5-7 (Queue & Retry):** 
    - Created `stripe-event-queue.ts` with BullMQ queue (attempts: 5, exponential backoff: 1s base)
    - Created `stripe-event-worker.ts` loader to start worker on backend startup
    - Registered worker in `loaders/index.ts`
    - Route now queues events via `queueStripeEvent()` for async processing
    - Worker processes events with automatic retry on failure
    - DLQ logging with `[CRITICAL][DLQ]` prefix for exhausted retries
    - **FIX:** Route returns 500 on queue failure to trigger Stripe retry (not 200)
    - **FIX:** Route handles "job already exists" error with multiple detection methods
  - **AC 8 (Idempotency):**
    - Implemented Redis-based idempotency using `ioredis` (not in-memory Map)
    - **FIX:** Two-tier TTL system:
      - Processing lock: 10 min TTL (allows retry if processing fails)
      - Processed marker: 24h TTL (prevents duplicate processing)
    - **FIX:** `releaseProcessingLock()` called on permanent failure to allow Stripe re-delivery
    - Fail-open on Redis errors (allows processing to continue)
  - **FIX:** Signal listener leak - shutdown handlers tracked and removed in `resetStripeEventQueue()`
  - **Performance Fix:** Order lookup now queries recent 1000 orders (not full table scan)
  - All 218 unit tests pass (26 tests for webhook/queue)

### File List

- `apps/backend/src/api/webhooks/stripe/route.ts` (MODIFIED - queues events instead of sync processing)
- `apps/backend/src/lib/stripe-event-queue.ts` (NEW - BullMQ queue with Redis idempotency)
- `apps/backend/src/loaders/stripe-event-worker.ts` (NEW - worker initialization on startup)
- `apps/backend/src/loaders/index.ts` (MODIFIED - added stripe-event-worker loader)
- `apps/backend/integration-tests/unit/stripe-event-queue.unit.spec.ts` (NEW - queue/idempotency tests)
- `apps/backend/integration-tests/unit/webhooks/stripe/route.unit.spec.ts` (MODIFIED - async queue tests)

- `apps/backend/src/lib/payment-capture-queue.ts` (MODIFIED - test-time signal handler leak fix)
- `apps/backend/package.json` (MODIFIED - add `ioredis`)
- `pnpm-lock.yaml` (MODIFIED - lockfile updates)
- `docs/sprint/sprint-artifacts/sprint-status.yaml` (MODIFIED - sprint tracking)

- `QUICK_START.md` (MODIFIED)
- `docs/guides/backend-reactivity.md` (MODIFIED)
- `docs/analysis/brainstorming-session-review-2025-12-10.md` (MODIFIED)
