# Story 3.4: Order Cancellation During Grace Period

Status: Done

## Story

As a Shopper who just placed an order,
I want to cancel my entire order within the 1-hour grace period,
So that the authorized payment is voided and I'm not charged,
Without requiring manual refund processing or support intervention.

## Acceptance Criteria

### Functionality & Safety (CAS Transaction)

### API Contract: `POST /store/orders/:id/cancel`

**Pre-Conditions:**
- Valid `x-modification-token` header for this order
- Grace period active (< 1 hour since order placed)

**Transaction Sequence (CAS Pattern):**
1. **Queue Stop:** Remove `payment-capture-queue` job (or fail if active → 409)
2. **State Validation:** Verify order not canceled/captured, PI not succeeded → 409 if late
3. **DB Update:** Set order status = 'canceled'
4. **Compensation:** Void Stripe PI (log CRITICAL if fails, return 200 anyway)
5. **Inventory:** Restock all order items (Note: Multi-location logic restocks to first location found)

**Response:**
- **Success (200):** `{ order_id, status: "canceled", payment_action: "voided" | "void_failed" }`
- **Errors:** 409 (`late_cancel`), 422 (`partial_capture`), 503 (`service_unavailable`)

### Technical Contracts

#### Architectural Constraint: Medusa v2 ORM Limitations
**Critical:** Medusa v2's `query.graph()` does NOT support SQL row-level locks (`FOR UPDATE`).

**Mitigation Pattern (Accepted by Architecture):**
- Use **Stripe PaymentIntent status as distributed lock**
- PI status `succeeded` = payment already captured → reject cancel (409)
- PI status `requires_capture` with `amount_received > 0` = partial capture → reject (422)
- Queue removal + PI check + order status update = CAS-equivalent pattern

#### Metadata Storage Integration (Story 3.2 Context)
**Pending Modifications Pattern based on Story 3.2:**
- Story 3.2 stores `metadata.updated_total` and `metadata.added_items`
- **Cancellation Impact:** Cancel voids the ORIGINAL authorized amount (plus any increments)
- No special metadata cleanup needed - order status='canceled' takes precedence

#### Stripe Webhook Interaction
**Expected Webhook:** After successful `stripe.paymentIntents.cancel()`:
- Stripe sends `payment_intent.canceled` event
- Webhook handler (Epic 1) should be **idempotent** (order already canceled in DB)
- No action needed in webhook beyond logging/metrics

#### Rate Limiting (Inherited from Story 3.2 Pattern)
**Edge-Level Protection:**
- Cloudflare rate limit: 60 req/min per IP for `/store/orders/*/cancel`
- **No application-level rate limiter needed** - edge protection sufficient.

### Tasks / Subtasks

- [x] **Workflow**: `cancel-order-with-refund.ts`
    - Implement `lockOrderStep` (Select for Update).
    - Implement `voidPaymentStep` with Compensation (Alert Only).
    - Implement `restockInventoryStep`.
- [x] **Queue Logic**: Ensure `payment-capture-queue` respects the Lock.

## Testing Requirements

### Integration Tests
- [x] **The "Photo Finish"**: Capture job detects `canceled` status and Aborts.
- [x] **Zombie Payment**: Mock Stripe Fail on Void. Verify Order=Canceled, Log=Critical.
- [x] **Double Cancel**: 2 concurrent requests. 1 succeeds, 1 returns "Already Canceled" (Idempotent 200).

### Operational Testing
- **CRITICAL Alert Verification:** Trigger zombie case in test environment, verify:
  - Console log contains "[CRITICAL] Order {id} Canceled but Payment Void Failed"
  - Metric `cancel_void_failed` logged for monitoring dashboard

### Integration Test Environment Setup
**To Enable skipped tests:**
1. Configure `TEST_DATABASE_URL` in `.env.test`
2. Run `npm run test:integration`
3. Unskip tests in `cancel-order.spec.ts`

## Monitoring & Observability

### Metrics Logged
- `cancel_void_failed` (order={id}, pi={pi_id}) - Zombie payment case for manual intervention
- `capture_blocked_canceled_order` (order={id}) - Guard prevented capturing canceled order

### Alerts
- **CRITICAL** console.error triggers manual review queue
- Future: PagerDuty integration for >1% zombie case rate (Epic 8)

---

## Implementation History

**Key Decisions from Review Cycles:**
1. **H1 - DB Lock Workaround:** Stripe PI status serves as distributed lock (Medusa v2 ORM limitation)
2. **H2 - Token Location:** Uses `x-modification-token` header (not body)
3. **M1 - Test Quality:** Rewrote unit tests to exercise actual handlers (18 tests, full coverage)
4. **M3 - Queue Guard:** Fails hard on Redis errors (503 response) to prevent zombie payments
5. **H1 (Pt2) - Race Condition:** Added `JOB_ACTIVE` error handling for active capture jobs
    - If job state transitions from 'waiting' to 'active' BETWEEN `getState()` check and `remove()` call:
    - BullMQ's `job.remove()` throws error → Caught → Wrapped as `QueueRemovalError` → 503 response

**Fallback Cron Protection:**
- If Redis is down during cancel, capture job might not be removed
- Fallback cron (Story 2.4) will attempt to capture "stuck" orders
- **Guard:** Capture worker checks `order.status === 'canceled'` before capturing



