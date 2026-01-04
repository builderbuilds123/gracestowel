# Complete-Cart Pattern vs. Direct Order Creation

**Date:** 2026-01-04  
**Story:** fix-INV-01-inventory-decrement  
**Purpose:** Explain the difference between Medusa's `complete-cart` pattern and our direct order creation workflow

---

## The Complete-Cart Pattern (Standard Medusa Flow)

### What It Is

The **complete-cart pattern** is Medusa's standard customer checkout workflow. It represents the traditional e-commerce flow:

```
Customer Journey:
1. Add items to cart → Cart created
2. Review cart → Cart updated
3. Select shipping → Cart updated
4. Enter payment info → Cart updated
5. Submit checkout → complete-cart workflow executes
6. Cart converted to Order → Cart completed
```

### How complete-cart Works

**Workflow:** `completeCartWorkflow` (from `@medusajs/medusa/core-flows`)

**Trigger:** Customer-initiated checkout (POST `/store/carts/:id/complete`)

**Flow:**
1. **Acquire lock** on cart ID (prevents concurrent completions)
2. **Validate cart** (items, shipping, payment sessions)
3. **Create order** from cart data
4. **Reserve inventory** (temporary hold via `reserveInventoryStep`)
5. **Authorize payment** (payment session authorization)
6. **Create links** (cart → order, promotions → order)
7. **Release lock**

**Key Characteristics:**
- ✅ Customer-initiated (synchronous request)
- ✅ Payment authorization happens AFTER order creation
- ✅ Uses inventory **reservations** (temporary holds)
- ✅ Reservations released if payment fails
- ✅ Lock key = **cart ID** (one cart completion at a time)

### Inventory Handling in complete-cart

**Step:** `reserveInventoryStep`

**Purpose:** Creates reservation items (temporary inventory holds)

**What happens:**
- Updates `reserved_quantity` (not `stocked_quantity`)
- Inventory is "held" but not decremented
- If payment fails → reservation released
- If payment succeeds → reservation converted to actual decrement (later)

**Why reservations?**
- Payment authorization happens AFTER inventory reservation
- If payment fails, inventory is not lost
- Allows for payment retries without overselling

---

## Our Direct Order Creation (Stripe Webhook Flow)

### What It Is

Our **create-order-from-stripe** workflow creates orders **directly from Stripe webhooks**, bypassing the cart completion flow.

### Why We Do This

**Architecture Decision:** We use Stripe's manual capture mode with webhook-driven order creation.

**Flow:**
```
Customer Journey:
1. Customer submits payment on storefront → Stripe PaymentIntent created
2. Stripe authorizes payment → payment_intent.authorized webhook
3. Our webhook handler → create-order-from-stripe workflow executes
4. Order created directly → No cart completion step
```

**Trigger:** Stripe webhook (`payment_intent.authorized`)

**Key Characteristics:**
- ✅ **Payment already succeeded** (webhook-driven)
- ✅ Order creation happens AFTER payment authorization
- ✅ Uses inventory **decrement** (permanent reduction)
- ✅ No need for reservations (payment already confirmed)
- ❌ No locking mechanism (race condition vulnerability)

### Why Not Use complete-cart?

**Reasons:**

1. **Payment Timing**
   - `complete-cart`: Authorize payment AFTER order creation
   - Our flow: Payment authorized FIRST, THEN create order
   - Stripe webhooks fire when payment succeeds (not when cart is created)

2. **Architecture Pattern**
   - `complete-cart`: Synchronous customer checkout
   - Our flow: Asynchronous webhook processing
   - We're creating orders from external payment events, not customer actions

3. **Inventory Semantics**
   - `complete-cart`: Uses reservations (temporary holds)
   - Our flow: Payment already succeeded → permanent decrement needed
   - No need to hold inventory if payment is already confirmed

4. **Integration Requirements**
   - `complete-cart`: Designed for Medusa's native payment flow
   - Our flow: Designed for Stripe webhook integration
   - We need to create orders from Stripe events, not Medusa cart completions

### When Our Workflow Runs

**Source:** `apps/backend/src/loaders/stripe-event-worker.ts`

```typescript
async function handlePaymentIntentAuthorized(
  paymentIntent: Stripe.PaymentIntent,
  container: MedusaContainer
): Promise<void> {
  // Check if order already exists (idempotency)
  const existingOrder = await findOrderByPaymentIntentId(paymentIntent.id, container);
  if (existingOrder) {
    return; // Already processed
  }

  // Create order directly from PaymentIntent
  await createOrderFromPaymentIntent(paymentIntent, container);
}
```

