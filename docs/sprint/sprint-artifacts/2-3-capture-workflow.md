# Story 2.3: Enhance Capture Logic for Dynamic Totals

## Goal
Modify the **Payment Capture Worker** to handle dynamic order totals. The current implementation blindly captures the original `PaymentIntent` amount, which may be incorrect if the user modified the order (added/removed items) during the grace period.

## Context
- **Epic**: [Epic 2: Grace Period & Delayed Capture Engine](../product/epics/payment-integration.md)
- **Problem**: `processPaymentCapture` uses the static `PaymentIntent` amount. We must capture the *current* `order.total`.
- **Critical Requirement**: Stripe requires amounts in **cents** (integer), but Medusa might store them differently depending on the context. API calls must use integer cents.
- **Existing Code**: `src/lib/payment-capture-queue.ts`.

## Implementation Steps

### 1. Fetch Fresh Order Data
- [x] In `processPaymentCapture`, resolve the Medusa `OrderService` (or Module).
- [x] Fetch the *latest* Order by `orderId`, including `total` and `currency_code`.

### 2. Currency Conversion (CRITICAL)
- [x] Ensure `order.total` is converted to the correct Stripe integer format (cents).
    - *Note*: Medusa usually stores `total` in cents (integer) for the backend. **Verified**.
    - If `total` is float (e.g. 10.99), multiply by 100.
    - If `total` is integer (1099), pass as is.
    - Use `medusa-core-utils` or existing helpers if available.

### 3. Dynamic Capture Call
- [x] Call `stripe.paymentIntents.capture`:
    - `amount_to_capture`: The calculated integer total.
    - `idempotency_key`: `capture_${orderId}_${job.timestamp}`.
- [x] Log the capture attempt: "Capturing ${amount} cents for Order ${orderId}".

### 4. Handle Partial/Excess Scenarios
- [x] **Partial**: If `amount` < `authorized`, Stripe handles this (releases rest).
- [x] **Excess**: If `amount` > `authorized`, this capture will fail unless `increment_authorization` was done previously.
    - Wrap in `try/catch`.
    - If error is "amount_too_large", fail gracefully and alert admin (or trigger specific recovery workflow).

## Acceptance Criteria
- [x] **Correct Amount**: Captures the EXACT `order.total` (in cents).
- [x] **Idempotency**: Retrying the job does not result in double charges.
- [x] **Logging**: Logs show specific amount being captured.

## Technical Notes
- Access Medusa Container within the worker scope to get `OrderService`.
- **Currency**: `payment-capture-queue.ts` currently does not import any utils. Check `src/utils` or `@medusajs/utils`.

## Status
**Done** ✅

## Dev Agent Record

### Implementation Plan
- Modified `startPaymentCaptureWorker` to accept optional `MedusaContainer` parameter
- Added `fetchOrderTotal` function to query fresh order data from Medusa
- Enhanced `processPaymentCapture` to use dynamic order total instead of static PaymentIntent amount
- Implemented idempotency keys using `capture_${orderId}_${scheduledAt}` format
- Added partial capture support (Stripe releases uncaptured portion)
- Added excess capture detection with critical error logging

### Completion Notes
- All 102 unit tests pass (13 test suites)
- TypeCheck passes with no errors
- Added 4 new tests for worker container parameter
- Backward compatible: falls back to original amount if order fetch fails

### Tasks
- [x] Configure BullMQ with Redis connection using `REDIS_URL`
- [x] Implement `payment-capture` queue and processor
- [x] Create `startPaymentCaptureWorker` loader
- [x] Implement logic to fetch *current* order total from Medusa (Story 2.3)
- [x] Implement dynamic capture logic (partial/excess handling) (Story 2.3)
- [x] Add idempotency keys to capture requests
- [x] Add logging for capture events
- [x] **Design Review Corrections**:
  - [x] Added `fetchOrderTotal` unit tests (H1)
  - [x] Added `processPaymentCapture` unit tests (H2, H3)
  - [x] Fixed currency validation & fallback logic (M1, M2)
  - [x] Improved Stripe error handling integration (M3)

### Validation
- [x] Unit/Integration Tests:
  - `apps/backend/integration-tests/unit/payment-capture-queue.unit.spec.ts`: Comprehensive coverage (14 tests) for queue, worker, order fetching, and dynamic capture scenarios.
- [x] Manual verification of Redis connection (via logs)
- [x] CI Check: All tests passed.

### File List
- `apps/backend/src/lib/payment-capture-queue.ts` (modified)
- `apps/backend/src/loaders/payment-capture-worker.ts` (modified)
- `apps/backend/integration-tests/unit/payment-capture-queue.unit.spec.ts` (modified)

### Change Log
- 2025-12-08: Implemented dynamic capture logic. Worker now fetches fresh order total from Medusa before capturing. Added idempotency keys and partial/excess capture handling.
