# Medusa v2 Payment Status Research

## Problem Statement

Payment status (`payment_status`, `amount_captured`, etc.) is not being updated correctly when Stripe payments are captured. Current implementation only updates order metadata, but Medusa v2 uses Payment Collections to track payment status.

## Key Findings

### 1. Medusa v2 Payment Architecture

**Payment Collections**: In Medusa v2, payments are tracked through **Payment Collections**, not direct order fields.

- Orders have a relationship: `order.payment_collections[]`
- Each Payment Collection contains: `payment_collections.payments[]`
- Each Payment has: `payments.data` (provider-specific data like Stripe PaymentIntent ID)
- Payment status is tracked at the **Payment Collection level**, not just metadata

### 2. Current Implementation Issues

**Order Creation (`create-order-from-stripe.ts`)**:
- ✅ Uses `createOrdersWorkflow` from `@medusajs/core-flows`
- ✅ Stores `stripe_payment_intent_id` in order metadata
- ❌ **Does NOT create a Payment Collection**
- ❌ **Does NOT link payment to the order through Medusa's payment system**

**Order.placed Subscriber (`order-placed.ts`)**:
- Queries for `payment_collections.payments.data` (line 66)
- Falls back to `metadata.stripe_payment_intent_id` (line 89)
- This suggests orders **should** have payment collections, but they're missing

**Payment Capture (`payment-capture-worker.ts`)**:
- ✅ Captures payment via Stripe API directly
- ✅ Updates order metadata: `payment_status: "captured"`, `payment_captured_at`, `payment_amount_captured`
- ❌ **Does NOT update Payment Collection status**
- ❌ **Does NOT use Medusa's payment capture APIs**

### 3. Medusa v2 Payment Module Structure

Based on research and codebase analysis:

```typescript
// Medusa v2 Payment Module Services
- PaymentCollectionService
- PaymentProviderService  
- PaymentSessionService

// Payment Collection Structure
{
  id: "pc_xxx",
  status: "authorized" | "captured" | "partially_captured" | "refunded",
  amount: number,
  currency_code: string,
  order_id: "order_xxx",
  payments: [
    {
      id: "pay_xxx",
      provider_id: "stripe",
      amount: number,
      currency_code: string,
      data: {
        id: "pi_xxx", // Stripe PaymentIntent ID
        status: "requires_capture" | "succeeded",
        // ... other Stripe data
      }
    }
  ]
}
```

### 4. Payment Status Values

According to Medusa v2 documentation:
- `authorized`: Payment authorized but not captured
- `partially_authorized`: Partial authorization
- `captured`: Payment fully captured
- `partially_captured`: Partial capture
- `refunded`: Full refund issued
- `partially_refunded`: Partial refund issued

### 5. Why Current Approach Fails

**Issue**: We're bypassing Medusa's Payment Module entirely.

1. **No Payment Collection Created**: Orders are created without payment collections
2. **Direct Stripe API Calls**: We capture via Stripe SDK, not through Medusa's payment module
3. **Metadata-Only Updates**: We store payment status in `order.metadata.payment_status` instead of updating Payment Collection status
4. **Admin Dashboard Incompatibility**: Medusa Admin expects payment collections to show payment status

### 6. Correct Approach (Medusa v2 Best Practices)

#### Option A: Create Payment Collections During Order Creation

When creating orders from Stripe webhooks:
1. Create Payment Collection linked to order
2. Create Payment record with Stripe PaymentIntent data
3. Set initial status: `authorized` (since we use manual capture)

#### Option B: Update Payment Collection on Capture

When capturing payments:
1. Find Payment Collection for the order
2. Update Payment record data with captured amount
3. Update Payment Collection status to `captured`
4. Use Medusa's Payment Provider service to sync with Stripe

#### Option C: Hybrid Approach (Recommended)

**During Order Creation**:
- Create order with `createOrdersWorkflow`
- Create Payment Collection and Payment record
- Link payment to order
- Store Stripe PaymentIntent ID in both payment.data and order.metadata (for backward compatibility)

**During Payment Capture**:
- Update Payment Collection status via PaymentCollectionService
- Update Payment record with captured amount
- Also update order metadata (current approach) for backward compatibility

