# Story 3.2: Increment Authorization Logic & Update Totals

Status: ready-for-dev

## Story

As a Backend Developer,
I want to implement a Medusa Workflow to handle the "Add Item" operation,
So that I can sequentially:
1. Validate Pre-conditions (Auth, Stock, Status).
2. Recalculate Order Totals (Tax, Shipping).
3. Increment the Stripe Authorization.
4. Commit the changes (or rollback if Auth fails).

## Acceptance Criteria

### Functionality & Validation (The Guards)
1. **Given** `APP request POST /store/orders/:id/line-items`
2. **When** the workflow starts
3. **Then** it must strictly VALIDATE:
    - **Token Auth**: `x-modification-token` is valid/active.
    - **Order Status**: Must be `pending` (not captured/canceled).
    - **Inventory**: Check `InventoryService` for sufficient stock. If low, throw `409 Conflict`.
    - **Payment Status**: `stripe_payment_intent` must be in `requires_capture` state.
4. **And** Pre-Calculation Check:
    - Ensure Tax Provider and Shipping Provider are reachable.
    - If total difference is <= 0 (Item removed), SKIP Stripe Increment.

### Resilience & Error Handling
5. **And** Stripe Increment Logic:
    - **Retry Policy**: Implement Exponential Backoff (Initial: 200ms, Factor: 2, Max: 3 retries) for Network Errors (5xx, Timeout).
    - **Decline Handling**: If Stripe returns `card_declined`, DO NOT RETRY. Return `402`.
6. **And** The "Rollback Trap" (Critical):
    - If DB Commit fails *after* successful Stripe Increment -> **Log CRITICAL Audit Alert** ("AUTH_MISMATCH_OVERSOLD").
    - Return `500`.

### Technical Contracts

#### API Schema: `POST /store/orders/:id/line-items`

**Request:**
```json
{
  "variant_id": "var_123",
  "quantity": 1,
  "metadata": {} // optional
}
```
**Headers:** `x-modification-token: <jwt>`

**Response (200 OK):**
```json
{
  "order": {
    "id": "ord_123",
    "items": [ ... ],
    "total": 5500,
    "difference_due": 0
  },
  "payment_status": "succeeded"
}
```

**Response (Errors):**
- `402 Payment Required`: `{ "code": "card_declined", "message": "Insufficient funds" }`
- `409 Conflict`: `{ "code": "insufficient_stock", "message": "Item out of stock" }`
- `422 Unprocessable`: `{ "code": "invalid_state", "message": "Order already captured" }`

### Dev Notes

#### Architecture Compliance

- **Workflow Steps**:
  1. `validatePreconditionsStep` (Stock, Auth, Status)
  2. `calculateTotalsStep` (Tax, Shipping)
  3. `incrementStripeAuthStep` (External Call + Retry Policy)
  4. `updateOrderValuesStep` (DB Commit)
  
- **Guards**: NEVER increment auth if stock is missing. This prevents "holding money for items we don't have".

## Tasks / Subtasks

- [ ] **Workflow**: Implement `apps/backend/src/workflows/add-item-to-order.ts`
    - Add `InventoryService` confirmation step.
    - Add `TaxProvider` calculation step.
- [ ] **Stripe Step**:
    - Wrap call in `retry()` util with backoff.
    - Handle `IdempotencyKey` collision (return cached result).
- [ ] **Route**: Implement Validation Pipe for Schema.

## Testing Requirements

### Unit Tests
- `validatePreconditionsStep`: Mock Stock=0 -> Expect Throw.
- `incrementStripeAuthStep`: Mock Network Error -> Verify Retry Count = 3.

### Integration Tests
- **Stock Guard**: Try to add item with 0 stock -> 409 Conflict, NO Stripe Call.
- **Rollback Trap**: Mock Stripe=Success / DB=Error -> Verify Log + 500.
- **Tax Failure**: Mock Tax Provider Down -> 503, NO Stripe Call.
