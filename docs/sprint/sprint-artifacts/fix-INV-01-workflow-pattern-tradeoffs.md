# Complete-Cart vs. Direct Order Creation: Tradeoff Analysis

**Date:** 2026-01-04  
**Story:** fix-INV-01-inventory-decrement  
**Purpose:** Deep analysis of workflow patterns considering Grace's Towel's architecture and features

---

## Executive Summary

**Current Architecture:** Direct order creation from Stripe webhooks with manual capture mode  
**Key Feature:** 1-hour order modification window with Stripe `increment_authorization`  
**Recommendation:** ✅ **Keep current pattern** but add workflow-level locking

**Rationale:** The direct order creation pattern aligns better with manual capture mode and order modifications, despite requiring custom locking implementation.

---

## Architecture Context: Grace's Towel System

### Key Features

1. **1-Hour Modification Window**
   - Orders can be modified after creation (add items, edit items, change address, cancel)
   - Modification token system (JWT tokens, 1-hour expiration)
   - Stripe `increment_authorization` for amount increases
   - Payment capture delayed until after modification window

2. **Manual Capture Mode**
   - Stripe PaymentIntent: `capture_method: manual`
   - Payment authorized first, then order created
   - Capture happens after 1-hour grace period (fallback job)

3. **Order Lifecycle**
   ```
   Payment Authorized (Stripe webhook)
   → Order Created (pending status)
   → 1-Hour Modification Window
   → Payment Captured (after window expires)
   ```

4. **Payment Flow**
   - Customer submits payment → PaymentIntent authorized
   - Stripe sends `payment_intent.authorized` webhook
   - Order created from webhook
   - Customer can modify order (increase/decrease items, cancel)
   - After 1 hour → payment automatically captured

---

## Pattern 1: Complete-Cart (Standard Medusa)

### How It Works

```
Customer Checkout Flow:
1. Customer adds items to cart
2. Customer completes checkout → complete-cart workflow
3. Order created
4. Inventory reserved (temporary hold)
5. Payment authorization attempted
6. If payment succeeds → reservation converted to decrement
7. If payment fails → reservation released
```

### Key Characteristics

- **Trigger:** Customer-initiated checkout (synchronous)
- **Payment Timing:** Authorization AFTER order creation
- **Inventory:** Reservations (temporary holds via `reserveInventoryStep`)
- **Locking:** ✅ Built-in (locks on cart ID)
- **Order State:** Order exists before payment authorization

---

## Pattern 2: Direct Order Creation (Current Implementation)

### How It Works

```
Stripe Webhook Flow:
1. Customer submits payment on storefront
2. PaymentIntent authorized by Stripe
3. Stripe sends payment_intent.authorized webhook
4. Order created from webhook (create-order-from-stripe workflow)
5. Inventory directly decremented (permanent)
6. Modification window opens (1 hour)
7. After 1 hour → payment captured
```

### Key Characteristics

- **Trigger:** Stripe webhook (asynchronous)
- **Payment Timing:** Authorization BEFORE order creation
- **Inventory:** Direct decrement (permanent via `updateInventoryLevelsStep`)
- **Locking:** ❌ Missing (needs to be added)
- **Order State:** Payment authorized before order exists

---

## Detailed Tradeoff Analysis

### 1. Payment Authorization Timing

| Aspect | Complete-Cart | Direct Order Creation |
|--------|---------------|----------------------|
| **Authorization Timing** | After order creation | Before order creation |
| **Payment State at Order Creation** | Not yet authorized | Already authorized |
| **Failure Handling** | Payment failure → cancel order, release inventory | Payment already succeeded → no failure case |
| **Modification Window Support** | ❌ Difficult (order exists before payment) | ✅ Natural fit (payment authorized, order created) |

**Winner:** ✅ **Direct Order Creation**

**Rationale:**
- Manual capture mode requires payment authorization FIRST
- Order modification window needs payment to be authorized (for `increment_authorization`)
- complete-cart pattern authorizes payment AFTER order creation, making modifications difficult

---

### 2. Inventory Management

