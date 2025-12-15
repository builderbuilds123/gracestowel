# Story 3.1: Wire Order Placed Subscriber to Email Queue

Status: Drafted

## Story

As a **developer**,
I want **the order.placed subscriber to enqueue an order confirmation email**,
So that **customers receive confirmation emails when they place orders**.

## Acceptance Criteria

### AC1: Email Enqueue on Order Placed

**Given** a customer places an order (guest or registered)
**When** the `order.placed` event fires
**Then** the existing `order-placed.ts` subscriber calls `enqueueEmail()` with:
```typescript
{
  orderId: order.id,
  template: "order_confirmation",
  recipient: order.email,
  data: {
    orderNumber: order.display_id,
    items: order.items,
    total: order.total,
    currency: order.currency_code,
  }
}
```

### AC2: Non-Blocking Behavior

**Given** the `enqueueEmail()` call fails (Redis unavailable)
**When** the error is caught
**Then** the error is logged: `[EMAIL][ERROR] Failed to queue confirmation for order {orderId}`
**And** the subscriber continues (does NOT throw)
**And** the order processing completes successfully

### AC3: Order Data Extraction

**Given** the order.placed event fires
**When** the subscriber prepares the email payload
**Then** it queries the order data using `query.graph` (existing pattern)
**And** extracts: id, display_id, email, items, total, currency_code

## Technical Requirements

### File to Modify

`apps/backend/src/subscribers/order-placed.ts`

### Implementation

```typescript
import { enqueueEmail } from "../lib/email-queue"

export default async function orderPlacedHandler({
  event,
  container,
}: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve("logger")
  const query = container.resolve("query")
  
  const orderId = event.data.id
  
  // Existing logic...
  
  // Query order data for email
  const { data: [order] } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "display_id", 
      "email",
      "currency_code",
      "total",
      "items.*",
      "items.variant.*",
      "items.variant.product.*",
    ],
    filters: { id: orderId },
  })
  
  if (!order) {
    logger.error(`[EMAIL][ERROR] Order ${orderId} not found for email`)
    return
  }
  
  // Prepare email payload
  const emailPayload = {
    orderId: order.id,
    template: "order_confirmation" as const,
    recipient: order.email,
    data: {
      orderNumber: order.display_id,
      items: order.items.map(item => ({
        title: item.variant?.product?.title || item.title,
        quantity: item.quantity,
        unit_price: item.unit_price,
      })),
      total: order.total,
      currency: order.currency_code,
      // magicLink will be added in Story 3.2
    },
  }
  
  // Enqueue email (non-blocking)
  try {
    await enqueueEmail(emailPayload)
    logger.info(`[EMAIL][QUEUE] Order confirmation queued for ${orderId}`)
  } catch (error) {
    // Log but don't throw - email failure shouldn't block order
    logger.error(`[EMAIL][ERROR] Failed to queue confirmation for order ${orderId}: ${error.message}`)
  }
}
```

### Dependencies

- `apps/backend/src/lib/email-queue.ts` (Story 1.1)
- Existing `order-placed.ts` subscriber

## Tasks / Subtasks

- [ ] Import `enqueueEmail` from `../lib/email-queue`
- [ ] Query order data using `query.graph` with required fields
- [ ] Build email payload with order details
- [ ] Call `enqueueEmail()` wrapped in try/catch
- [ ] Log success with `[EMAIL][QUEUE]` prefix
- [ ] Log failure with `[EMAIL][ERROR]` prefix
- [ ] Ensure existing subscriber functionality unchanged

## Testing Requirements

### Unit Tests

Add to `apps/backend/integration-tests/unit/order-placed-subscriber.unit.spec.ts`:

- [ ] Subscriber calls `enqueueEmail()` with correct payload
- [ ] Email payload contains: orderId, template, recipient, data
- [ ] Data contains: orderNumber, items, total, currency
- [ ] Subscriber catches enqueue errors and logs them
- [ ] Subscriber does not throw when enqueue fails

### Integration Tests

Add to `apps/backend/integration-tests/integration/order-email.integration.spec.ts`:

- [ ] Creating an order triggers email queue job
- [ ] Queue job contains correct order data
- [ ] Order creation succeeds even when email queue fails

### Test Command

```bash
cd apps/backend && TEST_TYPE=integration npx jest integration-tests/integration/order-email.integration.spec.ts
```

## Definition of Done

- [ ] `order-placed.ts` imports and calls `enqueueEmail()`
- [ ] Email payload includes: orderId, template, recipient, order data
- [ ] Queue call is wrapped in try/catch (non-blocking)
- [ ] Error logging uses `[EMAIL][ERROR]` prefix
- [ ] Success logging uses `[EMAIL][QUEUE]` prefix
- [ ] Existing subscriber functionality unchanged
- [ ] Integration test: order.placed event triggers email queue job
- [ ] No TypeScript errors

## Dev Notes

### Existing Subscriber Logic

The `order-placed.ts` subscriber likely already has logic for:
- Sending order confirmation via existing Resend module
- Generating modification tokens
- Other post-order processing

**Important:** Don't remove existing functionality. Add the email queue call alongside or replace the direct email send.

### Query Graph Fields

The `query.graph` call needs to fetch all data required for the email template:
- `items.*` - line items
- `items.variant.*` - variant details
- `items.variant.product.*` - product title

Adjust fields based on what the email template needs.

### Order Email Field

The order's email comes from checkout. It's stored in `order.email`. For guest orders, this is the email they entered. For registered customers, it's their account email.

## References

- [Email Queue (Story 1.1)](docs/sprint/sprint-artifacts/email-1-1-create-email-queue-service.md)
- [Existing Order Placed Subscriber](apps/backend/src/subscribers/order-placed.ts)
- [Architecture Doc](docs/product/architecture/transactional-email-architecture.md)

## Dev Agent Record

_To be filled by implementing agent_

### Agent Model Used
_Model name_

### Completion Notes
_Implementation notes_

### File List
| File | Change |
|------|--------|
| `apps/backend/src/subscribers/order-placed.ts` | Modified - added email queue call |

### Change Log
_Code review follow-ups_
