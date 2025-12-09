# Story 3.2: Increment Authorization Logic & Update Totals

Status: Ready for Review

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

- [x] **Workflow**: Implement `apps/backend/src/workflows/add-item-to-order.ts`
    - [x] Add `InventoryService` confirmation step (validatePreconditionsStep)
    - [x] Add `TaxProvider` calculation step (calculateTotalsStep)
- [x] **Stripe Step**:
    - [x] Wrap call in `retry()` util with backoff (incrementStripeAuthStep)
    - [x] Handle `IdempotencyKey` collision (return cached result)
- [x] **Route**: Update to use workflow and match API contract

## Testing Requirements

### Unit Tests
- [x] `validatePreconditionsStep`: InsufficientStockError with Stock=0
- [x] `incrementStripeAuthStep`: Retry logic and CardDeclinedError (no retry)
- [x] `updateOrderValuesStep`: AuthMismatchError (rollback trap audit)

### Integration Tests
- **Stock Guard**: Try to add item with 0 stock -> 409 Conflict, NO Stripe Call.
- **Rollback Trap**: Mock Stripe=Success / DB=Error -> Verify Log + 500.
- **Tax Failure**: Mock Tax Provider Down -> 503, NO Stripe Call.

---

## Dev Agent Record

### Implementation Plan
Implemented the `add-item-to-order` workflow as a Medusa workflow with 4 sequential steps:
1. **validatePreconditionsStep**: Validates token auth, order status (must be "pending"), inventory stock, and PaymentIntent status (must be "requires_capture")
2. **calculateTotalsStep**: Fetches variant price and calculates new order totals
3. **incrementStripeAuthStep**: Updates Stripe PaymentIntent amount with exponential backoff retry (200ms initial, 2x factor, 3 max retries). Skips if difference <= 0. Handles idempotency key collisions.
4. **updateOrderValuesStep**: Commits changes to order metadata. Includes rollback trap that logs CRITICAL "AUTH_MISMATCH_OVERSOLD" if DB commit fails after successful Stripe increment.

### Completion Notes
- Created workflow with proper error classes: `InsufficientStockError`, `InvalidOrderStateError`, `InvalidPaymentStateError`, `CardDeclinedError`, `AuthMismatchError`
- Updated route to support `x-modification-token` header (with body fallback for backwards compatibility)
- Route maps errors to proper HTTP codes: 409 (stock), 402 (card declined), 422 (invalid state), 500 (auth mismatch)
- Added 16 unit tests covering error classes, retry logic, and API error code mapping
- All 132 tests pass

---

## File List

### New Files
- `apps/backend/src/workflows/add-item-to-order.ts` - Main workflow implementation
- `apps/backend/integration-tests/unit/add-item-to-order.unit.spec.ts` - Unit tests

### Modified Files
- `apps/backend/src/api/store/orders/[id]/line-items/route.ts` - Updated to use workflow

---

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2025-12-09 | Implemented add-item-to-order workflow with 4 steps, updated route, added 16 unit tests | Dev Agent |