### 7. Required Changes

#### 7.1 Create Payment Collection in Order Workflow

Add to `create-order-from-stripe.ts`:

```typescript
import { Modules } from "@medusajs/framework/utils";

const createPaymentCollectionStep = createStep(
  "create-payment-collection",
  async (input: { orderId: string; paymentIntentId: string; amount: number; currency: string }, { container }) => {
    const paymentCollectionService = container.resolve(Modules.PAYMENT);
    
    // Create payment collection
    const paymentCollection = await paymentCollectionService.createPaymentCollections([
      {
        order_id: input.orderId,
        amount: input.amount,
        currency_code: input.currency.toLowerCase(),
        status: "authorized", // Manual capture mode
        payments: [
          {
            provider_id: "stripe", // Or your Stripe provider ID
            amount: input.amount,
            currency_code: input.currency.toLowerCase(),
            data: {
              id: input.paymentIntentId,
              status: "requires_capture",
            }
          }
        ]
      }
    ]);
    
    return new StepResponse(paymentCollection[0]);
  }
);
```

#### 7.2 Update Payment Collection on Capture

Modify `updateOrderAfterCapture` in `payment-capture-worker.ts`:

```typescript
export async function updateOrderAfterCapture(orderId: string, amountCaptured: number): Promise<void> {
  // ... existing code ...
  
  const orderService = containerRef.resolve("order");
  
  // Update order metadata (current approach)
  await orderService.updateOrders([{
    id: orderId,
    metadata: {
      ...currentMetadata,
      payment_status: "captured",
      payment_captured_at: new Date().toISOString(),
      payment_amount_captured: amountCaptured,
    },
    status: currentStatus !== "completed" ? "completed" : currentStatus,
  }]);
  
  // NEW: Update Payment Collection status
  try {
    const { Modules } = await import("@medusajs/framework/utils");
    const paymentCollectionService = containerRef.resolve(Modules.PAYMENT);
    
    // Find payment collection for this order
    const query = containerRef.resolve("query");
    const { data: orders } = await query.graph({
      entity: "order",
      fields: ["id", "payment_collections.id", "payment_collections.status"],
      filters: { id: orderId },
    });
    
    const order = orders[0];
    if (order?.payment_collections?.length > 0) {
      const paymentCollectionId = order.payment_collections[0].id;
      
      // Update payment collection status
      await paymentCollectionService.updatePaymentCollections([
        {
          id: paymentCollectionId,
          status: "captured",
          // Update payment record within collection
          payments: [
            {
              data: {
                status: "succeeded",
                amount_received: amountCaptured,
              }
            }
          ]
        }
      ]);
      
      console.log(`[PaymentCapture] Updated Payment Collection ${paymentCollectionId} status to captured`);
    }
  } catch (error) {
    console.error(`[PaymentCapture] Error updating Payment Collection:`, error);
    // Don't fail capture if payment collection update fails
  }
}
```

### 8. Verification Steps

After implementing:

1. **Check Order Structure**:
```typescript
const { data: orders } = await query.graph({
  entity: "order",
  fields: [
    "id",
    "payment_collections.id",
    "payment_collections.status",
    "payment_collections.amount",
    "payment_collections.payments.id",
    "payment_collections.payments.data",
    "metadata.payment_status"
  ],
  filters: { id: orderId },
});
```

2. **Verify Payment Collection Status**: Should be `"captured"` after capture
3. **Check Admin Dashboard**: Payment section should show captured status
4. **Backward Compatibility**: Metadata should still have `payment_status: "captured"`

### 9. References

- Medusa v2 Payment Module: https://docs.medusajs.com/resources/commerce-modules/payment
- Payment Collections: https://docs.medusajs.com/resources/commerce-modules/payment/payment-collection
- Current codebase patterns in `order-placed.ts` (lines 66, 80-95)

### 10. Next Steps

1. ✅ Research complete - document findings
2. ⏳ Implement Payment Collection creation in order workflow
3. ⏳ Update Payment Collection status on capture
4. ⏳ Test with actual order creation and capture
5. ⏳ Verify in Medusa Admin dashboard
6. ⏳ Update all payment status queries to use Payment Collections
