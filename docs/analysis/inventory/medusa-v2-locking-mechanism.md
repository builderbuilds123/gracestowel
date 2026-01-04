# Medusa v2 Locking Module Investigation

**Date:** 2026-01-04  
**Story:** fix-INV-01-inventory-decrement  
**Purpose:** Understand how Medusa v2 handles concurrent inventory updates in production

---

## Executive Summary

**Key Finding:** ✅ Medusa v2 provides a **Locking Module** specifically designed to prevent race conditions in workflows. The official `complete-cart` workflow uses locks to prevent concurrent inventory updates.

**Our Implementation Status:** ❌ Our `create-order-from-stripe` workflow **does NOT use locks**, which explains the race condition vulnerability.

---

## Medusa v2's Official Solution: Locking Module

### Documentation

**Source:** https://docs.medusajs.com/learn/fundamentals/workflows/locks

**Key Points:**
- Medusa provides `acquireLockStep` and `releaseLockStep` for workflow-level locking
- Locks prevent multiple processes from modifying the same resource simultaneously
- Used specifically to prevent commerce risks like overselling and double charging
- Locking Module uses underlying provider (e.g., Redis) for distributed locking

### Complete-Cart Workflow Pattern

**Source:** `packages/core/core-flows/src/cart/workflows/complete-cart.ts`

The official `complete-cart` workflow uses the following pattern:

```typescript
export const completeCartWorkflow = createWorkflow(
  "complete-cart",
  (input: CompleteCartWorkflowInput) => {
    // 1. ACQUIRE LOCK on cart ID
    acquireLockStep({
      key: input.id,  // ← Cart ID as lock key
      timeout: THIRTY_SECONDS,  // Wait up to 30s to acquire lock
      ttl: TWO_MINUTES,  // Lock expires after 2 minutes
    })

    // 2. ... workflow steps including inventory reservation ...
    reserveInventoryStep(formatedInventoryItems)

    // 3. RELEASE LOCK
    releaseLockStep({
      key: input.id,
    })

    return new WorkflowResponse(result)
  }
)
```

**Key Observations:**
1. ✅ Uses `acquireLockStep` at the beginning
2. ✅ Uses `reserveInventoryStep` (not `updateInventoryLevelsStep` directly)
3. ✅ Uses `releaseLockStep` at the end
4. ✅ Lock key = cart ID (prevents concurrent cart completions)
5. ✅ Lock automatically released on error (compensation function)

### Locking Mechanism Details

**From Documentation:**
- `acquireLockStep` waits until lock is acquired (or timeout)
- If timeout occurs, step throws error and workflow fails
- Lock automatically released via compensation if workflow fails
- Lock key should be unique per resource (e.g., cart ID, order ID)

---

## Our Current Implementation

### create-order-from-stripe Workflow

**Location:** `apps/backend/src/workflows/create-order-from-stripe.ts`

**Current Pattern:**
```typescript
export const createOrderFromStripeWorkflow = createWorkflow(
  "create-order-from-stripe",
  (input: CreateOrderFromStripeInput) => {
    // ❌ NO LOCK ACQUIRED
    const orderData = prepareOrderDataStep(input);
    const order = createOrdersWorkflow.runAsStep({ input: orderData });
    
    // ❌ Direct inventory update WITHOUT locks
    const inventoryResult = decrementInventoryStep(inventoryInput);
    
    // ... rest of workflow ...
    
    // ❌ NO LOCK RELEASED
    return new WorkflowResponse(result)
  }
)
```

**Problems:**
1. ❌ **No locking mechanism** - workflow can execute concurrently
2. ❌ Uses `updateInventoryLevelsStep` directly (via `decrementInventoryStep`)
3. ❌ No protection against concurrent order creation for same payment/cart

---

## Race Condition Analysis: With vs. Without Locks

### Scenario: Two Concurrent Stripe Webhooks

**Without Locks (Current Implementation):**
1. Webhook A: Starts workflow, reads stock = 5
2. Webhook B: Starts workflow, reads stock = 5 (concurrently)
3. Webhook A: Calculates newStock = 3, updates inventory
4. Webhook B: Calculates newStock = 3, updates inventory
5. **Result:** Stock = 3 (should be 1) → **OVERSOLD!**

**With Locks (Medusa Pattern):**
1. Webhook A: Acquires lock (key = paymentIntentId or cartId)
2. Webhook B: Tries to acquire lock → **WAITS** or **TIMES OUT**
3. Webhook A: Reads stock = 5, calculates newStock = 3, updates inventory, releases lock
4. Webhook B: Acquires lock (after A releases), reads stock = 3, calculates newStock = 1, updates inventory
5. **Result:** Stock = 1 ✅ **CORRECT!**

---

## Recommended Solution

### Option 1: Lock by Payment Intent ID (Recommended)

**Rationale:**
- Stripe payment intents are unique per payment attempt
- Prevents duplicate order creation from same payment
- Aligns with idempotency requirements