| Aspect | Complete-Cart | Direct Order Creation |
|--------|---------------|----------------------|
| **Inventory Strategy** | Reservations (temporary holds) | Direct decrement (permanent) |
| **Payment Failure** | ✅ Reservations released automatically | ⚠️ Requires cancellation workflow |
| **Payment Success** | Reservation → Decrement conversion | ✅ Already decremented |
| **Modification Window** | ⚠️ Reservations complicate modifications | ✅ Direct decrement simpler for modifications |
| **Cancellation** | Release reservations | Restock (reverse decrement) |
| **Stock Availability** | Reserved stock unavailable | Decremented stock unavailable |

**Winner:** ⚠️ **Tie** (different tradeoffs)

**Complete-Cart Pros:**
- Automatic reservation release on payment failure
- Better for payment retry scenarios
- Stock not decremented until payment succeeds

**Complete-Cart Cons:**
- Reservations complicate order modifications
- Need to convert reservations to decrements after payment
- More complex inventory state management

**Direct Order Creation Pros:**
- Simpler for order modifications (direct decrement/increment)
- No reservation conversion complexity
- Aligns with "payment already authorized" state

**Direct Order Creation Cons:**
- Requires cancellation workflow to restock
- Payment failure handling more complex (need to void payment)
- Inventory decremented before payment capture

**Analysis for Grace's Towel:**
- ✅ Payment already authorized (manual capture mode)
- ✅ Modification window needs simple inventory adjustments
- ✅ Cancellation workflow already implemented
- **Winner:** ✅ **Direct Order Creation** (better fit for their use case)

---

### 3. Order Modification Support

| Aspect | Complete-Cart | Direct Order Creation |
|--------|---------------|----------------------|
| **Modification Window** | ⚠️ Complex (reservations + payment state) | ✅ Natural (payment authorized, order exists) |
| **Add Items** | Need to create new reservations | Direct decrement (simple) |
| **Remove Items** | Release reservations | Restock (reverse decrement) |
| **Stripe Integration** | ⚠️ Authorization happens after order | ✅ Authorization already done (`increment_authorization` available) |
| **Amount Changes** | ⚠️ Complex (need to re-authorize) | ✅ Simple (`increment_authorization` for increases) |

**Winner:** ✅ **Direct Order Creation**

**Rationale:**
- Modification window requires payment to be authorized (for `increment_authorization`)
- complete-cart authorizes payment AFTER order creation, making modifications awkward
- Direct order creation has payment authorized, making modifications straightforward

---

### 4. Locking and Concurrency

| Aspect | Complete-Cart | Direct Order Creation |
|--------|---------------|----------------------|
| **Built-in Locking** | ✅ Yes (`acquireLockStep` / `releaseLockStep`) | ❌ No (needs to be added) |
| **Lock Key** | Cart ID | PaymentIntent ID (needs implementation) |
| **Concurrency Protection** | ✅ Out-of-the-box | ⚠️ Requires custom implementation |
| **Implementation Complexity** | ✅ Standard Medusa pattern | ⚠️ Custom pattern (but straightforward) |

**Winner:** ⚠️ **Complete-Cart** (but fixable)

