# Story: Notification Module Enhancement & Expansion

**Epic**: Notifications & Communications  
**Story ID**: NOTIF-1  
**Status**: 📋 Ready for Development  
**Priority**: Medium  
**Estimated Effort**: 5-8 story points  
**Created**: 2026-01-13  

---

## Overview

Enhance and expand the existing Medusa v2 Notification module integration to support additional channels (SMS, push notifications), new email templates, and improved notification management capabilities.

---

## Current State Analysis

### Existing Implementation ✅

Grace's Towel already has a **working notification system** with the following components:

| Component | Status | Location |
|-----------|--------|----------|
| **Resend Provider** | ✅ Implemented | `apps/backend/src/modules/resend/service.ts` |
| **Module Registration** | ✅ Configured | `apps/backend/medusa-config.ts` (lines 79-88) |
| **Email Queue (BullMQ)** | ✅ Implemented | `apps/backend/src/lib/email-queue.ts` |
| **Email Worker** | ✅ Implemented | `apps/backend/src/workers/email-worker.ts` |
| **Send Notification Step** | ✅ Implemented | `apps/backend/src/workflows/steps/send-notification.ts` |

### Existing Email Templates

| Template | File | Trigger Event |
|----------|------|---------------|
| Order Placed | `emails/order-placed.tsx` | `order.placed` |
| Order Canceled | `emails/order-canceled.tsx` | `order.canceled` |
| Shipping Confirmation | `emails/shipping-confirmation.tsx` | `fulfillment.created` |
| Welcome | `emails/welcome.tsx` | `customer.created` |

### Existing Subscribers

| Subscriber | Event | Action |
|------------|-------|--------|
| `order-placed.ts` | `order.placed` | Queue order confirmation email via BullMQ |
| `order-canceled.ts` | `order.canceled` | Send cancellation email via workflow |
| `fulfillment-created.ts` | `fulfillment.created` | Send shipping confirmation |
| `customer-created.ts` | `customer.created` | Send welcome email + Resend audience sync |
| `inventory-backordered.ts` | `inventory.backordered` | Admin notification |

### Current Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        EVENT FLOW                                │
├─────────────────────────────────────────────────────────────────┤
│  Medusa Event (order.placed)                                     │
│       ↓                                                          │
│  Subscriber (order-placed.ts)                                    │
│       ↓                                                          │
│  enqueueEmail() → BullMQ Queue                                   │
│       ↓                                                          │
│  Email Worker → Notification Module Service                      │
│       ↓                                                          │
│  Resend Provider → Resend API → Customer Email                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Problem Statement

While the core notification system works, several gaps exist:

1. **Single Channel Only**: Currently supports email only; no SMS or push notifications
2. **Limited Template Coverage**: Missing templates for common scenarios (password reset, refund issued, order modified)
3. **No Customer Preferences**: No way for customers to manage notification preferences
4. **No Admin Notifications**: Limited alerting for critical business events
5. **Inconsistent Queueing**: Some workflows use BullMQ, others use direct workflow calls
6. **No Notification History**: No visibility into what notifications were sent

### Business Impact

- Cannot send SMS order updates (customer expectation)
- No push notifications for mobile app (future)
- Admin lacks real-time alerts for critical events
- No audit trail for sent notifications

---

## User Stories

### Primary User Story

**As a** customer,  
**I want** to receive order updates via my preferred channel (email, SMS),  
**So that** I stay informed about my order status.

### Secondary User Stories

**As a** store admin,  
**I want** to receive alerts for critical business events (low stock, failed payments),  
**So that** I can respond quickly to issues.

**As a** customer,  
**I want** to manage my notification preferences,  
**So that** I only receive communications I want.

**As a** developer,  
**I want** a unified notification API,  
**So that** I can easily add new notification types.

---

## Technical Background

### Medusa v2 Notification Module

The Notification module supports:

| Feature | Description |
|---------|-------------|
| **Multi-Channel** | Email, SMS, Push via different providers |
| **Provider System** | Pluggable providers (Resend, SendGrid, Twilio, etc.) |
| **Channels Config** | Each provider declares supported channels |
| **Template System** | Provider-specific templates |
| **createNotifications()** | Core API for sending notifications |
| **sendNotificationsStep** | Workflow step for transactional sequences |

### Provider Configuration Pattern

