# Story 3.2: Generate Magic Link for Guest Orders

Status: Ready-for-Dev

## Story

As a **developer**,
I want **magic links generated for guest orders and included in the email payload**,
So that **guests can access their orders via the confirmation email**.

## Acceptance Criteria

### AC1: Magic Link for Guest Orders

**Given** a guest places an order (no customer account)
**When** the order.placed subscriber prepares the email payload
**Then** a magic link is generated using the existing `GuestAccessService` or `ModificationTokenService`
**And** the magic link has a 1-hour TTL (matching grace period)
**And** the magic link is included in the email payload: `data.magicLink`

### AC2: No Magic Link for Registered Customers

**Given** a registered customer places an order
**When** the order.placed subscriber prepares the email payload
**Then** NO magic link is generated (registered users log in normally)
**And** `data.magicLink` is `null` or omitted

### AC3: Magic Link Generation Failure Handling

**Given** the magic link generation fails
**When** the error is caught
**Then** the email is still queued WITHOUT a magic link
**And** the error is logged: `[EMAIL][WARN] Failed to generate magic link for order {orderId}`

### AC4: Magic Link Format

**Given** a magic link is generated
**When** included in the email
**Then** the URL format is: `{STOREFRONT_URL}/order/status/{order_id}?token={jwt}`

## Technical Requirements

### File to Modify

`apps/backend/src/subscribers/order-placed.ts`

### Existing Magic Link Service

The project already has `ModificationTokenService` from Epic 4 (Payment Integration):
- Location: `apps/backend/src/services/modification-token.ts`
- Method: `generateToken(orderId, paymentIntentId, options)`
- TTL: 3600 seconds (1 hour)

### Implementation

```typescript
import { enqueueEmail } from "../lib/email-queue"
// ModificationTokenService should already be imported or available

export default async function orderPlacedHandler({
  event,
  container,
}: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve("logger")
  const query = container.resolve("query")
  const modificationTokenService = container.resolve("modificationTokenService")
  
  const orderId = event.data.id
  
  // Query order data
  const { data: [order] } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "display_id", 
      "email",
      "currency_code",
      "total",
      "customer_id",  // Check if registered customer
      "items.*",
      "items.variant.*",
      "items.variant.product.*",
      "payment_collections.payments.data",  // For payment_intent_id
    ],
    filters: { id: orderId },
  })
  
  // Determine if guest order (no customer_id)
  const isGuest = !order.customer_id
  
  // Generate magic link for guests only
  let magicLink: string | null = null
  if (isGuest) {
    try {
      // Get payment_intent_id from order
      const paymentIntentId = order.payment_collections?.[0]?.payments?.[0]?.data?.id
      
      const token = modificationTokenService.generateToken(
        order.id,
        paymentIntentId,
        { createdAt: order.created_at }
      )
      
      const storefrontUrl = process.env.STOREFRONT_URL || "http://localhost:5173"
      magicLink = `${storefrontUrl}/order/status/${order.id}?token=${token}`
      
      logger.info(`[EMAIL] Magic link generated for guest order ${orderId}`)
    } catch (error) {
      // Log warning but continue - email will be sent without magic link
      logger.warn(`[EMAIL][WARN] Failed to generate magic link for order ${orderId}: ${error.message}`)
    }
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
      magicLink,  // null for registered customers
      isGuest,    // Template can use this to show different content
    },
  }
  
  // Enqueue email (non-blocking)
  await enqueueEmail(emailPayload)
}
```

## Tasks / Subtasks

- [ ] Import/resolve `ModificationTokenService` from container
- [ ] Query `customer_id` to determine if guest order
- [ ] Query payment data to get `payment_intent_id`
- [ ] For guests: generate token using `ModificationTokenService.generateToken()`
- [ ] Build magic link URL: `{STOREFRONT_URL}/order/status/{orderId}?token={token}`
- [ ] Add `magicLink` to email payload data
- [ ] Add `isGuest` flag to email payload for template logic
- [ ] Wrap magic link generation in try/catch
- [ ] Log warning if magic link generation fails

## Testing Requirements

### Unit Tests

Add to `apps/backend/integration-tests/unit/order-placed-subscriber.unit.spec.ts`:

- [ ] Guest order generates magic link
- [ ] Registered customer order has `magicLink: null`
- [ ] Magic link URL format is correct
- [ ] Magic link generation failure logs warning
- [ ] Email still queued when magic link fails
- [ ] `isGuest` flag correctly set in payload

### Integration Tests

Add to `apps/backend/integration-tests/integration/order-email.integration.spec.ts`:

- [ ] Guest order email payload contains valid magic link
- [ ] Registered order email payload has no magic link
- [ ] Magic link token is valid (can be decoded)
- [ ] Magic link token has 1-hour TTL

### Test Command

```bash
cd apps/backend && TEST_TYPE=unit npx jest integration-tests/unit/order-placed-subscriber.unit.spec.ts
```

## Definition of Done

- [ ] Guest orders include magic link in email payload
- [ ] Registered customer orders do NOT include magic link
- [ ] Magic link TTL is 1 hour (3600 seconds)
- [ ] Magic link generation failure does not block email
- [ ] Warning logged if magic link generation fails
- [ ] `isGuest` flag included in payload
- [ ] Unit test: guest order generates magic link
- [ ] Unit test: registered order has no magic link
- [ ] No TypeScript errors

## Dev Notes

### Existing ModificationTokenService

This service was created in Epic 4 (Payment Integration). It:
- Generates JWT tokens with HS256
- Includes `order_id`, `payment_intent_id`, `iat`, `exp`
- Has 1-hour TTL by default

If the service interface differs, adjust the implementation accordingly.

### Guest Detection

A guest order has `customer_id = null`. Registered customers have a `customer_id` linking to their account.

### STOREFRONT_URL Environment Variable

Ensure `STOREFRONT_URL` is set in environment:
- Development: `http://localhost:5173`
- Production: `https://gracestowel.com` (or actual domain)

### Payment Intent ID

The `payment_intent_id` is needed for the token. It's stored in:
```
order.payment_collections[0].payments[0].data.id
```

This path may vary - check actual order structure.

## References

- [Order Placed Subscriber (Story 3.1)](docs/sprint/sprint-artifacts/email-3-1-wire-order-placed-subscriber.md)
- [ModificationTokenService](apps/backend/src/services/modification-token.ts)
- [Magic Link Story (Epic 4)](docs/sprint/sprint-artifacts/4-1-magic-link-generation.md)
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
| `apps/backend/src/subscribers/order-placed.ts` | Modified - added magic link generation |

### Change Log
_Code review follow-ups_
