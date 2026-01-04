# Atomicity Investigation: updateInventoryLevelsStep

**Date:** 2026-01-04  
**Story:** fix-INV-01-inventory-decrement  
**Investigation Scope:** Verify atomicity guarantees of Medusa v2's `updateInventoryLevelsStep`

---

## Investigation Summary

### What Was Found

1. **Implementation Pattern:**
   - Code uses `updateInventoryLevelsStep` from `@medusajs/core-flows` (v2.12.3)
   - Step accepts `UpdateInventoryLevelInput[]` with absolute `stocked_quantity` values
   - Current code calculates absolute values in `atomicDecrementInventory()` before calling the step

2. **Current Code Flow:**
   ```
   atomicDecrementInventory() → Reads current stock → Calculates newStock = previousStock - quantity
   → Passes absolute stocked_quantity to updateInventoryLevelsStep()
   ```

3. **Test Coverage:**
   - Test file exists: `apps/backend/integration-tests/unit/atomic-inventory.unit.spec.ts`
   - Tests cover: location selection, backorders, error cases
   - **Missing:** Concurrent update/race condition tests (despite commit message claiming these exist)

4. **Medusa v2 Documentation:**
   - Workflows are transactional (steps rollback on failure)
   - However, workflow-level transactions don't prevent concurrent workflows from racing
   - No explicit documentation found on `updateInventoryLevelsStep` internal implementation

---

## Critical Question: Is updateInventoryLevelsStep Actually Atomic?

### The Problem

The code pattern is:
```typescript
const previousStock = level.stocked_quantity ?? 0;
const newStock = previousStock - item.quantity;
adjustments.push({ stocked_quantity: newStock }); // Absolute value
await updateInventoryLevelsStep(adjustments);
```

This is a **read-then-write pattern**. If two workflows run concurrently:

1. Workflow A: Reads stock = 5
2. Workflow B: Reads stock = 5 (same value)
3. Workflow A: Calculates newStock = 5 - 2 = 3
4. Workflow B: Calculates newStock = 5 - 2 = 3
5. Workflow A: Calls `updateInventoryLevelsStep({ stocked_quantity: 3 })`
6. Workflow B: Calls `updateInventoryLevelsStep({ stocked_quantity: 3 })`

**Result:** Both succeed, but stock should be 1, not 3. **Race condition!**

### Possible Solutions

#### Option 1: updateInventoryLevelsStep Uses Atomic SQL (Best Case)
If `updateInventoryLevelsStep` internally uses:
```sql
UPDATE inventory_level 
SET stocked_quantity = $1 
WHERE id = $2 AND stocked_quantity = $3  -- Optimistic locking
```

Or uses PostgreSQL's atomic operations, then it's safe. **However, we cannot verify this without Medusa source code.**

#### Option 2: updateInventoryLevelsStep Just Does Simple UPDATE (Worst Case)
If it's just:
```sql
UPDATE inventory_level SET stocked_quantity = $1 WHERE id = $2
```

Then we have a race condition. The last write wins, causing overselling.

#### Option 3: Use adjustInventory with Relative Values (If Available)
Medusa v2 might have an `adjustInventory` method that accepts relative adjustments:
```typescript
adjustInventory(itemId, locationId, -quantity) // Atomic decrement
```

---

## Recommendations

### Immediate Actions

1. **Verify Medusa Source Code** (if accessible):
   - Check `@medusajs/core-flows` source code for `updateInventoryLevelsStep` implementation
   - Look for optimistic locking, row-level locking, or atomic SQL patterns

2. **Add Concurrent Test** (CRITICAL):
   ```typescript
   it("prevents race condition with concurrent updates", async () => {
     // Simulate 2 concurrent workflows updating same inventory
     // Verify only one succeeds OR both update atomically
   });
   ```

3. **Document Atomicity Guarantee:**
   - Add comment explaining how `updateInventoryLevelsStep` ensures atomicity
   - Reference Medusa documentation or source code
   - If uncertain, document the risk and mitigation plan

### Alternative Approaches (If Current Implementation Is Not Atomic)

1. **Database-Level Solution:**
   - Use PostgreSQL `UPDATE ... SET stocked_quantity = stocked_quantity - $1` (atomic)
   - Requires bypassing Medusa's abstraction (not recommended per AGENTS.md)

2. **Application-Level Locking:**
   - Use Redis/distributed lock before inventory update
   - Complex and adds latency

3. **Use Medusa's Reservation System:**
   - Story mentions `confirmInventory` or `reserveInventory`
   - Investigate if these provide better atomicity guarantees

---

## Conclusion

**Status:** ⚠️ **UNCERTAIN**

We cannot definitively prove that `updateInventoryLevelsStep` prevents race conditions without:
1. Access to Medusa v2 source code
2. A concurrent test that proves/disproves atomicity
3. Official Medusa documentation on the step's concurrency guarantees

**Risk Level:** **HIGH** if the step is not atomic (overselling possible)

**Next Steps:**
1. Review Medusa v2 source code (GitHub: medusajs/medusa)
2. Add concurrent update test
3. Contact Medusa support/documentation for clarification
4. Consider alternative approaches if current implementation is not atomic