**Implementation:**
```typescript
export const createOrderFromStripeWorkflow = createWorkflow(
  "create-order-from-stripe",
  (input: CreateOrderFromStripeInput) => {
    // Acquire lock on payment intent ID
    acquireLockStep({
      key: input.paymentIntentId,  // ← Unique per payment
      timeout: 30,  // Wait up to 30 seconds
      ttl: 120,  // Lock expires after 2 minutes (safety)
    })

    const orderData = prepareOrderDataStep(input);
    const order = createOrdersWorkflow.runAsStep({ input: orderData });
    const inventoryResult = decrementInventoryStep(inventoryInput);
    
    // ... rest of workflow ...
    
    // Release lock
    releaseLockStep({
      key: input.paymentIntentId,
    })

    return new WorkflowResponse(result)
  }
)
```

### Option 2: Lock by Cart ID (Alternative)

**Rationale:**
- Matches `complete-cart` pattern
- Prevents concurrent order creation from same cart
- However: Our workflow creates orders directly (not from cart completion)

**Consideration:** If cart ID is available, this aligns with Medusa's standard pattern.

---

## Comparison: reserveInventoryStep vs. updateInventoryLevelsStep

### reserveInventoryStep (Used in complete-cart)

- Creates reservation items (temporary holds)
- Updates `reserved_quantity` (not `stocked_quantity`)
- Used during cart completion (before payment capture)
- Reservations released if payment fails

### updateInventoryLevelsStep (Used in our workflow)

- Directly updates `stocked_quantity`
- Used for permanent inventory decrements
- Appropriate for order creation from Stripe (payment already succeeded)

**Conclusion:** Our use of `updateInventoryLevelsStep` is correct for our use case (order creation after payment), but we still need locks to prevent concurrent updates.

---

## Service-Level vs. Workflow-Level Locking

### Service-Level (What we investigated)

- `updateInventoryLevels` uses read-then-write pattern
- **Does NOT prevent concurrent transactions from racing**
- Transactions ensure all-or-nothing, not mutual exclusion

### Workflow-Level (Medusa's Recommended Pattern)

- `acquireLockStep` / `releaseLockStep` provide mutual exclusion
- Prevents multiple workflow instances from executing concurrently
- **This is the correct level for preventing race conditions**

**Key Insight:** The service layer doesn't provide atomicity guarantees for concurrent operations. **The workflow layer must use locks.**

---

## Why Medusa v2 Works in Production

**Question:** If the service has race conditions, how do production sites avoid overselling?

**Answer:** They use workflow-level locking! The `complete-cart` workflow:
1. Acquires lock before inventory operations
2. Only one workflow instance can execute at a time per resource
3. Lock prevents concurrent reads and writes
4. Service-level race condition doesn't matter because locks prevent concurrency

**Our Workflow:** We're missing the locking mechanism, so the service-level race condition is exposed!

---

## Implementation Requirements

### 1. Import Locking Steps

```typescript
import { acquireLockStep, releaseLockStep } from "@medusajs/medusa/core-flows"
```

### 2. Add Lock Configuration

Choose lock key:
- ✅ `input.paymentIntentId` (recommended - unique per payment)
- ⚠️ `input.cartId` (if available, aligns with Medusa pattern)
- ⚠️ Composite key: `${input.paymentIntentId}-${input.cartId}` (more complex)

Choose timeout/TTL:
- `timeout: 30` (wait up to 30 seconds to acquire lock)
- `ttl: 120` (lock expires after 2 minutes - safety mechanism)

### 3. Wrap Critical Operations

Acquire lock:
- At the beginning of workflow
- Before any inventory operations

Release lock:
- At the end of workflow (success path)
- Automatically via compensation (error path)

### 4. Handle Lock Timeout

If lock cannot be acquired:
- `acquireLockStep` throws error
- Workflow fails gracefully
- Stripe webhook retries (idempotent)

---

## References

1. **Medusa Locking Documentation:** https://docs.medusajs.com/learn/fundamentals/workflows/locks
2. **Locking Module Reference:** https://docs.medusajs.com/resources/infrastructure-modules/locking
3. **Complete-Cart Workflow:** `packages/core/core-flows/src/cart/workflows/complete-cart.ts`
4. **Locking Steps API:** https://docs.medusajs.com/api/medusa-workflows/steps/acquireLockStep

---

## Conclusion

**Status:** ✅ **SOLUTION FOUND**

Medusa v2's production-ready solution for concurrent inventory updates is **workflow-level locking** using `acquireLockStep` and `releaseLockStep`. Our workflow is missing this critical mechanism, which explains the race condition vulnerability.

**Next Steps:**
1. Add `acquireLockStep` at workflow start (lock key = `paymentIntentId`)
2. Add `releaseLockStep` at workflow end
3. Test concurrent execution scenarios
4. Verify lock timeout handling

**Note:** The service-level race condition we identified is real, but it doesn't matter in practice because workflows use locks to prevent concurrency at the workflow level.