**Key Point:** This is called by a Stripe webhook, not by a customer checkout request.

---

## Key Differences Summary

| Aspect | complete-cart | create-order-from-stripe |
|--------|--------------|-------------------------|
| **Trigger** | Customer checkout (POST `/store/carts/:id/complete`) | Stripe webhook (`payment_intent.authorized`) |
| **Payment Timing** | Authorize payment AFTER order creation | Payment already authorized (webhook received) |
| **Inventory Strategy** | Reservations (temporary holds) | Direct decrement (permanent reduction) |
| **Lock Key** | Cart ID | ❌ None (needs PaymentIntent ID) |
| **Locking Status** | ✅ Uses `acquireLockStep` / `releaseLockStep` | ❌ Missing locks |
| **Use Case** | Standard customer checkout | Webhook-driven order creation |
| **Payment State** | Payment pending authorization | Payment already authorized |

---

## Why This Matters for Our Race Condition

### complete-cart Protection

The `complete-cart` workflow is protected from race conditions because:
1. ✅ Locks on cart ID (only one completion per cart)
2. ✅ Customer-initiated (one checkout attempt at a time)
3. ✅ Reservations allow for payment retries

### Our Workflow Vulnerability

Our workflow has race conditions because:
1. ❌ **No locks** (multiple webhooks can process same payment)
2. ❌ Webhook-driven (Stripe can send duplicate/retry webhooks)
3. ❌ Direct inventory decrement (no reservation safety net)

**Race Condition Scenario:**
- Stripe sends duplicate `payment_intent.authorized` webhook
- Two workers process webhook concurrently
- Both create orders → inventory decremented twice → **OVERSOLD**

---

## The Solution: Add Locks to Our Workflow

Even though we're not using `complete-cart`, we should still use workflow-level locking.

**Recommended Lock Key:** `paymentIntentId` (unique per payment)

**Why paymentIntentId?**
- Stripe PaymentIntents are unique per payment attempt
- Prevents duplicate order creation from duplicate webhooks
- Aligns with idempotency requirements
- Matches our workflow's primary identifier

**Implementation:**
```typescript
export const createOrderFromStripeWorkflow = createWorkflow(
  "create-order-from-stripe",
  (input: CreateOrderFromStripeInput) => {
    // Acquire lock on payment intent ID
    acquireLockStep({
      key: input.paymentIntentId,  // ← Unique per payment
      timeout: 30,
      ttl: 120,
    })

    // ... workflow steps ...

    releaseLockStep({
      key: input.paymentIntentId,
    })

    return new WorkflowResponse(result)
  }
)
```

**This prevents:**
- ✅ Duplicate webhook processing
- ✅ Concurrent order creation for same payment
- ✅ Race conditions in inventory decrement

---

## Why Not Use complete-cart Instead?

**Question:** Could we refactor to use `complete-cart` instead of creating orders directly?

**Answer:** Not easily, because:

1. **Payment Flow Mismatch**
   - `complete-cart` expects payment authorization to happen AFTER order creation
   - Our flow: Payment authorized FIRST (by Stripe), THEN order created (by webhook)
   - Reversing this would require major architecture changes

2. **Webhook Integration**
   - `complete-cart` is designed for synchronous customer requests
   - Our flow is asynchronous webhook processing
   - Would need to store cart state and trigger completion from webhook (complex)

3. **Inventory Semantics**
   - `complete-cart` uses reservations (payment pending)
   - Our flow: Payment already confirmed → direct decrement needed
   - Using reservations when payment is already confirmed would be incorrect

**Conclusion:** Our direct order creation pattern is appropriate for our architecture, but we need to add locking to prevent race conditions.

---

## Summary

**Complete-Cart Pattern:**
- Standard Medusa checkout flow
- Customer-initiated, synchronous
- Uses inventory reservations
- Protected by locks on cart ID
- Payment authorization happens AFTER order creation

**Our Direct Order Creation:**
- Webhook-driven order creation
- Asynchronous, Stripe-initiated
- Uses direct inventory decrement
- ❌ Missing locks (race condition vulnerability)
- Payment authorization happens BEFORE order creation

**The Fix:**
- Add workflow-level locking using `acquireLockStep` / `releaseLockStep`
- Lock key = `paymentIntentId` (unique per payment)
- Prevents concurrent order creation from duplicate webhooks

