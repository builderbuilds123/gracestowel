# Story 6.1: Webhook Validation & Retry

Status: ready-for-dev

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

- [ ] Task 1: Webhook Signature Verification (AC: 1, 2, 3, 4)
  - [ ] **Middleware**: Verify `apps/backend/src/api/middlewares.ts` disables body parsing for webhook route.
  - [ ] **Handler**: Update/Verify `apps/backend/src/api/webhooks/stripe/route.ts`.
  - [ ] **NOTE**: `stripe.webhooks.constructEvent` is ALREADY implemented (lines 52-67). Do not duplicately implement. Raise error if missing.

- [ ] Task 2: Robust & Idempotent Event Processing (AC: 5, 6, 7, 8)
  - [ ] **Reuse**: Use Medusa subscribers or `payment-capture-queue` pattern.
  - [ ] **Config**: Explicitly set Queue Options: `attempts: 5`, `backoff: { type: 'exponential', delay: 1000 }` (Reference: `src/lib/payment-capture-queue.ts`).
  - [ ] **Idempotency**: Check `stripe_processed_events` or similar before processing.
  - [ ] **Reference**: See `src/lib/payment-capture-queue.ts` for established queue patterns.

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

Antigravity (Google Deepmind)

### Completion Notes List

- Acknowledged existing `route.ts`.
- Referenced `payment-capture-queue.ts` for retry config.
- Added middleware check task.
- Explicitly warned against code duplication.
- Added "Previous Story Intelligence" and "Integration Patterns" sections.
- Added specific line number reference (Line 61) and idempotency snippet.

### File List

- `apps/backend/src/api/webhooks/stripe/route.ts`
- `apps/backend/src/subscribers/stripe-event.ts` (NEW)