```typescript
// medusa-config.ts
{
  resolve: "@medusajs/notification",
  options: {
    providers: [
      // Email provider (existing)
      {
        resolve: "./src/modules/resend",
        id: "resend",
        options: {
          channels: ["email"],
          api_key: process.env.RESEND_API_KEY,
          from: process.env.RESEND_FROM_EMAIL,
        },
      },
      // SMS provider (new)
      {
        resolve: "./src/modules/twilio",
        id: "twilio",
        options: {
          channels: ["sms"],
          account_sid: process.env.TWILIO_ACCOUNT_SID,
          auth_token: process.env.TWILIO_AUTH_TOKEN,
          from: process.env.TWILIO_FROM_NUMBER,
        },
      },
    ],
  },
},
```

### Sending Notifications

```typescript
// Direct API
const notificationService = container.resolve(Modules.NOTIFICATION);
await notificationService.createNotifications({
  to: "customer@example.com",
  channel: "email",
  template: "order-placed",
  data: { order: orderData },
});

// Workflow step
import { sendNotificationsStep } from "@medusajs/core-flows";
sendNotificationsStep({
  to: "+15551234567",
  channel: "sms",
  template: "order-shipped",
  data: { tracking_number: "1Z999..." },
});
```

---

## Acceptance Criteria

### Phase 1: New Email Templates

#### AC1.1: Order Modified Email Template

**Given** an order is modified during the grace period  
**When** the modification is saved  
**Then** an email is sent with:
- Original vs. new order details
- Updated total
- Modification timestamp
- Link to view order

#### AC1.2: Refund Issued Email Template

**Given** a refund is processed for an order  
**When** the refund is completed  
**Then** an email is sent with:
- Refund amount
- Refund method (original payment method)
- Expected processing time
- Order reference

#### AC1.3: Password Reset Email Template

**Given** a customer requests a password reset  
**When** the reset is initiated  
**Then** an email is sent with:
- Secure reset link (time-limited)
- Security warning
- Link expiration time
- Support contact

#### AC1.4: Back in Stock Email Template

**Given** a customer signed up for stock alerts  
**And** the product is back in stock  
**When** inventory is replenished  
**Then** an email is sent with:
- Product details
- Direct link to product
- Current availability
- Call-to-action button

### Phase 2: SMS Notifications (Optional)

#### AC2.1: SMS Provider Implementation

**Given** Twilio credentials are configured  
**When** the backend starts  
**Then** the Twilio provider is registered for the "sms" channel

#### AC2.2: Order Shipped SMS

**Given** a customer has a phone number on file  
**And** an order is shipped  
**When** the fulfillment is created  
**Then** an SMS is sent with:
- Short message: "Your Grace's Towel order has shipped! Track: [link]"
- Tracking link
- Under 160 characters

#### AC2.3: Delivery Confirmation SMS

**Given** a customer has a phone number  
**And** the order is delivered  
**When** delivery is confirmed  
**Then** an SMS is sent: "Your Grace's Towel order has been delivered! 🎉"

### Phase 3: Admin Notifications

#### AC3.1: Low Stock Alert

**Given** inventory falls below threshold (e.g., 5 units)  
**When** stock is decremented  
**Then** an admin notification is sent via:
- Email to admin address
- (Optional) Slack webhook

#### AC3.2: Failed Payment Alert

**Given** a payment fails after all retries  
**When** the payment is marked as failed  
**Then** an admin notification is sent with:
- Order ID
- Customer email (masked)
- Failure reason
- Recommended action

#### AC3.3: High-Value Order Alert

**Given** an order total exceeds threshold (e.g., $500)  
**When** the order is placed  
**Then** an admin notification is sent for manual review

### Phase 4: Notification Preferences (Future)

#### AC4.1: Customer Preference Storage

**Given** a customer account  
**When** they access notification settings  
**Then** they can toggle:
- Order updates (email/SMS)
- Marketing communications
- Stock alerts

#### AC4.2: Preference Enforcement

**Given** a customer has disabled SMS notifications  
**When** an order update occurs  
**Then** SMS is not sent, only email (if enabled)

### Phase 5: Unified Queue Architecture

#### AC5.1: Migrate All Emails to BullMQ

**Given** some email workflows use direct calls  
**When** this phase is complete  
**Then** all email sending goes through BullMQ queue

#### AC5.2: Retry Consistency

**Given** any notification fails  
**When** retries are configured  
**Then** all channels use consistent retry logic (3 attempts, exponential backoff)

---

## Technical Requirements

### Files to Create

