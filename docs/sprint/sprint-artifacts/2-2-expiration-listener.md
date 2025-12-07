# Story 2.2: Expiration Listener

## Goal
Implement a **Redis Keyspace Notification Listener** that detects when a "Capture Intent" token expires and triggers the asynchronous `capture_order` job. This is the primary trigger for the delayed capture mechanism.

## Context
- **Epic**: [Epic 2: Grace Period & Delayed Capture Engine](../product/epics/payment-integration.md)
- **PRD**: [FR-4.1 Event-Driven Capture](../prd/payment-integration.md)
- **Architecture**: [Redis Event Bus](../analysis/research/technical-stripe-integration-research-2025-12-06.md)

## Implementation Steps

### 1. Redis Configuration
- [ ] Ensure `notify-keyspace-events Ex` is enabled in Redis config (or via command on startup).
- [ ] Verify the backend Redis client is subscribed to `__keyevent@0__:expired`.

### 2. Event Subscriber
- [ ] Create `apps/backend/src/subscribers/redis-expiry.ts` (or similar).
- [ ] Implement listener for the expired channel.
- [ ] Filter logic: ONLY act if key matches pattern `capture_intent:*`.
- [ ] Extract `order_id` from the key.

### 3. Job Dispatch
- [ ] When a valid key expires, trigger a new BullMQ job (or Medusa Event): `order.capture_scheduled`.
- [ ] Payload: `{ orderId: string, timestamp: number }`.
- [ ] Log the event: "Capture Triggered for Order X via Redis Expiration".

## Acceptance Criteria
- [ ] **Event Detection**: Subscriber receives `expired` event immediately when TTL hits 0.
- [ ] **Filtering**: Ignores non-capture-intent keys.
- [ ] **Job Creation**: Successfully queues a `capture_order` job in the system.
- [ ] **Idempotency**: Basic check to ensure we don't double-queue if Redis fires twice (rare but possible).

## Technical Notes
- **Key Pattern**: `capture_intent:{order_id}`
- **Channel**: `__keyevent@0__:expired` (Assuming DB 0)
- **Warning**: Redis Pub/Sub is fire-and-forget. If the app is down when the event fires, it is LOST. This validates the need for Story 2.4 (Fallback Cron).
