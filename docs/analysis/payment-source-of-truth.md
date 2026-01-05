# Payment Source of Truth Analysis

## Research Summary

### Medusa v2 Documentation Findings

**Official Medusa v2 Documentation confirms:**
- **Order.total is the authoritative source of truth** for payment amounts
- Payment providers (like Stripe) should **mirror** the Order.total
- This design ensures payment processing aligns with order financial details
- Maintains consistency and accuracy across the system

**Source:** [Medusa v2 Documentation - Orders & Payments](https://docs.medusajs.com/user-guide/orders/payments)

### Industry Best Practices

1. **Single Source of Truth (SSOT)**
   - Centralized, authoritative source for critical data (order totals)
   - Ensures consistency across systems
   - Reduces discrepancies and errors
   - **Source:** Shopify, industry e-commerce best practices

2. **Payment Provider as Mirror**
   - Payment providers (Stripe, PayPal, etc.) are external systems
   - They should reflect the canonical state, not drive it
   - Payment provider state can be out of sync due to:
     - Network failures
     - Webhook delays
     - Partial failures
     - Retry scenarios

3. **Canonical Payment Record**
   - Medusa's PaymentCollection is the canonical payment record
   - Should always match Order.total
   - Tracks payment state within Medusa's system
   - Links to payment provider state (Stripe PaymentIntent)

## Architecture Recommendation

### Correct Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    SOURCE OF TRUTH                           │
│                                                              │
│              Order.total (Medusa Order)                      │
│                    ↓                                         │
│         PaymentCollection.amount (Medusa Canonical)          │
│                    ↓                                         │
│      Stripe PaymentIntent.amount (Payment Provider Mirror)   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Key Principles

1. **Order.total** = Source of truth (what customer should pay)
2. **PaymentCollection.amount** = Medusa's canonical payment record (must match Order.total)
3. **Stripe PaymentIntent.amount** = Payment provider state (should mirror Order.total)

### Update Flow

When adding items to an order:
1. Calculate new total: `newOrderTotal = Order.total + itemTotal`
2. Update Order.total to new value
3. Update PaymentCollection.amount to match Order.total
4. Update Stripe PaymentIntent.amount to mirror Order.total

## Current Implementation Analysis

### ✅ Correct Implementation: `add-item-to-order.ts`

The `add-item-to-order.ts` workflow correctly implements the architecture:

```typescript
// Uses Order.total as source of truth
currentTotal: orderTotal

// Calculates new total from Order.total
newOrderTotal = currentTotal + itemTotal

// Updates PaymentCollection to match Order.total
amount: data.totals.newOrderTotal

// Updates Stripe to mirror Order.total
newAmount: data.totals.newOrderTotal
```

**Status:** ✅ Correctly implemented

### ⚠️ Potential Issue: `create-order-from-stripe.ts`

In `create-order-from-stripe.ts`, PaymentCollection is created with:

```typescript
amount: data.input.amount  // Uses Stripe PaymentIntent amount
```

**Issue:** This uses the Stripe amount instead of Order.total.

**Recommendation:** After order creation, use Order.total:

```typescript
amount: data.order.total  // Use Order.total as source of truth
```

**Note:** This assumes Order.total is available in the order object returned from `createOrdersWorkflow`. If not, we should:
1. Query the created order to get its total
2. Use that total for PaymentCollection creation
3. Validate that Order.total matches Stripe PaymentIntent amount (with tolerance)

## Validation Strategy

### Mismatch Detection

When Order.total and PaymentIntent.amount are out of sync:

1. **Log Warning** - Detect and log the mismatch
2. **Use Order.total** - Always use Order.total as authoritative source
3. **Update Stripe** - Update PaymentIntent to match Order.total
4. **Alert if Critical** - If mismatch is significant, alert operators

### Tolerance

- **1 cent tolerance** for rounding differences
- **Larger mismatches** should trigger alerts for manual reconciliation

## Recommendations

### Immediate Actions

1. ✅ **Keep current `add-item-to-order.ts` implementation** - It's correct
2. ⚠️ **Review `create-order-from-stripe.ts`** - Consider using Order.total instead of Stripe amount
3. ✅ **Maintain validation logic** - Continue detecting and logging mismatches

### Long-term Improvements

1. **Add reconciliation job** - Periodic job to detect and fix mismatches
2. **Enhanced monitoring** - Alert on significant mismatches
3. **Documentation** - Ensure all developers understand the architecture
4. **Tests** - Add tests for mismatch scenarios

## Conclusion

**Current implementation in `add-item-to-order.ts` is correct** and follows Medusa v2 best practices:

- ✅ Order.total is used as source of truth
- ✅ PaymentCollection.amount matches Order.total
- ✅ Stripe PaymentIntent mirrors Order.total
- ✅ Validation and logging for mismatches

**The architecture aligns with:**
- Medusa v2 official documentation
- Industry best practices (SSOT)
- E-commerce payment management standards

**No changes needed** to `add-item-to-order.ts` workflow.