| File | Purpose |
|------|---------|
| `apps/backend/src/modules/resend/emails/order-modified.tsx` | Order modification email template |
| `apps/backend/src/modules/resend/emails/refund-issued.tsx` | Refund notification template |
| `apps/backend/src/modules/resend/emails/password-reset.tsx` | Password reset template |
| `apps/backend/src/modules/resend/emails/back-in-stock.tsx` | Stock alert template |
| `apps/backend/src/modules/twilio/service.ts` | Twilio SMS provider (Phase 2) |
| `apps/backend/src/modules/twilio/index.ts` | Twilio module export |
| `apps/backend/src/subscribers/order-modified.ts` | Order modified event handler |
| `apps/backend/src/subscribers/refund-created.ts` | Refund event handler |
| `apps/backend/src/workflows/send-order-modified.ts` | Order modified email workflow |
| `apps/backend/src/workflows/send-refund-notification.ts` | Refund email workflow |

### Files to Modify

| File | Changes |
|------|---------|
| `apps/backend/src/modules/resend/service.ts` | Add new template mappings |
| `apps/backend/medusa-config.ts` | Add Twilio provider (Phase 2) |
| `apps/backend/src/lib/email-queue.ts` | Extend `EmailJobPayload` for new templates |

### New Template Enum Extensions

```typescript
// apps/backend/src/modules/resend/service.ts
export enum Templates {
  ORDER_PLACED = "order-placed",
  WELCOME = "welcome",
  SHIPPING_CONFIRMATION = "shipping-confirmation",
  ORDER_CANCELED = "order-canceled",
  // New templates
  ORDER_MODIFIED = "order-modified",
  REFUND_ISSUED = "refund-issued",
  PASSWORD_RESET = "password-reset",
  BACK_IN_STOCK = "back-in-stock",
  LOW_STOCK_ALERT = "low-stock-alert",      // Admin
  FAILED_PAYMENT_ALERT = "failed-payment",  // Admin
}
```

### SMS Provider Structure

```typescript
// apps/backend/src/modules/twilio/service.ts
import { AbstractNotificationProviderService } from "@medusajs/framework/utils";
import { Twilio } from "twilio";

interface TwilioModuleOptions {
  account_sid: string;
  auth_token: string;
  from: string;
}

class TwilioNotificationProviderService extends AbstractNotificationProviderService {
  static identifier = "twilio";
  private client: Twilio;
  private from: string;

  constructor(container: Record<string, unknown>, options: TwilioModuleOptions) {
    super();
    this.client = new Twilio(options.account_sid, options.auth_token);
    this.from = options.from;
  }

  async send(notification: ProviderSendNotificationDTO): Promise<ProviderSendNotificationResultsDTO> {
    const message = this.renderSmsTemplate(notification.template, notification.data);
    
    const result = await this.client.messages.create({
      body: message,
      from: this.from,
      to: notification.to,
    });

    return { id: result.sid };
  }

  private renderSmsTemplate(template: string, data: any): string {
    switch (template) {
      case "order-shipped":
        return `Your Grace's Towel order has shipped! Track: ${data.tracking_url}`;
      case "order-delivered":
        return `Your Grace's Towel order has been delivered! 🎉`;
      default:
        return `Update from Grace's Towel: ${template}`;
    }
  }
}

export default TwilioNotificationProviderService;
```

### Email Template Example

```tsx
// apps/backend/src/modules/resend/emails/order-modified.tsx
import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
  Link,
} from "@react-email/components";
import * as React from "react";

interface OrderModifiedEmailProps {
  order: {
    id: string;
    display_id?: string;
    email?: string;
    currency_code?: string;
    total: number;
    previous_total?: number;
  };
  changes: {
    items_added?: Array<{ title: string; quantity: number }>;
    items_removed?: Array<{ title: string; quantity: number }>;
    quantity_changed?: Array<{ title: string; old_qty: number; new_qty: number }>;
  };
  modified_at: string;
}

