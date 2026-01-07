# Adversarial Code Review Report: fix-INV-01-inventory-decrement

**Final Reviewer:** Antigravity (Adversarial Agent)
**Date:** 2026-01-04
**Story:** [fix-INV-01-inventory-decrement](./fix-INV-01-inventory-decrement.md)

## 🔴 CRITICAL FINDINGS (Action Required)

### 1. AC3 Violation: Arbitrary Fallback Remains in Code
- **Location:** `apps/backend/src/workflows/create-order-from-stripe.ts:278`
- **Problem:** AC3 explicitly states: *"inventory is decremented from the shipping/sales-channel-mapped location; if unmapped, the workflow fails (no arbitrary fallback)"*.
- **Code implementation:** 
  ```typescript
  // Fallback: highest stocked quantity (backorders allowed)
  return levels.sort((a, b) => (b.stocked_quantity ?? 0) - (a.stocked_quantity ?? 0))[0];
  ```
- **Status:** ✅ **FIXED** (Arbitrary fallback removed; now throws error)

### 2. AC2 Violation: Unconditional Backorders
- **Location:** `apps/backend/src/workflows/create-order-from-stripe.ts:330`
- **Problem:** The implementation allows stock to go negative (`stocked_quantity: newStock`) without checking if backorders are actually enabled for that inventory item/level.
- **AC Requirement:** *"if backorder is allowed for that level, the second may proceed... otherwise it fails with out-of-stock"*.
- **Status:** ⏭️ **DEFERRED** to `inv-02` per user request.

---

## 🟡 MEDIUM FINDINGS

### 3. "Theatrical" Testing (Smoke & Mirrors)
- **Location:** `apps/backend/integration-tests/unit/create-order-locking.unit.spec.ts`
- **Problem:** This "unit test" never actually executes the workflow or mocks the Medusa container. Instead, it reads the `.ts` file as a string and uses regular expressions to see if `acquireLockStep` is mentioned.
- **Status:** ✅ **FIXED** (Refactored to functional workflow tests)

### 4. Opaque Error Catching
- **Location:** `apps/backend/src/workflows/create-order-from-stripe.ts:246`
- **Problem:** `getSalesChannelLocationIds` catches all errors and returns `[]`. 
- **Status:** ✅ **FIXED** (Now throws explicit errors on query failure)

---

## 🟢 LOW FINDINGS

### 5. Git/Story Dissonance
- **Problem:** The story file lists `docs/sprint/sprint-artifacts/sprint-status.yaml` as modified, but it is not staged/tracked in the current git state.

---

## Final Assessment: ✅ PASSED (with 1 deferred item)

The implementation now strictly adheres to AC3 and provides functional testing for the locking mechanism. Error handling has been transparency-focused, preventing silent failures during location resolution.
