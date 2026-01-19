# Story: Local Notification Module for Admin Dashboard

**Epic**: Notifications & Communications
**Story ID**: NOTIF-2-LOCAL-ADMIN
**Status**: Ready for Development
**Priority**: Medium
**Estimated Effort**: 2-3 story points
**Created**: 2026-01-19
**Parent**: [NOTIF-1: Notification Module Enhancement](notif-1-notification-module-enhancement.md)

---

## Overview

Add Medusa v2 Local Notification Module to send in-app notifications to the admin dashboard for comprehensive business events. This implements Phase 3 (Admin Notifications) from NOTIF-1 using Medusa's native `notification-local` provider for the admin feed channel.

---

## User Story

**As a** store admin,
**I want** to see real-time notifications in the admin dashboard for key business events,
**So that** I can respond quickly to new orders, cancellations, and inventory issues.

---

## Current State

| Component | Status |
|-----------|--------|
| **Resend Email Provider** | Implemented |
| **Local Notification Provider** | NOT implemented |
| **Admin Feed Channel** | NOT configured |
| **Event Subscribers** | Exist (email only) |

---

## Events to Notify

| Event | Title | Priority |
|-------|-------|----------|
| `order.placed` | New Order Received | High |
| `order.canceled` | Order Canceled | High |
| `inventory.backordered` | Inventory Backorder Alert | High |
| `fulfillment.created` | Order Shipped | Medium |
| `customer.created` | New Customer Signup | Low |
| `payment.capture_failed` | Payment Capture Failed | High |

---

## Acceptance Criteria

### AC1: Local Notification Provider Registered
**Given** the backend starts
**When** the notification module initializes
**Then** the local provider is registered for the "feed" channel

### AC2: Admin Notification Helper
**Given** a subscriber wants to send an admin notification
**When** it calls `sendAdminNotification()`
**Then** a notification appears in the Medusa admin dashboard

### AC3: Order Events Trigger Admin Notifications
**Given** an order is placed, canceled, or fulfilled
**When** the event fires
**Then** an admin notification is created with order details

### AC4: Inventory Backorder Alert
**Given** inventory is backordered
**When** the `inventory.backordered` event fires
**Then** an admin notification alerts about the stock issue

### AC5: Payment Failure Alert
**Given** a payment capture fails
**When** the `payment.capture_failed` event fires
**Then** an admin notification is created with failure details

---

## Implementation Steps

### Step 1: Register Local Notification Provider

**File:** `apps/backend/medusa-config.ts` (lines 78-93)

Add local provider to existing notification module config:

```typescript
{
  resolve: "@medusajs/notification",
  options: {
    providers: [
      // Existing Resend email provider (keep as-is)
      {
        resolve: "./src/modules/resend",
        id: "resend",
        options: {
          channels: ["email"],
          api_key: process.env.RESEND_API_KEY,
          from: process.env.RESEND_FROM_EMAIL,
        },
      },
      // NEW: Local notification for admin feed
      {
        resolve: "@medusajs/medusa/notification-local",
        id: "local",
        options: {
          channels: ["feed"],
        },
      },
    ],
  },
}
```

### Step 2: Create Admin Notification Helper

**File:** `apps/backend/src/lib/admin-notifications.ts` (NEW)

```typescript
import { Modules } from "@medusajs/framework/utils"
import { MedusaContainer } from "@medusajs/framework"

export enum AdminNotificationType {
  ORDER_PLACED = "order_placed",
  ORDER_CANCELED = "order_canceled",
  INVENTORY_BACKORDER = "inventory_backorder",
  FULFILLMENT_CREATED = "fulfillment_created",
  CUSTOMER_CREATED = "customer_created",
  PAYMENT_FAILED = "payment_failed",
}

interface AdminNotificationData {
  type: AdminNotificationType
  title: string
  description: string
  metadata?: Record<string, unknown>
}

export async function sendAdminNotification(
  container: MedusaContainer,
  data: AdminNotificationData
): Promise<void> {
  const notificationService = container.resolve(Modules.NOTIFICATION)

  await notificationService.createNotifications({
    to: "",
    channel: "feed",
    template: "admin-ui",
    data: {
      title: data.title,
      description: data.description,
      ...data.metadata,
    },
  })
}
```

### Step 3: Update Existing Subscribers

**3a. `apps/backend/src/subscribers/order-placed.ts`**
- Import `sendAdminNotification`
- Add call after email queue logic with title "New Order Received"

**3b. `apps/backend/src/subscribers/order-canceled.ts`**
- Import `sendAdminNotification`
- Add call after email workflow with title "Order Canceled"

**3c. `apps/backend/src/subscribers/inventory-backordered.ts`**
- Import `sendAdminNotification`
- Replace TODO comment (lines 67-73) with actual notification call

**3d. `apps/backend/src/subscribers/fulfillment-created.ts`**
- Import `sendAdminNotification`
- Add call after email workflow with title "Order Shipped"

**3e. `apps/backend/src/subscribers/customer-created.ts`**
- Import `sendAdminNotification`
- Add call after email workflow with title "New Customer Signup"

### Step 4: Create Payment Failed Subscriber

**File:** `apps/backend/src/subscribers/payment-capture-failed.ts` (NEW)

Subscribe to `payment.capture_failed` event and send admin notification.

---

## Files to Modify

| File | Action |
|------|--------|
| `apps/backend/medusa-config.ts` | Add local provider |
| `apps/backend/src/lib/admin-notifications.ts` | CREATE |
| `apps/backend/src/subscribers/order-placed.ts` | Add notification |
| `apps/backend/src/subscribers/order-canceled.ts` | Add notification |
| `apps/backend/src/subscribers/inventory-backordered.ts` | Add notification |
| `apps/backend/src/subscribers/fulfillment-created.ts` | Add notification |
| `apps/backend/src/subscribers/customer-created.ts` | Add notification |
| `apps/backend/src/subscribers/payment-capture-failed.ts` | CREATE |

---

## Definition of Done

- [ ] Local notification provider registered in medusa-config.ts
- [ ] `sendAdminNotification()` helper function created
- [ ] All 6 event types trigger admin notifications
- [ ] `pnpm build` passes in apps/backend
- [ ] `pnpm typecheck` passes
- [ ] Manual test: Place order -> see notification in admin

---

## Verification

1. **Build:** `cd apps/backend && pnpm build`
2. **Test order placed:** Place test order, check admin notification panel
3. **Test backorder:** Order item with 0 stock, verify alert appears
4. **Logs:** Check for notification creation in backend logs

---

## References

- [Medusa Local Notification Module](https://docs.medusajs.com/resources/infrastructure-modules/notification/local)
- Parent Story: `docs/sprint/sprint-artifacts/notif-1-notification-module-enhancement.md`
- Existing Subscribers: `apps/backend/src/subscribers/`

---

*Created: 2026-01-19*
