# Order Modification Workflow with Payment Collections

## Overview

This document outlines how order modification workflows should work with Medusa v2 Payment Collections. Currently, modifications store changes in order metadata and interact with Stripe directly. When Payment Collections are properly implemented, modifications must also update Payment Collection amounts and statuses.

## Current Architecture (Metadata-Based)

### Existing Modification Operations

1. **Add Item** (`add-item-to-order.ts`)
2. **Update Quantity** (`update-line-item-quantity.ts`)
3. **Remove Item** (handled via quantity update to 0)
4. **Update Address** (`api/store/orders/[id]/address/route.ts`)
5. **Cancel Order** (`cancel-order-with-refund.ts`)

### Current Flow (Metadata-Based)

```
┌─────────────────────────────────────────────────────────────┐
│ Order Modification Workflow (Current - Metadata-Based)      │
└─────────────────────────────────────────────────────────────┘

1. VALIDATE
   ├─ Token validation (modification token)
   ├─ Order status = "pending"
   ├─ Payment Intent status = "requires_capture"
   └─ Grace period active (< 1 hour)

2. CALCULATE NEW TOTALS
   ├─ Fetch current order total
   ├─ Calculate item price (with tax)
   ├─ Compute new order total
   └─ Calculate difference (new - old)

3. UPDATE STRIPE (if adding items)
   ├─ If difference > 0: increment_authorization()
   └─ If difference <= 0: skip (will partial capture)

4. UPDATE ORDER METADATA
   ├─ Store updated_total in metadata
   ├─ Store added_items[] or updated quantities
   └─ Store last_modified timestamp

5. RESPONSE
   └─ Return updated order with new total
```

## Proposed Architecture (Payment Collection-Based)

### With Payment Collections

```
┌─────────────────────────────────────────────────────────────┐
│ Order Modification Workflow (Proposed - Payment Collection) │
└─────────────────────────────────────────────────────────────┘

1. VALIDATE
   ├─ Token validation (modification token)
   ├─ Order status = "pending"
   ├─ Payment Collection status = "authorized"
   ├─ Payment Collection edit_status != "locked_for_capture"
   └─ Grace period active (< 1 hour)

2. CALCULATE NEW TOTALS
   ├─ Fetch current order total
   ├─ Calculate item price (with tax)
   ├─ Compute new order total
   └─ Calculate difference (new - old)

3. UPDATE STRIPE (if adding items)
   ├─ If difference > 0: increment_authorization()
   └─ If difference <= 0: skip (will partial capture)

4. UPDATE ORDER
   ├─ Update order metadata (backward compatibility)
   │  ├─ updated_total
   │  ├─ added_items[] / updated quantities
   │  └─ last_modified timestamp
   └─ Update order line items (if supported)

5. UPDATE PAYMENT COLLECTION ⭐ NEW
   ├─ Fetch Payment Collection for order
   ├─ Update Payment Collection amount
   ├─ Update Payment.amount in payment collection
   ├─ Update Payment.data with new Stripe PI amount
   └─ Keep status = "authorized" (still not captured)

6. RESPONSE
   └─ Return updated order with new total
```

## Detailed Workflow Steps

### 1. Add Item to Order

**Current Implementation**: `add-item-to-order.ts`

**With Payment Collections**:

```typescript
// Step 1: Validation
const validateModificationStep = createStep(
  "validate-modification",
  async (input, { container }) => {
    // Validate token, order status, grace period
    // Check Payment Collection status = "authorized"
    // Check edit_status != "locked_for_capture"
  }
);

// Step 2: Calculate Totals
const calculateTotalsStep = createStep(
  "calculate-totals",
  async (input, { container }) => {
    // Calculate new order total
    // Return: { newTotal, difference, itemTotal }
  }
);

// Step 3: Increment Stripe Authorization
const incrementStripeAuthStep = createStep(
  "increment-stripe-auth",
  async (input, { container }) => {
    // Call stripe.paymentIntents.incrementAuthorization()
    // Only if difference > 0
  }
);

// Step 4: Update Order Metadata
const updateOrderMetadataStep = createStep(
  "update-order-metadata",
  async (input, { container }) => {
    const orderService = container.resolve("order");
    await orderService.updateOrders([{
      id: input.orderId,
      metadata: {
        ...currentMetadata,
        updated_total: input.newTotal,
        added_items: JSON.stringify([...existingAddedItems, newItem]),
        last_modified: new Date().toISOString(),
      }
    }]);
  }
);

// Step 5: Update Payment Collection ⭐ NEW
const updatePaymentCollectionStep = createStep(
  "update-payment-collection",
  async (input, { container }) => {
    const { Modules } = await import("@medusajs/framework/utils");
    const paymentCollectionService = container.resolve(Modules.PAYMENT);
    
    // Find payment collection for order
    const query = container.resolve("query");
    const { data: orders } = await query.graph({
      entity: "order",
      fields: ["id", "payment_collections.id", "payment_collections.payments.id"],
      filters: { id: input.orderId },
    });
    
    const paymentCollectionId = orders[0].payment_collections[0].id;
    const paymentId = orders[0].payment_collections[0].payments[0].id;
    
    // Update payment collection amount
    await paymentCollectionService.updatePaymentCollections([{
      id: paymentCollectionId,
      amount: input.newTotal, // New total in cents
      payments: [{
        id: paymentId,
        amount: input.newTotal,
        data: {
          ...existingPaymentData,
          amount: input.newTotal, // Updated Stripe PI amount
          amount_capturable: input.newTotal,
        }
      }]
    }]);
  }
);
```

