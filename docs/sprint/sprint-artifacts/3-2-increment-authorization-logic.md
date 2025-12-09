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
  "metadata": {}
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
Implemented `add-item-to-order` workflow as a Medusa workflow with 4 sequential steps:
1. **validatePreconditionsStep**: Token auth, order status (pending), inventory stock, PI status (requires_capture)
2. **calculateTotalsStep**: Fetches variant price and calculates new order totals
3. **incrementStripeAuthStep**: Exponential backoff retry (200ms, 2x, max 3), idempotency, skip if diff <= 0
4. **updateOrderValuesStep**: DB commit with CRITICAL "AUTH_MISMATCH_OVERSOLD" audit logging on rollback trap

### Completion Notes
- Created error classes: `InsufficientStockError`, `InvalidOrderStateError`, `InvalidPaymentStateError`, `CardDeclinedError`, `AuthMismatchError`
- Route supports `x-modification-token` header (with body fallback)
- Error codes: 409 (stock), 402 (declined), 422 (invalid state), 500 (auth mismatch)
- All tests pass

---

## File List

### New Files
- `apps/backend/src/workflows/add-item-to-order.ts`
- `apps/backend/integration-tests/unit/add-item-to-order.unit.spec.ts`

### Modified Files
- `apps/backend/src/api/store/orders/[id]/line-items/route.ts`

---

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2025-12-09 | Implemented add-item-to-order workflow, updated route, added unit tests | Dev Agent |

---

## Infrastructure Notes

### Rate Limiting (Deferred to Infrastructure)

Per code review, rate limiting for `POST /store/orders/:id/line-items` should be implemented at the **Cloudflare edge layer** rather than in application code:

**Configuration:**
- **Path:** `/store/orders/*/line-items`
- **Method:** POST
- **Limit:** 60 requests per minute per IP
- **Action:** Block with HTTP 429

**Rationale:** Already using Cloudflare for storefront deployment. Edge-based rate limiting blocks abuse before it reaches the Medusa backend, requires zero code changes, and scales automatically.

**Future Enhancement:** If token-based abuse is detected, add server-side Redis-based rate limiting per `x-modification-token` (10 req/min).

---

## Architecture Decision Record: Metadata Storage

### Decision

Store pending order modifications in **order metadata** rather than creating actual line items.

### Context

Medusa v2's Order module does not provide a direct "add line item to existing order" API. Order Edits workflow is designed for post-capture adjustments, not pre-capture modifications during a grace period.

### Implementation

| Operation | Metadata Storage | Stripe Action | Capture Behavior |
|-----------|-----------------|---------------|------------------|
| **Add Item** | `added_items[]` + `updated_total` | `increment_authorization` | Capture `updated_total` |
| **Remove Item** | `removed_items[]` + `updated_total` | None | Capture `updated_total` (less) |
| **Cancel** | N/A (status = canceled) | `cancel` | Skip capture |

### Integration Points

1. **add-item-to-order.ts** → Stores `metadata.updated_total` and `metadata.added_items`
2. **payment-capture-queue.ts** → `fetchOrderTotal()` reads `metadata.updated_total` if present

### Trade-offs

- ✅ Simple: No complex Order Edits workflow
- ✅ Integrated: Capture worker handles all cases
- ⚠️ Pending items not visible in standard order queries (require metadata parsing)
- ⚠️ Requires capture worker enhancement for each modification type
