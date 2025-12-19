# Payment Collection Side Effects Analysis

**Document Version**: 2.0  
**Last Updated**: 2025-12-12  
**Author**: Architecture Analysis

---

## Executive Summary

This document provides a comprehensive analysis of side effects we should handle when updating Payment Collections in Medusa v2, examines Medusa's event-driven architectural patterns, and provides recommendations for implementing payment collection updates using event-driven architecture.

**Key Findings**:
1. Medusa v2 uses **event-driven architecture** with Redis-based event bus for async communication between modules
2. Payment Collection updates automatically emit `payment-collection.updated` events
3. We should adopt Medusa's event-driven pattern: **Workflow → Update Payment Collection → Emit Event → Subscribers Handle Side Effects**
4. Current implementation mixes inline side effects with event-driven patterns (inconsistent)
5. 12 side effects identified, 7 already implemented, 5 need implementation

---

## Table of Contents

1. [Medusa v2 Event-Driven Architecture](#medusa-v2-event-driven-architecture)
2. [Current System Architecture Analysis](#current-system-architecture-analysis)
3. [Payment Collection Event System](#payment-collection-event-system)
4. [Detailed Side Effects Analysis](#detailed-side-effects-analysis)
5. [Architectural Recommendations](#architectural-recommendations)
6. [Implementation Strategy](#implementation-strategy)

---

## Medusa v2 Event-Driven Architecture

### Core Principles

Medusa v2 follows an **event-driven architecture** pattern for async communication between modules:

```
┌─────────────┐
│  Workflow   │
│   Step 1    │
│   Step 2    │
│   Step 3    │──┐
└─────────────┘  │
                 │ Emit Event
                 ▼
        ┌─────────────────┐
        │  Event Bus      │
        │  (Redis-based)  │
        └─────────────────┘
                 │
        ┌────────┴────────┐
        │                 │
        ▼                 ▼
┌──────────────┐   ┌──────────────┐
│  Subscriber  │   │  Subscriber  │
│  Handler 1   │   │  Handler 2   │
│  (Email)     │   │  (Analytics) │
└──────────────┘   └──────────────┘
```

### Event Bus Configuration

**Location**: `medusa-config.ts:37-42`

```typescript
{
  key: "eventBusService",
  resolve: "@medusajs/event-bus-redis",
  options: {
    redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
  },
}
```

**Characteristics**:
- Redis-backed for durable cross-instance delivery
- Pub/Sub pattern (many-to-many communication)
- Events are distributed to all subscribers
- Asynchronous processing (non-blocking)

### Event Emission Pattern

**Workflow Events** (Business Logic):
- Emitted after successful completion of commerce features
- Example: `order.placed` after order creation
- Used for triggering user-facing side effects (emails, notifications)

**Service Events** (Internal Operations):
- Emitted during internal operations
- Example: `payment-collection.updated` when Payment Collections are modified
- Used for monitoring, debugging, internal sync

### Subscriber Pattern

**Location**: `src/subscribers/`

**Current Subscribers**:
1. `order-placed.ts` - Handles order confirmation emails, capture job scheduling
2. `order-canceled.ts` - Handles cancellation emails, capture job removal
3. `fulfillment-created.ts` - Handles shipping confirmation emails
4. `customer-created.ts` - Handles welcome emails

**Pattern**:
```typescript
export default async function subscriberHandler({
  event: { data },
  container,
}: SubscriberArgs<EventData>) {
  // Handle side effects asynchronously
  // - Don't block main thread
  // - Use workflows for complex logic
  // - Log all operations
}
```

### Best Practices (From Medusa Documentation)

1. **Emit Events in Workflows**: Use `emitEventStep` from `@medusajs/medusa/core-flows`
2. **Events Only After Success**: Events emitted after workflow completes successfully
3. **Subscribers Handle Side Effects**: Don't mix business logic with side effects
4. **Use Workflows in Subscribers**: For complex operations, invoke workflows from subscribers
5. **Async Processing**: Subscribers should be async and non-blocking
6. **Dependency Injection**: Use container to resolve services

---

## Current System Architecture Analysis

### Event Emission Points

**Location**: `workflows/create-order-from-stripe.ts:204-237`

```typescript
const emitEventStep = createStep(
  "emit-event",
  async (input: { eventName: string; data: any }, { container }) => {
    // Try multiple event bus resolution patterns
    let eventBusModuleService: any;
    try {
      eventBusModuleService = container.resolve("eventBusModuleService");
    } catch {
      try {
        eventBusModuleService = container.resolve("eventBus");
      } catch {
        eventBusModuleService = container.resolve(Modules.EVENT_BUS);
      }
    }
    await eventBusModuleService.emit({ name: input.eventName, data: input.data });
  }
);
```

**Emitted Events**:
- `order.placed` - After order creation (line 390-396)

**Location**: `workflows/cancel-order-with-refund.ts:274-278`

```typescript
const emitEventStep = createStep(
  "emit-event",
  async (input: { eventName: string; data: any }, { container }) => {
    const eventBusModuleService = container.resolve("eventBus") as any;
    await eventBusModuleService.emit(input.eventName, input.data);
  }
);
```

**Emitted Events**:
- `order.canceled` - After order cancellation (line 443-450)

### Subscriber Registration

**Location**: `utils/register-subscribers.ts:10-101`

**Pattern**: Manual registration (Medusa v2 doesn't auto-discover project subscribers)

```typescript
export async function registerProjectSubscribers(container: MedusaContainer) {
  const eventBusModuleService = container.resolve(Modules.EVENT_BUS);
  
  // Register each subscriber manually
  eventBusModuleService.subscribe(eventName, async (data: any) => {
    await handler({ event: { name: eventName, data }, container, pluginOptions: {} });
  });
}
```

**Current Registrations**:
- `order.placed` → `orderPlacedHandler`
- `order.canceled` → `orderCanceledHandler`
- `fulfillment.created` → `fulfillmentCreatedHandler`
- `customer.created` → `customerCreatedHandler`

**Missing**: `payment-collection.updated` subscriber

### Mixed Patterns (Inconsistency)

**Current Approach**:
1. **Order Creation**: Workflow emits `order.placed` → Subscriber handles emails, capture scheduling ✅
2. **Order Cancellation**: Workflow emits `order.canceled` → Subscriber handles emails, job removal ✅
3. **Payment Capture**: Worker updates order inline (no event emission) ❌
4. **Order Modification**: Workflows update order inline (no event emission) ❌

**Problem**: Inconsistent pattern - some operations emit events, others don't.

---

## Payment Collection Event System

### Automatic Events

When `PaymentCollectionService.updatePaymentCollections()` is called, Medusa v2 **automatically emits**:

**Event Name**: `payment-collection.updated`

**Event Data Structure**:
```typescript
{
  id: string;              // Payment Collection ID
  status: string;          // authorized | captured | partially_captured | refunded
  amount: number;          // Amount in cents
  currency_code: string;   // Currency code (e.g., "usd")
  // ... other payment collection fields
}
```

**When Emitted**:
- After successful `updatePaymentCollections()` call
- Only if update actually changes data
- After transaction commit (if applicable)

### Subscriber Opportunity

**Current State**: We don't have a subscriber for `payment-collection.updated`

**Impact**: 
- We're missing automatic side effect triggers
- Have to manually handle side effects inline
- Inconsistent with Medusa's architectural pattern

**Example Subscriber**:
```typescript
// src/subscribers/payment-collection-updated.ts
export default async function paymentCollectionUpdatedHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string; status: string; amount: number }>) {
  const logger = container.resolve("logger");
  
  // Side effects:
  // 1. Update order status if payment captured
  // 2. Trigger fulfillment if ready
  // 3. Send analytics events
  // 4. Log audit trail
  // 5. Update external systems
}
```

---

## Detailed Side Effects Analysis

### 🔴 HIGH PRIORITY - Critical Missing Side Effects

#### 1. Payment Collection Updated Event Subscriber

**Issue**: Medusa emits `payment-collection.updated` but we don't subscribe to it.

**Current Behavior**:
- Payment Collections are updated inline in workflows/workers
- Side effects handled inline (if at all)
- No reactive event-driven side effects

**Impact**:
- **Data Consistency**: Risk of Payment Collection and order status getting out of sync
- **Admin Dashboard**: Payment status may not update correctly in UI
- **Architectural Inconsistency**: Not following Medusa's event-driven pattern
- **Scalability**: Hard to add new side effects without modifying existing code

**Required Implementation**:

```typescript
// src/subscribers/payment-collection-updated.ts
import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { logger } from "../utils/logger";
import { getPostHog } from "../utils/posthog";

interface PaymentCollectionUpdatedData {
  id: string;
  status: string;  // authorized | captured | partially_captured | refunded
  amount: number;
  currency_code: string;
  order_id?: string;
}

export default async function paymentCollectionUpdatedHandler({
  event: { data },
  container,
}: SubscriberArgs<PaymentCollectionUpdatedData>) {
  const logContext = { paymentCollectionId: data.id, status: data.status };
  
  logger.info("payment-collection", "Payment collection updated", logContext);

  try {
    // Side Effect 1: Update order status if payment captured
    if (data.status === "captured" && data.order_id) {
      await updateOrderStatusAfterCapture(data.order_id, container);
    }

    // Side Effect 2: Trigger analytics
    await trackPaymentStatusChange(data, container);

    // Side Effect 3: Log audit trail
    await logPaymentCollectionAudit(data, container);

    // Side Effect 4: Check if fulfillment can proceed
    if (data.status === "captured" && data.order_id) {
      await checkFulfillmentReady(data.order_id, container);
    }

    logger.info("payment-collection", "Side effects completed", logContext);
  } catch (error) {
    logger.error(
      "payment-collection",
      "Error handling payment collection update side effects",
      logContext,
      error as Error
    );
    // Don't throw - side effects are non-critical
  }
}

export const config: SubscriberConfig = {
  event: "payment-collection.updated",
};
```

**Registration**: Add to `utils/register-subscribers.ts`

**Testing**:
- Unit test subscriber handler
- Integration test event emission → subscriber execution
- Verify side effects execute correctly

---

#### 2. Payment Collection Creation on Order Creation

**Issue**: Orders are created without Payment Collections.

**Current Behavior**:
- `create-order-from-stripe.ts` creates orders directly
- Payment information stored only in `order.metadata.stripe_payment_intent_id`
- No Payment Collection entity created

**Impact**:
- **Admin Dashboard**: Payment section shows no payment data
- **Payment Status Tracking**: Can't query payment status via Payment Collections
- **Medusa v2 Compliance**: Not using recommended payment tracking mechanism
- **API Consistency**: Admin API expects Payment Collections for payment data

**Required Implementation**:

```typescript
// In create-order-from-stripe.ts workflow
const createPaymentCollectionStep = createStep(
  "create-payment-collection",
  async (
    input: { orderId: string; paymentIntentId: string; amount: number; currencyCode: string },
    { container }
  ) => {
    const paymentModuleService = container.resolve("paymentModuleService");
    
    // Create payment collection linked to order
    const [paymentCollection] = await paymentModuleService.createPaymentCollections([
      {
        amount: input.amount,
        currency_code: input.currencyCode,
        region_id: order.region_id,
        status: "authorized",
        payments: [
          {
            amount: input.amount,
            currency_code: input.currencyCode,
            data: {
              id: input.paymentIntentId,
              status: "requires_capture",
              // ... other Stripe PaymentIntent data
            },
          },
        ],
      },
    ]);

    // Link payment collection to order
    const orderService = container.resolve("order");
    await orderService.updateOrders([
      {
        id: input.orderId,
        payment_collection_id: paymentCollection.id,
      },
    ]);

    return new StepResponse({ paymentCollectionId: paymentCollection.id });
  }
);
```

**Integration Points**:
- Add step after `createOrderStep` in workflow
- Pass PaymentIntent data to payment collection
- Link payment collection to order

**Testing**:
- Verify Payment Collection created with correct data
- Verify order linked to Payment Collection
- Verify `payment-collection.created` event emitted (if Medusa emits it)

---

#### 3. Payment Collection Update on Capture

**Issue**: Payment Collections not updated when payment is captured.

**Current Behavior**:
- `payment-capture-worker.ts` captures payment in Stripe
- Updates order metadata only
- Does not update Payment Collection status

**Impact**:
- **Status Mismatch**: Payment Collection shows "authorized" while Stripe shows "succeeded"
- **Admin Dashboard**: Incorrect payment status displayed
- **API Queries**: Payment status queries return wrong data

**Required Implementation**:

```typescript
// In payment-capture-worker.ts or new workflow step
const updatePaymentCollectionOnCaptureStep = createStep(
  "update-payment-collection-on-capture",
  async (
    input: { orderId: string; amountCaptured: number; paymentIntentId: string },
    { container }
  ) => {
    const query = container.resolve("query");
    const paymentModuleService = container.resolve("paymentModuleService");

    // Get order with payment collection
    const { data: orders } = await query.graph({
      entity: "order",
      fields: ["id", "payment_collections.id", "payment_collections.status"],
      filters: { id: input.orderId },
    });

    const order = orders[0];
    const paymentCollectionId = order.payment_collections?.[0]?.id;

    if (!paymentCollectionId) {
      console.warn(`[PaymentCapture] No payment collection found for order ${input.orderId}`);
      return new StepResponse({ updated: false });
    }

    // Update payment collection status to captured
    await paymentModuleService.updatePaymentCollections(
      { id: paymentCollectionId },
      {
        status: "captured",
        // Update payment record within collection
        payments: [
          {
            data: {
              status: "succeeded",
              amount_received: input.amountCaptured,
            },
          },
        ],
      }
    );

    console.log(`[PaymentCapture] Updated Payment Collection ${paymentCollectionId} to captured`);
    return new StepResponse({ updated: true, paymentCollectionId });
  }
);
```

**Integration Points**:
- Call from `payment-capture-worker.ts:processPaymentCapture()`
- Before or after order metadata update
- After successful Stripe capture

**Event Emission**: Medusa will automatically emit `payment-collection.updated` event ✅

**Testing**:
- Verify Payment Collection status updates to "captured"
- Verify payment record updated with amount_received
- Verify `payment-collection.updated` event emitted

---

#### 4. Payment Collection Update on Order Modifications

**Issue**: Payment Collections not updated when order total changes during grace period.

**Current Behavior**:
- `add-item-to-order.ts` updates Stripe PaymentIntent amount
- Updates order metadata (`updated_total`)
- Does not update Payment Collection amount

**Impact**:
- **Amount Mismatch**: Payment Collection shows original amount while order total increased
- **Capture Issues**: Capture worker may capture wrong amount
- **Admin Dashboard**: Shows incorrect payment amount

**Required Implementation**:

```typescript
// In add-item-to-order.ts workflow
const updatePaymentCollectionOnModificationStep = createStep(
  "update-payment-collection-on-modification",
  async (
    input: {
      orderId: string;
      newAmount: number;
      previousAmount: number;
      paymentIntentId: string;
    },
    { container }
  ) => {
    const query = container.resolve("query");
    const paymentModuleService = container.resolve("paymentModuleService");

    // Get payment collection
    const { data: orders } = await query.graph({
      entity: "order",
      fields: ["id", "payment_collections.id", "payment_collections.amount"],
      filters: { id: input.orderId },
    });

    const paymentCollectionId = orders[0]?.payment_collections?.[0]?.id;

    if (!paymentCollectionId) {
      console.warn(`[Modification] No payment collection for order ${input.orderId}`);
      return new StepResponse({ updated: false });
    }

    // Update payment collection amount (status remains "authorized")
    await paymentModuleService.updatePaymentCollections(
      { id: paymentCollectionId },
      {
        amount: input.newAmount,
        // Update payment record amount (authorization increased)
        payments: [
          {
            data: {
              amount: input.newAmount,
              // ... other PaymentIntent data
            },
          },
        ],
      }
    );

    console.log(
      `[Modification] Updated Payment Collection ${paymentCollectionId}: ${input.previousAmount} -> ${input.newAmount}`
    );
    return new StepResponse({ updated: true });
  }
);
```

**Integration Points**:
- After successful Stripe increment authorization
- Before order metadata update
- In both `add-item-to-order.ts` and `update-line-item-quantity.ts`

**Event Emission**: Medusa will automatically emit `payment-collection.updated` event ✅

**Testing**:
- Verify Payment Collection amount updates
- Verify payment record amount updates
- Verify status remains "authorized" (not "captured")

---

### 🟡 MEDIUM PRIORITY - Important Missing Side Effects

#### 5. Inventory Adjustments on Order Modifications

**Issue**: Inventory not adjusted when items added/removed during grace period.

**Current Behavior**:
- Order creation: Inventory decremented ✅
- Order cancellation: Inventory incremented (restocked) ✅
- Add item: Inventory NOT decremented ❌
- Remove item: Inventory NOT incremented ❌

**Impact**:
- **Overselling Risk**: Can sell more items than available if items added during grace period
- **Inventory Inaccuracy**: Stock counts become incorrect
- **Business Logic Inconsistency**: Same action (add item) has different inventory behavior

**Required Implementation**:

```typescript
// In add-item-to-order.ts workflow
const adjustInventoryOnAddItemStep = createStep(
  "adjust-inventory-on-add-item",
  async (
    input: { variantId: string; quantity: number },
    { container }
  ) => {
    const query = container.resolve("query");
    const inventoryService = container.resolve("inventoryService");

    // Get inventory item for variant
    const { data: variants } = await query.graph({
      entity: "product_variant",
      fields: ["id", "inventory_items.inventory_item_id"],
      filters: { id: input.variantId },
    });

    const inventoryItemId = variants[0]?.inventory_items?.[0]?.inventory_item_id;
    if (!inventoryItemId) {
      return new StepResponse({ adjusted: false, reason: "no_inventory_item" });
    }

    // Get inventory levels
    const { data: inventoryLevels } = await query.graph({
      entity: "inventory_level",
      fields: ["id", "location_id", "inventory_item_id", "stocked_quantity"],
      filters: { inventory_item_id: inventoryItemId },
    });

    if (!inventoryLevels.length) {
      return new StepResponse({ adjusted: false, reason: "no_inventory_levels" });
    }

    // Decrement inventory (similar to order creation logic)
    const adjustments = inventoryLevels.map((level: any) => ({
      inventory_item_id: inventoryItemId,
      location_id: level.location_id,
      stocked_quantity: (level.stocked_quantity || 0) - input.quantity,
    }));

    await inventoryService.updateInventoryLevels(adjustments);

    console.log(`[AddItem] Inventory decremented: variant=${input.variantId}, qty=${input.quantity}`);
    return new StepResponse({ adjusted: true });
  }
);
```

**For Remove Item**: Similar step but increment inventory instead.

**Integration Points**:
- After successful Stripe increment (for add item)
- After order update (for remove item)
- Use existing `updateInventoryLevelsStep` from `@medusajs/core-flows`

**Race Condition Considerations**:
- Inventory check happens in validation step (before Stripe increment)
- Actual adjustment happens after Stripe increment succeeds
- If adjustment fails, we have auth mismatch (critical error)

**Testing**:
- Verify inventory decrements on add item
- Verify inventory increments on remove item
- Test concurrent modifications (race conditions)

---

#### 6. Analytics: Payment Captured Event

**Issue**: Not tracking when payments are captured.

**Current Behavior**:
- `order_placed` event tracked in PostHog ✅
- `payment_captured` event NOT tracked ❌

**Impact**:
- **Conversion Funnel**: Can't analyze order_placed → payment_captured conversion
- **Revenue Recognition**: Can't track when revenue is recognized (capture time)
- **Payment Timing**: Can't analyze time between order and capture

**Required Implementation**:

```typescript
// In payment-collection-updated subscriber OR payment-capture-worker
async function trackPaymentStatusChange(
  data: PaymentCollectionUpdatedData,
  container: MedusaContainer
): Promise<void> {
  if (data.status !== "captured") {
    return; // Only track captures
  }

  const posthog = getPostHog();
  if (!posthog) {
    return;
  }

  try {
    // Get order for customer info
    const query = container.resolve("query");
    const { data: orders } = await query.graph({
      entity: "order",
      fields: ["id", "customer_id", "email", "created_at", "total"],
      filters: { id: data.order_id },
    });

    const order = orders[0];
    if (!order) {
      return;
    }

    const captureDelaySeconds = Math.round(
      (Date.now() - new Date(order.created_at).getTime()) / 1000
    );

    posthog.capture({
      distinctId: order.customer_id || order.email || `guest_${order.id}`,
      event: "payment_captured",
      properties: {
        order_id: order.id,
        payment_collection_id: data.id,
        amount: data.amount,
        currency: data.currency_code,
        capture_delay_seconds: captureDelaySeconds,
        // ... other relevant properties
      },
    });

    console.log(`[PostHog] payment_captured event tracked for order ${order.id}`);
  } catch (error) {
    console.error("[PostHog] Failed to track payment_captured:", error);
    // Don't throw - analytics is non-critical
  }
}
```

**Integration Points**:
- In `payment-collection-updated` subscriber (when status = "captured")
- Or in `payment-capture-worker.ts` after successful capture

**Testing**:
- Verify PostHog event captured with correct properties
- Verify distinctId matches order customer
- Verify capture_delay_seconds calculated correctly

---

#### 7. Fulfillment Workflow Gating

**Issue**: Fulfillment can start before payment is captured.

**Current Behavior**:
- Fulfillment creation doesn't check payment status
- Risk of shipping unpaid orders

**Impact**:
- **Financial Risk**: Ship products before payment captured
- **Business Logic Error**: Fulfillment should only start after payment captured

**Required Implementation**:

```typescript
// In fulfillment creation workflow or API route
const validatePaymentCapturedStep = createStep(
  "validate-payment-captured",
  async (input: { orderId: string }, { container }) => {
    const query = container.resolve("query");

    const { data: orders } = await query.graph({
      entity: "order",
      fields: [
        "id",
        "payment_collections.id",
        "payment_collections.status",
        "status",
      ],
      filters: { id: input.orderId },
    });

    const order = orders[0];
    if (!order) {
      throw new Error(`Order ${input.orderId} not found`);
    }

    // Check payment collection status
    const paymentCollection = order.payment_collections?.[0];
    if (!paymentCollection) {
      throw new Error(`Order ${input.orderId} has no payment collection`);
    }

    if (paymentCollection.status !== "captured") {
      throw new Error(
        `Cannot fulfill order ${input.orderId}: Payment status is ${paymentCollection.status}, must be "captured"`
      );
    }

    // Also check order status as fallback
    if (order.status !== "completed") {
      throw new Error(
        `Cannot fulfill order ${input.orderId}: Order status is ${order.status}, must be "completed"`
      );
    }

    return new StepResponse({ valid: true });
  }
);
```

**Integration Points**:
- Add as first step in fulfillment creation workflow
- Or add check in fulfillment API route
- Before any fulfillment operations

**Alternative Approach**: Use `payment-collection-updated` subscriber to trigger fulfillment automatically when payment captured.

**Testing**:
- Verify fulfillment blocked if payment not captured
- Verify fulfillment allowed after payment captured
- Test with various payment statuses

---

### 🟢 LOW PRIORITY - Nice-to-Have Side Effects

#### 8. Tax Recalculation on Modifications

**Issue**: Tax not recalculated when order amount changes.

**Current State**: Deferred to future story (low risk if flat tax rates).

**Impact**: Small tax discrepancies possible if tax rates vary by item.

**Implementation Complexity**: Medium (requires tax provider integration).

---

#### 9. Shipping Cost Recalculation

**Issue**: Shipping costs not recalculated when items added/removed.

**Current State**: Already documented as deferred (Story 3.2).

**Impact**: Shipping brackets may change (e.g., $5 for < 1lb, $10 for > 1lb).

---

#### 10. Customer Notification on Payment Capture

**Issue**: No separate email when payment is captured.

**Current State**: Customer receives order confirmation email (includes payment info).

**Impact**: Low (may be redundant). Consider if significant delay between order and capture.

---

#### 11. Audit Logging for Payment Collection Changes

**Issue**: No dedicated audit trail for Payment Collection changes.

**Current State**: Structured logging in place (may be sufficient).

**Impact**: Low (unless compliance requires dedicated audit table).

**Consideration**: Add dedicated audit table if compliance requirements exist.

---

#### 12. External System Webhooks

**Issue**: No webhooks to external systems (ERP, accounting, CRM).

**Current State**: Not implemented.

**Impact**: Low (only needed if external integrations exist).

---

## Architectural Recommendations

### Recommended Pattern: Event-Driven Payment Collection Updates

**Current Pattern** (Inconsistent):
```
Workflow → Update Order Inline → Handle Side Effects Inline
```

**Recommended Pattern** (Consistent with Medusa):
```
Workflow → Update Payment Collection → Medusa Emits Event → Subscribers Handle Side Effects
```

### Implementation Strategy

#### Phase 1: Core Payment Collection Support (Event-Driven)

1. **Create Payment Collection on Order Creation**
   - Add step to `create-order-from-stripe.ts`
   - Link Payment Collection to order
   - Medusa emits `payment-collection.created` (if applicable)

2. **Update Payment Collection on Capture**
   - Add step to payment capture workflow
   - Update status to "captured"
   - Medusa emits `payment-collection.updated` ✅

3. **Update Payment Collection on Modifications**
   - Add step to `add-item-to-order.ts`
   - Add step to `update-line-item-quantity.ts`
   - Update amount (keep status "authorized")
   - Medusa emits `payment-collection.updated` ✅

4. **Create Payment Collection Updated Subscriber**
   - Subscribe to `payment-collection.updated`
   - Handle side effects reactively:
     - Update order status (if captured)
     - Track analytics
     - Check fulfillment readiness
     - Log audit trail

**Benefits**:
- ✅ Follows Medusa's architectural pattern
- ✅ Decouples side effects from business logic
- ✅ Easy to add new side effects (just add subscriber)
- ✅ Consistent with existing event-driven patterns

#### Phase 2: Additional Side Effects

5. **Inventory Adjustments on Modifications**
   - Add steps to modification workflows
   - Or handle in `payment-collection-updated` subscriber (if order metadata tracks modifications)

6. **Analytics Tracking**
   - Add to `payment-collection-updated` subscriber
   - Track `payment_captured` event in PostHog

7. **Fulfillment Gating**
   - Add validation step to fulfillment workflow
   - Or trigger fulfillment from subscriber when payment captured

### Consistency with Existing Patterns

**Current Event-Driven Patterns** (Good Examples):
- ✅ `order.placed` → Subscriber handles email, capture scheduling
- ✅ `order.canceled` → Subscriber handles email, job removal

**Recommended Pattern** (Matches Above):
- ✅ `payment-collection.updated` → Subscriber handles order status, analytics, fulfillment

**Why This Works**:
1. **Separation of Concerns**: Business logic (workflows) separate from side effects (subscribers)
2. **Extensibility**: Easy to add new side effects without modifying workflows
3. **Testability**: Subscribers can be tested independently
4. **Medusa Compliance**: Uses Medusa's recommended patterns

### When to Use Inline vs Event-Driven

**Use Inline Updates When**:
- Transactional requirements (must succeed together)
- Critical path (can't afford async delay)
- Simple, single-step operation

**Use Event-Driven When**:
- Multiple side effects
- Non-critical operations (emails, analytics)
- Want decoupling
- Following Medusa patterns

**For Payment Collections**: Use Event-Driven ✅
- Medusa emits events automatically
- Multiple side effects needed
- Non-critical (can handle failures gracefully)
- Follows Medusa's architectural pattern

---

## Implementation Strategy

### Step-by-Step Implementation Plan

#### Step 1: Create Payment Collection on Order Creation

**File**: `workflows/create-order-from-stripe.ts`

**Changes**:
1. Add `createPaymentCollectionStep` after `createOrderStep`
2. Pass PaymentIntent data to payment collection
3. Link payment collection to order

**Testing**:
- Verify Payment Collection created
- Verify linked to order
- Verify data matches PaymentIntent

---

#### Step 2: Update Payment Collection on Capture

**File**: `workers/payment-capture-worker.ts` OR new workflow step

**Changes**:
1. Add `updatePaymentCollectionOnCaptureStep`
2. Update status to "captured"
3. Update payment record with amount_received

**Testing**:
- Verify Payment Collection status updates
- Verify `payment-collection.updated` event emitted
- Verify order status updates (via subscriber)

---

#### Step 3: Create Payment Collection Updated Subscriber

**File**: `subscribers/payment-collection-updated.ts` (NEW)

**Changes**:
1. Create subscriber handler
2. Handle side effects:
   - Update order status if captured
   - Track analytics
   - Check fulfillment readiness
   - Log audit trail
3. Register in `utils/register-subscribers.ts`

**Testing**:
- Unit test subscriber handler
- Integration test event → subscriber execution
- Verify side effects execute

---

#### Step 4: Update Payment Collection on Modifications

**Files**: 
- `workflows/add-item-to-order.ts`
- `workflows/update-line-item-quantity.ts`

**Changes**:
1. Add `updatePaymentCollectionOnModificationStep`
2. Update amount (keep status "authorized")
3. Update payment record amount

**Testing**:
- Verify Payment Collection amount updates
- Verify status remains "authorized"
- Verify `payment-collection.updated` event emitted

---

#### Step 5: Additional Side Effects

**Inventory Adjustments**:
- Add steps to modification workflows
- Or handle in subscriber based on order metadata

**Analytics**:
- Add to `payment-collection-updated` subscriber

**Fulfillment Gating**:
- Add validation step to fulfillment workflow

---

### Migration Strategy for Existing Orders

**Problem**: Existing orders don't have Payment Collections.

**Options**:
1. **Backfill Script**: Create Payment Collections for existing orders
2. **Lazy Creation**: Create Payment Collection on first access
3. **Hybrid**: Keep metadata for backward compatibility, create Payment Collections for new orders

**Recommended**: Option 3 (Hybrid)
- New orders: Create Payment Collections ✅
- Existing orders: Continue using metadata (backward compatible)
- Gradually migrate via backfill script if needed

---

## Testing Strategy

### Unit Tests

**Payment Collection Creation**:
- Verify Payment Collection created with correct data
- Verify linked to order
- Verify status set correctly

**Payment Collection Updates**:
- Verify status updates correctly
- Verify amount updates correctly
- Verify payment record updates

**Subscriber Handler**:
- Test each side effect independently
- Test error handling
- Test idempotency

### Integration Tests

**End-to-End Flow**:
1. Create order → Verify Payment Collection created
2. Capture payment → Verify Payment Collection updated → Verify subscriber executes
3. Modify order → Verify Payment Collection updated → Verify subscriber executes

**Event Emission**:
- Verify `payment-collection.updated` events emitted
- Verify subscriber receives events
- Verify side effects execute

### E2E Tests

**Customer Flow**:
- Order creation → Payment capture → Verify status updates
- Order modification → Verify Payment Collection updates
- Admin dashboard → Verify payment status displayed correctly

---

## Summary

### Key Findings

1. **Medusa Uses Event-Driven Architecture**: Redis-based event bus for async communication
2. **Payment Collections Emit Events**: `payment-collection.updated` emitted automatically
3. **Current Implementation Inconsistent**: Mixes inline updates with event-driven patterns
4. **12 Side Effects Identified**: 7 implemented, 5 need implementation

### Recommended Approach

**Use Event-Driven Pattern for Payment Collections**:
- Update Payment Collections in workflows
- Let Medusa emit events automatically
- Handle side effects in subscribers
- Matches Medusa's architectural patterns
- Consistent with existing codebase patterns

### Priority Actions

**🔴 High Priority**:
1. Create Payment Collection on order creation
2. Update Payment Collection on capture
3. Create `payment-collection.updated` subscriber
4. Update Payment Collection on modifications

**🟡 Medium Priority**:
5. Inventory adjustments on modifications
6. Analytics tracking for payment captured
7. Fulfillment workflow gating

**🟢 Low Priority**:
8-12. Tax recalculation, shipping recalculation, notifications, audit logging, webhooks (deferred or nice-to-have)

---

## References

1. **Medusa v2 Documentation**:
   - Payment Module: https://docs.medusajs.com/resources/commerce-modules/payment
   - Payment Collections: https://docs.medusajs.com/resources/commerce-modules/payment/payment-collection
   - Events and Subscribers: https://docs.medusajs.com/learn/fundamentals/events-and-subscribers

2. **Current Codebase**:
   - `apps/backend/src/workflows/create-order-from-stripe.ts`
   - `apps/backend/src/workers/payment-capture-worker.ts`
   - `apps/backend/src/workflows/add-item-to-order.ts`
   - `apps/backend/src/subscribers/order-placed.ts`
   - `apps/backend/src/utils/register-subscribers.ts`

3. **Architecture Documents**:
   - `docs/architecture/backend.md`
   - `docs/analysis/medusa-v2-payment-status-research.md`
   - `docs/analysis/order-modification-workflow-with-payment-collections.md`
