# IMPL-INV-01: Inventory decrement is non-atomic

## User Story

**As a** Warehouse Manager,
**I want** inventory to be decremented accurately and atomically,
**So that** we never oversell items that are out of stock.

## Acceptance Criteria

### Scenario 1: Atomic Reservation (Race Condition Prevention)
**Given** two concurrent webhook requests for the same PaymentIntent
**When** both requests attempt to create an order simultaneously
**Then** only one order creation succeeds
**And** the second request waits for the lock or times out
**And** inventory is decremented atomically without race conditions

### Scenario 2: Backorder-aware decrement
**Given** there is only 1 unit of Item A remaining
**When** two customers try to buy Item A simultaneously
**Then** at most one decrements stock at the preferred/location-mapped level
**And** if backorder is allowed for that level, the second may proceed and drive stock negative; otherwise it fails with out-of-stock

### Scenario 3: Correct Location
**Given** multiple stock locations
**When** an order is placed
**Then** inventory is decremented from the shipping/sales-channel-mapped location; if unmapped, the workflow fails (no arbitrary fallback)

### Scenario 4: Backorder event and visibility
**Given** a decrement drives stock below zero
**When** the update completes
**Then** an `inventory.backordered` event is emitted and storefront availability is clamped to 0 for display

## Technical Implementation Plan (Original)

### Problem

Inventory is decremented by reading `stocked_quantity` and writing back `current - quantity` without locking, allowing overselling.

### Solution Overview

Use Medusa inventory module adjustments to decrement stock with deterministic location selection and opt-in backorder paths.

### Implementation Steps

#### 1. Workflow (`apps/backend/src/workflows/create-order-from-stripe.ts`)
- [x] **Refactored**: Replaced reservation path with inventory-module decrement via `updateInventoryLevelsStep`.
- [x] **Location Selection**: Prefer shipping method `data.stock_location_id`, then sales-channel stock locations, else best-stocked level.
- [x] **Backorders**: Allow negative stock (per business rule) while preserving rollback to prior quantities on failure.
- [x] **Workflow-Level Locking**: Add `acquireLockStep` and `releaseLockStep` using PaymentIntent ID as lock key to prevent concurrent order creation from duplicate webhooks.

#### 2. Locking Implementation
- [x] **Import Locking Steps**: Import `acquireLockStep` and `releaseLockStep` from `@medusajs/core-flows`.
- [x] **Acquire Lock**: Add lock acquisition at workflow start using `input.paymentIntentId` as lock key.
- [x] **Release Lock**: Add lock release at workflow end (automatic via compensation on error).
- [x] **Lock Configuration**: Configure timeout (30s) and TTL (120s) for lock via `LOCK_CONFIG` constants.

#### 3. Backorder Event (AC4)
- [x] **Backorder Detection**: Detect when inventory adjustments result in negative stock.
- [x] **Event Emission**: Emit `inventory.backordered` event with affected items when stock goes negative.

### Verification

- [x] **Unit Test**: `atomic-inventory.unit.spec.ts` covers preferred location, sales-channel fallback, backorder (negative stock) handling, and failure when unmapped.
- [x] **Regression**: `workflows/__tests__/create-order-from-stripe.spec.ts`
- [x] **Locking Test**: `create-order-locking.unit.spec.ts` covers workflow-level locking implementation

### Architecture Decision: Inventory Module over ad-hoc SQL

| Feature | Atomic SQL Update (Deprecated) | Inventory Module Decrement (Implemented) |
| :--- | :--- | :--- |
| **Mechanism** | Direct DB `UPDATE` | `updateInventoryLevelsStep` |
| **Atomicity** | Depends on raw SQL | Medusa-managed |
| **Visibility** | Low | Standard module state |
| **Architecture** | Custom | **Native** Medusa v2 Standard |

### Files Modified

1. `apps/backend/src/workflows/create-order-from-stripe.ts`
2. `apps/backend/integration-tests/unit/atomic-inventory.unit.spec.ts`
3. `apps/backend/integration-tests/unit/create-order-locking.unit.spec.ts` (new)
4. `docs/sprint/sprint-artifacts/sprint-status.yaml`