export function orderModifiedEmail(props: OrderModifiedEmailProps) {
  const { order, changes, modified_at } = props;
  const difference = order.total - (order.previous_total || order.total);
  
  return (
    <Html>
      <Head />
      <Preview>Your order #{order.display_id} has been modified</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Order Modified</Heading>
          <Text style={text}>
            Your order #{order.display_id} was updated on {modified_at}.
          </Text>
          
          {changes.items_added && changes.items_added.length > 0 && (
            <Section>
              <Heading as="h2" style={h2}>Items Added</Heading>
              {changes.items_added.map((item, i) => (
                <Text key={i} style={text}>
                  + {item.title} (x{item.quantity})
                </Text>
              ))}
            </Section>
          )}
          
          {changes.items_removed && changes.items_removed.length > 0 && (
            <Section>
              <Heading as="h2" style={h2}>Items Removed</Heading>
              {changes.items_removed.map((item, i) => (
                <Text key={i} style={text}>
                  - {item.title} (x{item.quantity})
                </Text>
              ))}
            </Section>
          )}
          
          <Section style={totalSection}>
            <Text style={totalText}>
              New Total: ${(order.total / 100).toFixed(2)} {order.currency_code?.toUpperCase()}
            </Text>
            {difference !== 0 && (
              <Text style={differenceText}>
                {difference > 0 ? `+$${(difference / 100).toFixed(2)}` : `-$${(Math.abs(difference) / 100).toFixed(2)}`}
              </Text>
            )}
          </Section>
          
          <Link href={`${process.env.STOREFRONT_URL}/order/status/${order.id}`} style={button}>
            View Order
          </Link>
        </Container>
      </Body>
    </Html>
  );
}

// Styles
const main = { backgroundColor: "#f6f9fc", fontFamily: "Arial, sans-serif" };
const container = { margin: "0 auto", padding: "40px 20px", maxWidth: "560px" };
const h1 = { color: "#1a1a1a", fontSize: "24px", fontWeight: "bold" };
const h2 = { color: "#333", fontSize: "18px", fontWeight: "bold", marginTop: "24px" };
const text = { color: "#555", fontSize: "16px", lineHeight: "24px" };
const totalSection = { marginTop: "32px", padding: "16px", backgroundColor: "#fff", borderRadius: "8px" };
const totalText = { fontSize: "20px", fontWeight: "bold", color: "#1a1a1a" };
const differenceText = { fontSize: "14px", color: "#666" };
const button = {
  display: "inline-block",
  padding: "12px 24px",
  backgroundColor: "#000",
  color: "#fff",
  textDecoration: "none",
  borderRadius: "4px",
  marginTop: "24px",
};
```

---

## Implementation Phases

### Phase 1: New Email Templates (3-4 points)

1. Create order-modified email template
2. Create refund-issued email template
3. Create password-reset email template (if auth flow exists)
4. Add Templates enum entries
5. Create corresponding workflows and subscribers

**Deliverable**: New transactional emails for order lifecycle events

### Phase 2: SMS Notifications (2-3 points) - Optional

1. Install Twilio SDK
2. Create Twilio provider module
3. Configure in medusa-config.ts
4. Create SMS templates (order-shipped, delivered)
5. Update fulfillment subscriber for dual-channel

**Deliverable**: SMS notifications for shipping updates

### Phase 3: Admin Notifications (1-2 points)

1. Create admin email templates (low-stock, failed-payment)
2. Add inventory subscriber for low stock alerts
3. Add payment failure alerting
4. Optional: Slack webhook integration

**Deliverable**: Admin alerts for critical business events

---

## Testing Requirements

### Unit Tests

| Test File | Coverage |
|-----------|----------|
| `order-modified.email.spec.ts` | Template renders correctly with all change types |
| `refund-issued.email.spec.ts` | Template renders with refund details |
| `twilio-provider.spec.ts` | SMS sending, error handling |

### Integration Tests

| Test | Description |
|------|-------------|
| Order modified → email sent | Verify email queued on order modification |
| Refund created → email sent | Verify refund notification sent |
| Low stock → admin alert | Verify admin notification on low inventory |

### E2E Tests

| Test | Description |
|------|-------------|
| Full order lifecycle | Place → Modify → Ship → Deliver with all notifications |
| SMS opt-in flow | Customer provides phone → receives SMS on ship |

---

## Definition of Done

### Code Quality
- [ ] All new templates have TypeScript types
- [ ] No `any` types in new code
- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] Follows existing email template patterns

### Functionality
- [ ] New email templates render correctly
- [ ] Templates display in email preview tool
- [ ] Queue integration works for all new templates
- [ ] (Phase 2) SMS provider sends messages
- [ ] (Phase 3) Admin alerts trigger correctly

### Testing
- [ ] Unit tests for all new templates
- [ ] Integration tests for notification flows
- [ ] Manual testing with Resend test mode

### Documentation
- [ ] Template props documented
- [ ] Environment variables documented
- [ ] README updated for new capabilities

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| SMS costs | Medium | Start with opt-in only, monitor usage |
| Spam complaints | High | Honor unsubscribe, clear sender identity |
| Template rendering issues | Low | Use React Email preview tool |
| Twilio rate limits | Low | Queue SMS like email, respect limits |

---

## Out of Scope

- Push notifications (requires mobile app)
- WhatsApp integration
- Marketing email campaigns (use Resend Audiences)
- Notification analytics dashboard
- A/B testing email content

---

## Dependencies

### Required Before Start
- Resend API key configured (existing)
- (Phase 2) Twilio account and credentials

### External Dependencies
- `@react-email/components` (already installed)
- `twilio` npm package (Phase 2 only)
- `resend` npm package (already installed)

---

## Environment Variables

### Existing (Email)
```env
RESEND_API_KEY=re_xxxxx
RESEND_FROM_EMAIL=orders@gracestowel.com
```

### New (Phase 2 - SMS)
```env
TWILIO_ACCOUNT_SID=ACxxxxx
TWILIO_AUTH_TOKEN=xxxxx
TWILIO_FROM_NUMBER=+15551234567
```

### New (Phase 3 - Admin)
```env
ADMIN_ALERT_EMAIL=admin@gracestowel.com
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/xxx (optional)
LOW_STOCK_THRESHOLD=5
HIGH_VALUE_ORDER_THRESHOLD=50000  # in cents ($500)
```

---

## References

### Official Documentation
- [Medusa Notification Module](https://docs.medusajs.com/resources/infrastructure-modules/notification)
- [Send Notifications Guide](https://docs.medusajs.com/resources/infrastructure-modules/notification/send-notification)
- [Create Notification Provider](https://docs.medusajs.com/resources/references/notification-provider-module)
- [sendNotificationsStep](https://docs.medusajs.com/resources/references/medusa-workflows/steps/sendNotificationsStep)
- [Events and Subscribers](https://docs.medusajs.com/learn/fundamentals/events-and-subscribers)

### External Resources
- [React Email Documentation](https://react.email/docs)
- [Resend API Docs](https://resend.com/docs)
- [Twilio Node.js SDK](https://www.twilio.com/docs/libraries/node)

### Project Files
- Resend Provider: `apps/backend/src/modules/resend/service.ts`
- Email Queue: `apps/backend/src/lib/email-queue.ts`
- Email Worker: `apps/backend/src/workers/email-worker.ts`
- Existing Templates: `apps/backend/src/modules/resend/emails/`
- Medusa Config: `apps/backend/medusa-config.ts`

### Related Stories
- Email Queue Stories: `docs/sprint/sprint-artifacts/email-*.md`
- Order Modification: Story 3.x (grace period)

---

## Appendix: Notification Data Models

### CreateNotificationDTO

```typescript
interface CreateNotificationDTO {
  to: string;                    // Email address or phone number
  channel: "email" | "sms";      // Notification channel
  template: string;              // Template identifier
  data?: Record<string, unknown>; // Template variables
  trigger_type?: string;         // Event that triggered notification
  resource_id?: string;          // Related resource (order ID, etc.)
  resource_type?: string;        // Resource type (order, customer, etc.)
  idempotency_key?: string;      // Prevent duplicate sends
  attachments?: Attachment[];    // Email attachments
}

