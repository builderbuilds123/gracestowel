# Story 3.4: Order Cancellation During Grace Period

Status: ready-for-dev

## Story

As a Shopper,
I want to cancel my order entirely within the grace period,
So that I don't get charged for an order I no longer want.

## Acceptance Criteria

### Functionality & Safety (CAS Transaction)
1. **Given** `POST /store/orders/:id/cancel`
2. **Then** the Backend must execute a **Serialized Transaction**:
    - **Step 1 (Pre-Check)**: Verify Token & Grace Period (1h).
    - **Step 2 (Queue Stop)**: Attempt `payment-capture-queue.remove(jobId)`.
    - **Step 3 (DB Lock)**: Begin Transaction `READ COMMITTED`.
        - `SELECT * FROM order WHERE id = :id FOR UPDATE`
        - IF `status == 'captured'` OR `status == 'canceled'` -> ABORT & RETURN.
        - UPDATE `order` SET `status = 'canceled'`.
    - **Step 4 (Commit)**: Commit DB Transaction.
3. **And** Post-Commit Actions:
    - **Void Payment**: Call `stripe.paymentIntents.cancel(pi_id)`.
    - **Inventory**: Call `inventoryService.restock(items)`.

### Resilience & Compensation
4. **And** Race Condition Handling (The "Too Late" Case):
    - If Step 2 or 3 finds the order/job is already processing/captured:
        - ABORT Cancellation.
        - Return `409 Conflict`.
        - Message: "Order is already being processed. Please contact support used for Refund."
5. **And** Compensation Failure (The "Zombie" Case):
    - If DB Cancel Commits, but Stripe Void Fails (Network Error):
        - **DO NOT** Rollback Order Status (User expects cancel).
        - **Log CRITICAL Alert**: "Order {id} Canceled but Payment Void Failed. Manual Void Required."
        - Return `200 OK` (with internal warning).
6. **And** Partial Capture Support:
    - If `payment_status` is `partially_captured`, reject Cancellation. Require Manual Refund.

### Technical Contracts

#### API Schema: `POST /store/orders/:id/cancel`

**Request:** `x-modification-token: <jwt>`

**Response (200 OK):**
```json
{
  "order_id": "ord_123",
  "status": "canceled",
  "payment_action": "voided"
}
```

**Response (Errors):**
- `409 Conflict`: `{ "code": "late_cancel", "message": "Order already processed" }`
- `422 Unprocessable`: `{ "code": "partial_capture", "message": "Cannot cancel partially captured order" }`

### Tasks / Subtasks

- [ ] **Workflow**: `cancel-order-with-refund.ts`
    - Implement `lockOrderStep` (Select for Update).
    - Implement `voidPaymentStep` with Compensation (Alert Only).
    - Implement `restockInventoryStep`.
- [ ] **Queue Logic**: Ensure `payment-capture-queue` respects the Lock.

## Testing Requirements

### Integration Tests
- **The "Photo Finish"**: Start Capture Job (Sleep 1s). Call Cancel 100ms later. Verify Capture Job detects `canceled` status and Aborts.
- **Zombie Payment**: Mock Stripe Fail on Void. Verify Order=Canceled, Log=Critical.
- **Double Cancel**: 2 concurrent requests. 1 succeeds, 1 returns "Already Canceled" (Idempotent 200).
