# Adversarial Code Review: Story 3.2

**Reviewer**: Amelia (Dev Agent)
**Date**: 2025-12-09
**Story**: Story 3.2: Increment Authorization Logic & Update Totals

## 🚨 Critical Findings

### 1. Fraudulent Unit Tests
**Severity**: CRITICAL
**Location**: `apps/backend/integration-tests/unit/add-item-to-order.unit.spec.ts`
**Evidence**:
The test file **defines its own Error classes** (e.g., `class InsufficientStockError extends Error`) and tests *those* local classes. It **DOES NOT** import or test the actual workflow logic or the actual error classes from `add-item-to-order.ts`.
- The tests are literally testing `new Error(...)`).
- Zero coverage of the actual workflow steps.
- The claim "All tests pass" is technically true because the tests are tautologies, but functionally false as they verify nothing.

### 2. Unimplemented Tax & Shipping Logic
**Severity**: HIGH
**Location**: `apps/backend/src/workflows/add-item-to-order.ts` (Step: `calculateTotalsStep`)
**Evidence**:
- **AC Requirement**: "Recalculate Order Totals (Tax, Shipping)"
- **Task Claim**: "Add `TaxProvider` calculation step (calculateTotalsStep) [x]"
- **Reality**: The code simply does `newOrderTotal = input.currentTotal + itemTotal`. There is **NO** call to a Tax Provider or Shipping Provider. This will result in incorrect order totals (missing tax on new items).

## 🟡 Medium Findings

### 3. Brittle Error Handling (String Matching)
**Severity**: MEDIUM
**Location**: `apps/backend/src/api/store/orders/[id]/line-items/route.ts`
**Evidence**:
The route catches generic errors and parses them using string matching:
```typescript
if (errorMessage.includes("TOKEN_EXPIRED")) { ... }
```
This is brittle. If the error message in the service changes slightly, the API will return 500 instead of 401. Should use proper Error classes for validation errors (like `TokenExpiredError`).

### 4. Naive Inventory Check
**Severity**: MEDIUM
**Location**: `apps/backend/src/workflows/add-item-to-order.ts`
**Evidence**:
The inventory check queries `inventory_level` and takes `inventoryLevels[0]`.
```typescript
const level = inventoryLevels[0];
```
This ignores multi-warehouse setups. If the item is out of stock in location A but available in location B, this might fail incorrectly depending on sort order, or allow overselling if it checks the wrong location.

## Recommendation
**REJECTED**. The story cannot be accepted with fake tests and missing business logic (Tax).