**Analysis:**
- Complete-cart has locking built-in
- Direct order creation needs locking added (but it's a simple addition)
- Once locking is added, both patterns are equivalent for concurrency protection
- **Verdict:** Complete-cart wins on "ease of implementation", but direct order creation is fixable

---

### 5. Payment Failure Handling

| Aspect | Complete-Cart | Direct Order Creation |
|--------|---------------|----------------------|
| **Payment Failure Scenario** | Authorization fails | Payment already authorized (failure rare) |
| **Order State** | Order exists, payment failed | Payment authorized, order exists |
| **Inventory Handling** | ✅ Reservations auto-released | ⚠️ Requires cancellation workflow |
| **Customer Experience** | Order canceled, no charge | Payment authorized, order exists |
| **Retry Logic** | Can retry payment | Payment already authorized (no retry needed) |

**Winner:** ⚠️ **Complete-Cart** (but less relevant for manual capture)

**Analysis:**
- In manual capture mode, payment authorization happens at checkout (before webhook)
- Payment failures are rare (already authorized by Stripe)
- Complete-cart's reservation release is elegant but less relevant
- Direct order creation requires cancellation workflow, which is already implemented
- **Verdict:** Complete-cart is better for standard flows, but less relevant for manual capture mode

---

### 6. Integration Complexity

| Aspect | Complete-Cart | Direct Order Creation |
|--------|---------------|----------------------|
| **Medusa Integration** | ✅ Native pattern | ⚠️ Custom workflow |
| **Stripe Integration** | ⚠️ Requires payment session setup | ✅ Webhook-driven (simple) |
| **Webhook Handling** | ⚠️ Complex (need to trigger completion) | ✅ Direct webhook → order creation |
| **Frontend Integration** | ✅ Standard checkout flow | ⚠️ Custom checkout → webhook flow |
| **Documentation** | ✅ Well-documented | ⚠️ Custom implementation |

**Winner:** ⚠️ **Tie** (different complexity profiles)

**Complete-Cart:**
- ✅ Native Medusa pattern (well-documented)
- ⚠️ Requires payment session integration
- ⚠️ Webhook handling more complex (need to complete cart from webhook)

**Direct Order Creation:**
- ⚠️ Custom workflow (less documented)
- ✅ Simple webhook integration
- ✅ Aligns with manual capture mode

---

### 7. Order Modification Window (Critical Feature)

| Aspect | Complete-Cart | Direct Order Creation |
|--------|---------------|----------------------|
| **Payment State for Modifications** | Payment not yet authorized | ✅ Payment authorized (`increment_authorization` available) |
| **Inventory Adjustments** | ⚠️ Reservations complicate modifications | ✅ Direct decrement/increment (simple) |
| **Amount Increases** | ⚠️ Need to authorize additional amount | ✅ Stripe `increment_authorization` (designed for this) |
| **Amount Decreases** | Release reservations | Restock (reverse decrement) |
| **Modification Token System** | ⚠️ Need to integrate with cart completion | ✅ Already implemented |

**Winner:** ✅✅✅ **Direct Order Creation** (clear winner)

**Rationale:**
- Modification window requires payment to be AUTHORIZED (for `increment_authorization`)
- complete-cart authorizes payment AFTER order creation
- Direct order creation has payment authorized, making modifications natural
- Stripe's `increment_authorization` API is designed for this exact use case

---

### 8. Race Condition Protection

| Aspect | Complete-Cart | Direct Order Creation |
|--------|---------------|----------------------|
| **Built-in Locking** | ✅ Yes | ❌ No (needs implementation) |
| **Lock Key Strategy** | Cart ID | PaymentIntent ID |
| **Concurrency Safety** | ✅ Out-of-the-box | ⚠️ Requires implementation |
| **Implementation Effort** | ✅ Zero | ⚠️ ~30 lines of code |

**Winner:** ⚠️ **Complete-Cart** (but easily fixable)

**Analysis:**
- Complete-cart has locking built-in (advantage)
- Direct order creation needs locking added (but it's straightforward)
- Both patterns are equivalent once locking is added
- **Verdict:** Complete-cart wins on "zero implementation", but direct order creation is easily fixable

---

## Summary Matrix

| Criteria | Complete-Cart | Direct Order Creation | Winner |
|----------|---------------|----------------------|--------|
| **Payment Authorization Timing** | After order | Before order | ✅ Direct |
| **Inventory Management** | Reservations | Direct decrement | ⚠️ Tie |
| **Order Modification Support** | Complex | Natural | ✅✅✅ Direct |
| **Locking & Concurrency** | Built-in | Needs implementation | ⚠️ Complete-Cart |
| **Payment Failure Handling** | Elegant | Requires cancellation | ⚠️ Complete-Cart |
| **Integration Complexity** | Native pattern | Custom workflow | ⚠️ Tie |
| **Modification Window** | Difficult | Natural fit | ✅✅✅ Direct |
| **Race Condition Protection** | Built-in | Needs implementation | ⚠️ Complete-Cart |

---

## Recommendation: Keep Direct Order Creation + Add Locking

### Rationale

1. **Modification Window is Critical Feature**
   - ✅ Direct order creation is a natural fit (payment authorized, modifications straightforward)
   - ❌ Complete-cart would require significant refactoring to support modifications

2. **Manual Capture Mode Alignment**
   - ✅ Direct order creation aligns with manual capture mode (authorization before order)
   - ⚠️ Complete-cart expects authorization after order (misalignment)

3. **Stripe Integration**
   - ✅ Webhook-driven order creation is simple and reliable
   - ✅ `increment_authorization` API designed for modification window use case

4. **Locking is Fixable**
   - ⚠️ Missing locking is a real issue, but easily fixable (~30 lines of code)
   - ✅ Once locking is added, concurrency protection is equivalent

5. **Existing Implementation**
   - ✅ Modification token system already implemented
   - ✅ Cancellation workflow already implemented
   - ✅ Order modification workflows already implemented
   - ⚠️ Refactoring to complete-cart would require significant changes

### Required Fix

**Add workflow-level locking to `create-order-from-stripe` workflow:**

```typescript
import { acquireLockStep, releaseLockStep } from "@medusajs/medusa/core-flows"

export const createOrderFromStripeWorkflow = createWorkflow(
  "create-order-from-stripe",
  (input: CreateOrderFromStripeInput) => {
    // Acquire lock on payment intent ID
    acquireLockStep({
      key: input.paymentIntentId,  // Unique per payment
      timeout: 30,  // Wait up to 30 seconds
      ttl: 120,  // Lock expires after 2 minutes
    })

    // ... existing workflow steps ...

    // Release lock
    releaseLockStep({
      key: input.paymentIntentId,
    })

    return new WorkflowResponse(result)
  }
)
```

**Implementation Effort:** ~30 lines of code  
**Risk:** Low (standard Medusa pattern, just applied to our workflow)  
**Benefit:** Eliminates race condition vulnerability

---

## Alternative: Hybrid Approach (Not Recommended)

**Could we use complete-cart with modifications?**

**Approach:**
1. Complete cart from webhook (store cart ID in PaymentIntent metadata)
2. Modify complete-cart to work with webhooks
3. Handle modifications via cart updates

**Problems:**
1. ❌ Payment already authorized (complete-cart expects to authorize)
2. ❌ Modification window requires payment authorized state
3. ❌ Significant refactoring required
4. ❌ Loses simplicity of webhook-driven flow

**Verdict:** ❌ Not recommended (high complexity, low benefit)

---

## Conclusion

**Recommendation:** ✅ **Keep Direct Order Creation Pattern + Add Locking**

**Key Reasons:**
1. ✅ Modification window is a critical feature (direct order creation is natural fit)
2. ✅ Manual capture mode alignment (authorization before order)
3. ✅ Stripe integration simplicity (webhook-driven, `increment_authorization` API)
4. ✅ Existing implementation (modification tokens, cancellation workflow)
5. ✅ Locking fix is straightforward (~30 lines of code)

**Tradeoffs Accepted:**
- ⚠️ Custom workflow pattern (but well-designed)
- ⚠️ Requires cancellation workflow (but already implemented)
- ⚠️ Needs locking implementation (but straightforward)

**Next Steps:**
1. Add `acquireLockStep` / `releaseLockStep` to `create-order-from-stripe` workflow
2. Lock key = `paymentIntentId` (unique per payment)
3. Test concurrent webhook scenarios
4. Document locking strategy

---

## References

- Medusa Locking Documentation: https://docs.medusajs.com/learn/fundamentals/workflows/locks
- Complete-Cart Workflow: `packages/core/core-flows/src/cart/workflows/complete-cart.ts`
- Current Implementation: `apps/backend/src/workflows/create-order-from-stripe.ts`
- Order Modification Features: `apps/backend/src/workflows/add-item-to-order.ts`
- Cancellation Workflow: `apps/backend/src/workflows/cancel-order-with-refund.ts`