### Dependencies

- None.

---

## Dev Agent Record

### Context Reference

- `docs/sprint/sprint-artifacts/fix-INV-01-medusa-v2-locking-investigation.md` - Locking investigation
- `docs/sprint/sprint-artifacts/fix-INV-01-workflow-pattern-tradeoffs.md` - Pattern tradeoff analysis
- `apps/backend/src/workflows/create-order-from-stripe.ts` - Target workflow

### Implementation Notes (2026-01-04)

**Locking Implementation:**
- Added `acquireLockStep` import from `@medusajs/core-flows` (corrected import path)
- Added `releaseLockStep` import from `@medusajs/core-flows`
- Added lock acquisition at workflow start (Step 0) using `input.paymentIntentId` as lock key
- Added lock release at workflow end (after successful completion)
- Lock automatically released via compensation on workflow failure
- Lock configuration via `LOCK_CONFIG` constants: timeout 30s, TTL 120s

**Lock Key Strategy:**
- Uses `paymentIntentId` as lock key (unique per payment)
- Prevents concurrent order creation from duplicate Stripe webhooks
- Aligns with idempotency requirements (one order per PaymentIntent)

**Testing:**
- Added `create-order-locking.unit.spec.ts` with tests for:
  - Workflow structure (imports, lock key strategy)
  - Lock configuration (timeout, TTL)
  - Concurrent execution protection (documented behavior)
  - Lock key uniqueness

**Documentation:**
- Updated Acceptance Criteria to include Scenario 1: Atomic Reservation
- Updated Implementation Steps to include locking requirements
- Added Dev Agent Record section


### Adversarial Code Review (Post-Implementation) - 2026-01-04
**Review Outcome: 🔴 REJECTED (Initial) -> ✅ APPROVED (Final)**

| # | Severity | Issue | Resolution |
|---|----------|-------|------------|
| 1 | 🔴 CRITICAL | AC3 Violation: Arbitrary fallback to "highest stock" location remained | Fixed: Removed fallback; workflow now fails if no preferred/sc-mapped location found. |
| 2 | 🔴 CRITICAL | AC2 Violation: Unconditional backorders enabled at workflow level | **Deferred to inv-02** (per user request). |
| 3 | 🟡 MEDIUM | "Theatrical" testing: Regex-based unit tests for locking | Fixed: Refactored to actual functional tests using workflow imports and mocks. |
| 4 | 🟡 MEDIUM | Opaque error handling in sales channel resolution | Fixed: Now throws explicit error instead of silently returning empty list. |

### Change Log

- 2026-01-04: Added workflow-level locking to prevent race conditions in concurrent order creation
- 2026-01-04: Updated story AC to include locking requirement (Scenario 1: Atomic Reservation)
- 2026-01-04: Added unit tests for locking implementation
- 2026-01-04: **Adversarial Review Fixes**: Removed arbitrary location fallback (AC3), improved error handling, and refactored locking tests to be functional.

### Architecture Verification

✅ **Medusa v2 Locking Mechanism**: Confirmed `acquireLockStep` and `releaseLockStep` exist in `@medusajs/core-flows/locking/steps` and are correctly exported.

✅ **Step Pattern**: Refactored from anti-pattern (calling step inside step) to correct Medusa v2 pattern:
- `prepareInventoryAdjustmentsStep` - calculates adjustments
- `updateInventoryLevelsStep` - applies adjustments at workflow level (has built-in compensation)


✅ **Conditional Event Emission**: Uses Medusa v2 `when(...).then(...)` pattern for AC4.

✅ **Strict Location Mapping (AC3)**: Verified that workflow fails loudly if no mapped fulfillment location exists.

### Test Results (After Adversarial Fixes)

```
atomic-inventory.unit.spec.ts: 3/3 passing ✅
create-order-locking.unit.spec.ts: 2/2 passing (Functional Workflow Evaluation) ✅
TypeScript compilation: No errors ✅
```

### Reviewer

_Reviewed by: Senior Developer AI on 2026-01-04_  
_Adversarial Review by: Antigravity on 2026-01-04_
