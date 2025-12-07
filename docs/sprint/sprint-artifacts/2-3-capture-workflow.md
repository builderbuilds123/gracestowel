# Story 2.3: Capture Workflow

## Goal
Implement the **Capture Worker/Handler** that executes the actual Stripe payment capture. This handler is triggered by the Expiration Listener (Story 2.2) or the Fallback Cron (Story 2.4).

## Context
- **Epic**: [Epic 2: Grace Period & Delayed Capture Engine](../product/epics/payment-integration.md)
- **PRD**: [FR-4.1 Event-Driven Capture](../prd/payment-integration.md)

## Implementation Steps

### 1. Capture Processor/Job
- [ ] Create/Update the handler for `order.capture_scheduled`.
- [ ] **Fetch Order**: Retrieve Order by ID, including `total` and `payments`.
- [ ] **Status Check**:
    - If status is `captured` or `canceled` -> ABORT.
    - If status is `requires_action` or `pending` -> PROCEED.

### 2. Stripe Interaction
- [ ] Service Method: `PaymentProviderService.capturePayment(paymentId)`.
- [ ] **Amount Check**: Ensure we capture the *current* `order.total`.
    - *Note*: If the user edited the order, the `order.total` differs from the initial auth. Stripe `capture` amount must match the new total (up to the authorized limit + increment).

### 3. Post-Capture Updates
- [ ] **Success**:
    - Update Order Status -> `captured` (or `processing` / `completed` per Medusa flow).
    - Emit event `order.payment_captured`.
- [ ] **Failure** (e.g., specific decline):
    - Log Error "Capture Failed for Order X: Reason".
    - Retry Logic: Configure 3 retries with backoff.
    - Final Failure: Alert Admin (Log/Notification).

## Acceptance Criteria
- [ ] **Successful Capture**: Funds move in Stripe Dashboard; Order status updates in Medusa.
- [ ] **Dynamic Amount**: Captures the *latest* order total, not just the original session total.
- [ ] **Idempotency**: Processing the same job twice does not charge the customer twice.
- [ ] **Error Handling**: Retries on transient errors; fails gracefully on permanent ones.

## Technical Notes
- Use `idempotency_key` when calling Stripe API to prevent double-charging on retries.
- Ensure `order.payment_status` transitions correctly (`awaiting` -> `captured`).
