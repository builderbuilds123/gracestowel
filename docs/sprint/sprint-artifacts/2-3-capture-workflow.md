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
- [ ] In `processPaymentCapture`, resolve the Medusa `OrderService` (or Module).
- [ ] Fetch the *latest* Order by `orderId`, including `total` and `currency_code`.

### 2. Currency Conversion (CRITICAL)
- [ ] Ensure `order.total` is converted to the correct Stripe integer format (cents).
    - *Note*: Medusa usually stores `total` in cents (integer) for the backend. **Verify this**.
    - If `total` is float (e.g. 10.99), multiply by 100.
    - If `total` is integer (1099), pass as is.
    - Use `medusa-core-utils` or existing helpers if available.

### 3. Dynamic Capture Call
- [ ] Call `stripe.paymentIntents.capture`:
    - `amount_to_capture`: The calculated integer total.
    - `idempotency_key`: `capture_${orderId}_${job.timestamp}`.
- [ ] Log the capture attempt: "Capturing ${amount} cents for Order ${orderId}".

### 4. Handle Partial/Excess Scenarios
- [ ] **Partial**: If `amount` < `authorized`, Stripe handles this (releases rest).
- [ ] **Excess**: If `amount` > `authorized`, this capture will fail unless `increment_authorization` was done previously.
    - Wrap in `try/catch`.
    - If error is "amount_too_large", fail gracefully and alert admin (or trigger specific recovery workflow).

## Acceptance Criteria
- [ ] **Correct Amount**: Captures the EXACT `order.total` (in cents).
- [ ] **Idempotency**: Retrying the job does not result in double charges.
- [ ] **Logging**: Logs show specific amount being captured.

## Technical Notes
- Access Medusa Container within the worker scope to get `OrderService`.
- **Currency**: `payment-capture-queue.ts` currently does not import any utils. Check `src/utils` or `@medusajs/utils`.