interface Attachment {
  name: string;
  content: string;  // Base64 encoded
  content_type: string;
}
```

### Provider Interface

```typescript
abstract class AbstractNotificationProviderService {
  static identifier: string;
  
  abstract send(
    notification: ProviderSendNotificationDTO
  ): Promise<ProviderSendNotificationResultsDTO>;
  
  static validateOptions?(options: Record<string, unknown>): void;
}

interface ProviderSendNotificationDTO {
  to: string;
  channel: string;
  template: string;
  data?: Record<string, unknown>;
  attachments?: Attachment[];
}

interface ProviderSendNotificationResultsDTO {
  id: string;  // Provider's message ID
}
```

### Medusa Events for Notifications

| Event | Payload | Typical Notification |
|-------|---------|----------------------|
| `order.placed` | `{ id: string }` | Order confirmation |
| `order.canceled` | `{ id: string, reason?: string }` | Cancellation notice |
| `order.updated` | `{ id: string }` | Order modified (custom) |
| `fulfillment.created` | `{ id: string }` | Shipping confirmation |
| `customer.created` | `{ id: string }` | Welcome email |
| `customer.password_reset` | `{ id: string, token: string }` | Password reset |
| `refund.created` | `{ id: string }` | Refund issued |
| `inventory.item_low_stock` | `{ id: string, quantity: number }` | Admin alert |

---

*Last Updated: 2026-01-13*
