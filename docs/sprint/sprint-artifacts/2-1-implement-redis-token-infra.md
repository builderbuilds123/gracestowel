# Story 2.1: Redis Token Infrastructure

## Goal
Implement the **Redis Token Infrastructure** to manage the 1-hour grace period for order edits. This involves creating a service to generate, store, and validate "Capture Intent" tokens in Redis with a strict 1-hour TTL.

## Context
- **Epic**: [Epic 2: Grace Period & Delayed Capture Engine](../product/epics/payment-integration.md)
- **PRD**: [FR-5 1-Hour Grace Period](../prd/payment-integration.md)
- **Architecture**: [Redis Keyspace Notifications](../analysis/research/technical-stripe-integration-research-2025-12-06.md)

## Implementation Steps

### 1. New Service: `CaptureIntentService`
- [ ] Create `apps/backend/src/services/capture-intent.ts`.
- [ ] Implement `createIntent(orderId: string): Promise<void>`.
    - Should SET `capture_intent:{orderId}` in Redis.
    - Value: `Date.now()` or Order Metadata.
    - TTL: `3600` seconds (1 hour).
- [ ] Implement `validateIntent(orderId: string): Promise<boolean>`.
    - Should return `true` if key exists, `false` otherwise.

### 2. Event Subscriber
- [ ] Create `apps/backend/src/subscribers/order-placed.ts`.
- [ ] Listen for `order.placed` event.
- [ ] Call `CaptureIntentService.createIntent` to start the timer immediately upon order creation.

### 3. Redis Persistence Configuration
- [ ] Verify `medusa-config.ts` uses the shared Redis connection for the new service.
- [ ] Ensure Redis is configured for persistent keys (should be standard in our setup, but verify).

## Acceptance Criteria
- [ ] **Redis Key Generation**: Placing an order creates a key `capture_intent:{order_id}`.
- [ ] **TTL Accuracy**: The key MUST have a TTL of 3600 seconds.
- [ ] **Validation**: `validateIntent` correctly reports active/expired status.
- [ ] **Integration**: The flow works automatically for every new order.

## Technical Notes
- Use the `RedisService` or `EventBusService` connection if available, or inject `redisConnection`.
- Key prefix `capture_intent:` is critical for the future Expiration Listener (Story 2.2).