### 2. Update Line Item Quantity

**Current Implementation**: `update-line-item-quantity.ts`

**With Payment Collections**: Similar to Add Item, but:
- May decrease total (quantity reduced)
- No Stripe increment needed if total decreases
- Payment Collection amount decreases
- Capture will be partial (less than authorized)

```typescript
// If new total < old total:
// - Skip Stripe increment
// - Update Payment Collection amount to new total
// - Capture worker will partial capture
// - Stripe releases uncaptured amount
```

### 3. Remove Item (Quantity → 0)

**Implementation**: Same as Update Quantity with quantity = 0

**Flow**:
1. Validate modification allowed
2. Calculate new total (reduced)
3. **Skip Stripe update** (no increment needed)
4. Update order metadata with `removed_items[]`
5. Update Payment Collection amount
6. Capture worker handles partial capture

### 4. Cancel Order

**Current Implementation**: `cancel-order-with-refund.ts`

**With Payment Collections**:

```typescript
const cancelOrderWorkflow = createWorkflow(
  "cancel-order-with-refund",
  (input) => {
    // Step 1: Validate & Lock
    const validation = validateCancelStep(input);
    
    // Step 2: Remove Capture Job
    const queueStop = removeCaptureJobStep(input);
    
    // Step 3: Cancel Order
    const cancelOrder = cancelMedusaOrderStep(input);
    
    // Step 4: Update Payment Collection ⭐ NEW
    const updatePaymentCollection = updatePaymentCollectionOnCancelStep(input);
    // Status → "canceled" or remove payment collection?
    
    // Step 5: Void Stripe Payment
    const voidPayment = voidStripePaymentStep(input);
    
    // Step 6: Restock Inventory
    const restock = restockInventoryStep(input);
    
    return { orderId: input.orderId, status: "canceled" };
  }
);

const updatePaymentCollectionOnCancelStep = createStep(
  "update-payment-collection-cancel",
  async (input, { container }) => {
    const { Modules } = await import("@medusajs/framework/utils");
    const paymentCollectionService = container.resolve(Modules.PAYMENT);
    
    // Find and update payment collection
    // Option A: Set status to "canceled" (if supported)
    // Option B: Remove payment collection (may not be supported)
    // Option C: Update payment status in payment.data
    
    // Recommended: Update payment.data.status = "canceled"
    // Keep collection but mark as canceled
  }
);
```

### 5. Update Shipping Address

**Current Implementation**: `api/store/orders/[id]/address/route.ts`

**With Payment Collections**: No payment amount changes, so:
- ✅ Update order shipping_address
- ✅ No Payment Collection update needed
- ✅ No Stripe update needed

## Payment Collection Status Flow

### Status Transitions

```
Order Creation:
  Payment Collection: status = "authorized"
  Payment.data.status = "requires_capture"

During Modification (Add Item):
  Payment Collection: status = "authorized" (unchanged)
  Payment.amount: updated to new total
  Payment.data.amount: updated to new total

During Modification (Remove Item):
  Payment Collection: status = "authorized" (unchanged)
  Payment.amount: updated to new (lower) total
  Payment.data.amount: updated to new total

After Capture:
  Payment Collection: status = "captured"
  Payment.data.status = "succeeded"
  Payment.data.amount_received: set to captured amount

On Cancel:
  Payment Collection: status = "canceled" (if supported)
  OR Payment.data.status = "canceled"
```

## Race Condition Handling

### Current: Edit Status Locking

Already implemented in `payment-capture-worker.ts`:
- Sets `metadata.edit_status = "locked_for_capture"` before capture
- Prevents modifications during capture

### With Payment Collections

**Option 1**: Continue using metadata edit_status
```typescript
// Check before modification
if (order.metadata?.edit_status === "locked_for_capture") {
  throw new Error("Order is being captured, modifications not allowed");
}
```

**Option 2**: Use Payment Collection status
```typescript
// Check payment collection
if (paymentCollection.status === "captured") {
  throw new Error("Payment already captured, modifications not allowed");
}
```

**Recommended**: Use both - metadata for quick checks, Payment Collection for source of truth.

## Capture Worker Integration

### Current: Reads metadata.updated_total

```typescript
// payment-capture-worker.ts
const orderData = await fetchOrderTotal(orderId);
// Reads metadata.updated_total if present, else order.total
```

### With Payment Collections: Read from Payment Collection

```typescript
const fetchOrderTotalForCapture = async (orderId: string) => {
  const query = container.resolve("query");
  const { data: orders } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "total",
      "metadata.updated_total",
      "payment_collections.amount", // ⭐ Source of truth
      "payment_collections.payments.amount",
    ],
    filters: { id: orderId },
  });
  
  const order = orders[0];
  
  // Priority order:
  // 1. Payment Collection amount (most accurate)
  // 2. metadata.updated_total (modification record)
  // 3. order.total (fallback)
  
  const total = 
    order.payment_collections?.[0]?.amount ||
    order.metadata?.updated_total ||
    order.total;
    
  return total;
};
```

## Implementation Checklist

### Phase 1: Create Payment Collections

- [ ] Modify `create-order-from-stripe.ts` to create Payment Collection
- [ ] Link Payment Collection to order
- [ ] Store Stripe PaymentIntent ID in Payment.data
- [ ] Set initial status = "authorized"

### Phase 2: Update Modification Workflows

- [ ] Update `add-item-to-order.ts` to update Payment Collection
- [ ] Update `update-line-item-quantity.ts` to update Payment Collection
- [ ] Update `cancel-order-with-refund.ts` to update Payment Collection
- [ ] Keep metadata updates for backward compatibility

### Phase 3: Update Capture Worker

- [ ] Modify `fetchOrderTotal()` to read from Payment Collection
- [ ] Update `updateOrderAfterCapture()` to update Payment Collection status
- [ ] Set Payment Collection status = "captured" on capture

### Phase 4: Testing & Validation

- [ ] Test add item with Payment Collections
- [ ] Test remove item (partial capture)
- [ ] Test cancel order
- [ ] Verify Payment Collection status transitions
- [ ] Verify Admin dashboard shows correct status

## Migration Strategy

### For Existing Orders

Existing orders without Payment Collections need:
1. **Backward compatibility**: Continue using metadata
2. **Migration script**: Create Payment Collections for existing orders
3. **Dual read**: Check both metadata and Payment Collection

```typescript
// Migration approach
const getPaymentStatus = (order: any) => {
  // New orders: Use Payment Collection
  if (order.payment_collections?.[0]?.status) {
    return order.payment_collections[0].status;
  }
  
  // Legacy orders: Use metadata
  if (order.metadata?.payment_status) {
    return order.metadata.payment_status;
  }
  
  return "unknown";
};
```

## Key Differences: Current vs Proposed

| Aspect | Current (Metadata) | Proposed (Payment Collection) |
|--------|-------------------|-------------------------------|
| **Payment Status** | `metadata.payment_status` | `payment_collections[0].status` |
| **Amount Tracked** | `metadata.updated_total` | `payment_collections[0].amount` |
| **Capture Amount** | Read from metadata or order.total | Read from Payment Collection |
| **Admin Visibility** | Limited (metadata not always shown) | Full visibility in Admin |
| **Modification Update** | Update metadata only | Update Payment Collection + metadata |
| **Status Source** | Custom metadata field | Medusa-native Payment Collection |

## Benefits of Payment Collection Approach

1. ✅ **Medusa Native**: Uses Medusa's payment tracking system
2. ✅ **Admin Dashboard**: Payment status visible in Medusa Admin
3. ✅ **Consistency**: Single source of truth for payment state
4. ✅ **Extensibility**: Supports multiple payment providers
5. ✅ **Audit Trail**: Payment Collection maintains history
6. ✅ **Refunds**: Easier to handle refunds through Payment Collections

## Open Questions

1. **Payment Collection Creation**: When exactly should it be created?
   - During order creation workflow?
   - Via separate step after order creation?

2. **Multiple Payments**: How to handle if order has multiple payment methods?
   - Single Payment Collection with multiple Payments?
   - Multiple Payment Collections?

3. **Status Values**: What are the exact Payment Collection status values in Medusa v2?
   - Need to verify: "authorized", "captured", "canceled", etc.

4. **Capture API**: Should we use Medusa's payment capture API or Stripe directly?
   - Stripe SDK (current): Direct control, immediate
   - Medusa API: More abstraction, but integrates better

5. **Backward Compatibility**: How long to support metadata-based approach?
   - Migration period needed
   - Dual read/write for transition
