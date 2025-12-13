---
stepsCompleted:
stepsCompleted:
  - "Validate Prerequisites"
  - "Design Epics"
  - "Create Stories"
  - "Final Validation"
inputDocuments:
  - "docs/product/epics/payment-integration.md"
  - "docs/prd/payment-integration.md"
  - "docs/architecture/overview.md"
  - "docs/architecture/backend.md"
  - "docs/architecture/storefront.md"
---

# gracestowel - Epic Breakdown

**Author:** Big Dick
**Date:** 2025-12-06
**Project Level:** Feature Integration
**Target Scale:** Production

---

## Overview

This document provides the complete epic and story breakdown for gracestowel, decomposing the requirements from the [PRD](./prd/payment-integration.md) into implementable stories.

**Living Document Notice:** This is the initial version. It will be updated after UX Design and Architecture workflows add interaction and technical details to stories.

## Context Validation
- **PRD**: `docs/prd/payment-integration.md` ✅
- **Architecture**: `docs/architecture/backend.md`, `storefront.md`, `data-models.md` ✅
- **UX Design**: Not available (Will infer standard patterns) ⚠️

---

## Functional Requirements Inventory

| ID | Requirement | Description | Source |
| :--- | :--- | :--- | :--- |
| **FR1** | Express Checkout | Implement Stripe Express Checkout Element (Apple Pay, GPay, PayPal) | PRD 4.1 |
| **FR2** | Standard Payment | Implement Stripe Payment Element for Cards & BNPL | PRD 4.1 |
| **FR3** | Guest Checkout | Support guest checkout with delayed account linking for edits | PRD 4.1 |
| **FR4** | Auth-Only Flow | Configure Stripe for `capture_method: manual` | PRD 4.2 |
| **FR5** | 1-Hour Grace Period | Generate Redis tokens and persist 1-hour session handling | PRD 4.3 |
| **FR6** | Order Editing | Allow add/remove items during grace period (inc. Stripe updates) | PRD 4.3 |
| **FR7** | Guest Magic Link | Secure email link for guests to access order edits | PRD 4.3 |
| **FR8** | Auto Capture | Redis Keyspace Notification listener to trigger capture | PRD 4.4 |
| **FR9** | Fallback Cron | Cron job to capture "stuck" authorizations | PRD 4.4 |
| **FR10** | PCI Compliance | SAQ-A compliance via Stripe Elements | PRD 5.1 |

---



<!-- Repeat for each epic (N = 1, 2, 3...) -->

## Epic 1: Stripe Integration & Checkout Flow

**Goal:** Enable users to complete purchases using Stripe (Cards, Wallets, BNPL) with "Auth-Only" logic to support the grace period.

<!-- Repeat for each story (M = 1, 2, 3...) within epic N -->

### Story 1.1: Backend Stripe Plugin Setup

As a Developer,
I want to configure the `medusa-payment-stripe` plugin in the backend,
So that we can securely process payments via Stripe API.

**Acceptance Criteria:**

**Given** the backend application is running
**When** the server starts
**Then** the Stripe provider should be registered with correct API keys (`STRIPE_API_KEY`, `STRIPE_WEBHOOK_SECRET`) from `.env`
**And** webhooks should be configured to listen for `payment_intent.succeeded` and `payment_intent.amount_capturable_updated`

**Technical Notes:**
- Install `@medusajs/payment-stripe`
- Update `medusa-config.ts` to include the plugin
- Ensure `capture: false` global setting or per-transaction override is prepared (see Story 1.4)

### Story 1.2: Storefront Payment Element

As a Shopper,
I want to enter my card details in a secure, hosted form,
So that my payment information remains safe and PCI compliant.

**Acceptance Criteria:**

**Given** I am on the `/checkout` page
**When** I reach the payment step
**Then** I should see the Stripe Payment Element form
**And** it should support Card payments and BNPL (Klarna/Affirm) if configured
**And** submitting the form should create a Payment Session in Medusa

**Given** I am in the checkout flow
**When** I modify my cart or shipping selection
**Then** the system SHALL UPDATE the existing PaymentIntent rather than creating a new one
**And** the `clientSecret` SHALL remain stable (not change) to prevent Stripe Elements from breaking

**Given** a PaymentIntent is being created
**When** the API request is made
**Then** the system SHALL use a deterministic idempotency key based on cart contents
**And** duplicate requests with the same cart SHALL return the same PaymentIntent

**Technical Notes:**
- Use `@stripe/react-stripe-js` in `apps/storefront`
- Implement `PaymentElement` component
- Ensure `return_url` is set to `/checkout/success`
- **Updated 2025-12-12**: PaymentIntent lifecycle management per Course Correction
  - `api.payment-intent.ts`: Accept `paymentIntentId` param for updates
  - `checkout.tsx`: Store and reuse `paymentIntentId` in state
  - Server generates idempotency key from cart hash for creates only
  - Single `useEffect` manages create/update lifecycle

### Story 1.3: Express Checkout Element

As a Mobile Shopper,
I want to pay using Apple Pay or Google Pay with one tap,
So that I can check out quickly without typing forms.

**Acceptance Criteria:**

**Given** I am on the `/cart` or `/checkout` page
**When** I have a supported device/wallet
**Then** I should see the "Express Checkout" button (Apple Pay / GPay) at the top of the page
**And** clicking it should launch the native wallet sheet
**And** completing the sheet should authorize the payment and redirect to success

**Technical Notes:**
- Implement `ExpressCheckoutElement` from Stripe React SDK
- Must handle shipping address callbacks if used on Cart page (or restrict to Checkout page for MVP)

### Story 1.4: Auth-Only Configuration

As the Business Owner,
I want payments to be Authorized Only (not Captured) at checkout,
So that we can modify the order amount during the 1-hour grace period without refunding.

**Acceptance Criteria:**

**Given** a customer completes checkout
**When** the payment intent is created
**Then** the `capture_method` must be set to `manual` in Stripe
**And** the Medusa Order status should be `pending` (or `requires_action` depending on flow)
**And** NO funds should be captured from the customer's bank (only held)

**Technical Notes:**
- In `api.payment-intent.ts` (or Medusa service override), ensure `capture_method: "manual"` is passed to Stripe
- Verify `automatic_payment_methods` config allows manual capture

<!-- End story repeat -->

---

## Epic 2: Grace Period & Delayed Capture Engine

**Goal:** Implement the specific backend infrastructure (Redis + Workers) to manage the "1-Hour Hold" and trigger delayed capture.

<!-- Repeat for each story (M = 1, 2, 3...) within epic N -->

### Story 2.1: Redis Token Infra

As a Backend Developer,
I want to store "Capture Intent" tokens in Redis with a strict 1-hour TTL,
So that the system automatically knows when the edit window has closed.

**Acceptance Criteria:**

**Given** a new order is placed
**When** the `order.placed` event fires
**Then** a Redis Key `capture_intent:{order_id}` should be SET
**And** the value should be timestamp or metadata (JSON)
**And** the EXPIRE time must be exactly 3600 seconds (1 hour)

**Technical Notes:**
- Implement `CaptureIntentService` in `apps/backend`
- Use the shared Redis connection
- Ensure Redis persistence is configured so reboots don't lose keys (AOF enabled recommendation)

### Story 2.2: Expiration Listener

As the System,
I want to listen for the Redis `expired` event for capture intent keys,
So that I can immediately trigger the payment capture process.

**Acceptance Criteria:**

**Given** Redis Keyspace Notifications are enabled (`notify-keyspace-events Ex`)
**When** a key `capture_intent:{order_id}` expires
**Then** the subscribed background worker should receive the event
**And** it should queue a `capture_order` job (using Medusa's event bus or BullMQ) to handle the actual capture

**Technical Notes:**
- Create a dedicated subscriber for Redis events
- Must handle duplicate events (idempotency) although rare with Redis expiry
- Log the expiration event for audit

### Story 2.3: Capture Workflow

As the System,
I want to execute the actual Stripe Capture when the job is triggered,
So that the funds are transferred to our account.

**Acceptance Criteria:**

**Given** the `capture_order` job runs for Order X
**When** it executes
**Then** it should fetch the *current* Order Total (which might have changed)
**And** it should call `paymentProviderService.capturePayment(paymentId)`
**And** upon success, the Medusa Order Status should update to `captured` (or `processing`)
**And** if capture fails (e.g. card error), it should alert Admin/Logs and retry 3 times

**Technical Notes:**
- Use Medusa's `IdempotencyKey` pattern if possible
- Ensure the capture amount matches `order.total` exactly

### Story 2.4: Fallback Cron

As a DevOps Engineer,
I want a background cron job to capture "stuck" orders,
So that we don't lose money if the Redis event is missed (fire-and-forget).

**Acceptance Criteria:**

**Given** an order was authorized > 65 minutes ago
**And** its status is still `pending` (not captured)
**And** no valid Redis key exists for it
**When** the hourly cron runs
**Then** it should identify this "zombie" order
**And** force trigger the Capture Workflow
**And** log a warning that "Fallback Capture Triggered"

**Technical Notes:**
- Use Medusa's scheduled jobs (Cron)
- Query: `created_at < NOW() - 65min AND payment_status = awaiting`

<!-- End story repeat -->

---

## Epic 3: Self-Service Order Editing

**Goal:** Provide a user-facing interface to modify orders during the grace period and backend logic to handle amount changes.

<!-- Repeat for each story (M = 1, 2, 3...) within epic N -->

### Story 3.1: Storefront Timer & Edit UI

As a Customer,
I want to see a countdown timer on my order confirmation page,
So that I know how long I have to make changes.

**Acceptance Criteria:**

**Given** I just completed an order
**When** I view the Order Status page
**Then** I should see a distinct "Edit Order" section
**And** it should display a countdown timer (starting from 60 mins)
**And** if the timer > 0, an "Edit Order" button is visible
**And** if the timer reaches 0, the button should disappear and status change to "Processing"

**Technical Notes:**
- Implement in `apps/storefront/app/routes/order/status.tsx`
- Timer logic should be based on `order.created_at` (server time), not client time
- Check `capture_intent` validity via API payload if possible

### Story 3.2: Increment Authorization Logic

As a Customer,
I want to add an item to my order during the grace period,
So that I don't have to make a separate second order.

**Acceptance Criteria:**

**Given** I am in "Edit Mode" for an active order
**When** I add a product to the cart/order
**Then** the backend must calculate the new total
**And** it must attempt to call Stripe `increment_authorization`
**And** if successful, the order line items and total should update
**And** if failed (insufficient funds), the addition must be rejected with a user-friendly error

**Technical Notes:**
- Create `OrderEditService` in backend
- **CRITICAL:** Call `stripe.increment_authorization` immediately upon addition. If it fails, reject the add-item request. Do not wait for capture to find out.
- Fallback strategy (Story 7.1 in future) allows re-auth if needed, but for now, fail if increment is denied.

### Story 3.3: Update Order Totals Logic

As the System,
I want to correctly recalculate tax and shipping when an order is edited,
So that the final captured amount is accurate.

**Acceptance Criteria:**

**Given** an order is being edited
**When** line items change (add or remove)
**Then** the System must re-run the Cart Calculation logic (Tax, Shipping, Discounts)
**And** update the `order.total` in the database
**And** if the total decreases (item removed), no Stripe action is needed immediately (capture will just take less later)

**Technical Notes:**
- Leverage Medusa's existing `CartService` methods for total calculation
- Ensure `order.difference_due` is 0 (fully paid) before saving

### Story 3.4: Order Cancellation During Grace Period

As a Shopper,
I want to cancel my order entirely within the grace period,
So that I don't get charged for an order I no longer want.

**Acceptance Criteria:**

**Given** I am in the 1-hour grace period
**And** I choose "Cancel Order" from the status page
**When** I confirm the cancellation
**Then** the System must call `stripe.paymentIntents.cancel(paymentIntentId)`
**And** DELETE the Redis key `capture_intent:{order_id}` immediately
**And** update the Medusa Order Status to `canceled`
**And** the Capture Worker must skip this order if it runs later

**Technical Notes:**
- Implement the `cancelOrder` endpoint carefully with race-condition checks
- Ensure the capture worker checks order status before capturing


---

## Epic 4: Guest Access & Notifications

**Goal:** Securely allow guest users (no account) to access the edit window via email links.

<!-- Repeat for each story (M = 1, 2, 3...) within epic N -->

### Story 4.1: Magic Link Generation

As the System,
I want to generate a secure, signed URL for the order status page,
So that guest users can access it without logging in.

**Acceptance Criteria:**

**Given** a guest user places an order
**When** the order is created
**Then** a secure token (JWT or random hash) should be generated
**And** it should be stored in Redis (or DB) linked to the `order_id`
**And** the token should expire in 1 hour (matching the grace period)

**Technical Notes:**
- Create `GuestAccessService`
- Token should provide `READ` and `EDIT` access to that specific order only

### Story 4.2: Guest Auth Middleware

As a Developer,
I want middleware that validates the "magic token" on the order status route,
So that unauthorized users cannot edit random orders.

**Acceptance Criteria:**

**Given** a user accesses `/order/status/:id?token=XYZ`
**When** the page loads
**Then** the backend must validate `XYZ` against the stored token for Order `id`
**And** if valid, grant temporary session access to edit that order
**And** if invalid/expired, redirect to "Link Expired" page

**Technical Notes:**
- Middleware in `apps/storefront` or Backend Guard
- Ensure it bypasses standard Login requirement

### Story 4.3: Session Persistence

As a Shopper,
I want my order session to persist if I refresh the page,
So that I don't lose my edit access immediately.

**Acceptance Criteria:**

**Given** I have accessed an order via Magic Link
**When** I navigate away and come back (within 1 hour)
**Then** I should still have "Edit" permissions without needing to click the email link again
**And** this should be handled via an `HttpOnly` cookie containing the session token
**And** if I clear cookies, I must use the Magic Link again

**Technical Notes:**
- Store the token in an `HttpOnly`, `Secure`, `SameSite=Strict` cookie
- Set cookie expiry to match the token TTL (1 hour)
- Middleware (Story 4.2) should check Cookie FIRST, then URL query param

<!-- End story repeat -->

---

## FR Coverage Matrix

| FR ID | Requirement | Covered By |
| :--- | :--- | :--- |
| **FR1** | Express Checkout | Epic 1 / Story 1.3 |
| **FR2** | Standard Payment | Epic 1 / Story 1.2 |
| **FR3** | Guest Checkout | Epic 1 / Story 1.2 (Foundation), Epic 4 / Story 4.1, 4.2 |
| **FR4** | Auth-Only Flow | Epic 1 / Story 1.4 |
| **FR5** | 1-Hour Grace Period | Epic 2 / Story 2.1 |
| **FR6** | Order Editing | Epic 3 / Story 3.1, 3.2, 3.3 |
| **FR7** | Guest Magic Link | Epic 4 / Story 4.1, 4.2 |
| **FR8** | Auto Capture | Epic 2 / Story 2.2, 2.3 |
| **FR9** | Fallback Cron | Epic 2 / Story 2.4 |
| **FR10** | PCI Compliance | Epic 1 / Story 1.2 |

---

## Summary

## Epic 5: Quality Assurance

**Goal:** Verify the critical time-sensitive flows using automated tests to prevent regression.

### Story 5.1: E2E Grace Period Tests

As a QA Engineer,
I want an automated test suite that simulates the 1-hour grace period,
So that we can verify the "Edit Button" disappears and extraction triggers correctly.

**Acceptance Criteria:**

**Given** a test order is placed
**When** the "Grace Period" expires (simulated by mocking time or Redis event)
**Then** the "Edit Order" button must NOT be visible on the status page
**And** the Capture Workflow should be triggered in the backend
**And** attempting to use an old Magic Link should redirect or show "Expired"

**Technical Notes:**
- Use Playwright for Storefront E2E
- Mock the Redis expiration event in the backend integration test
- DO NOT wait 1 hour in tests; use time-travel or short TTL configuration for test environment

---

## Epic 6: Error Handling & Resilience

**Goal:** Ensure the system robustly handles failure states during the critical capture window.

### Story 6.1: Webhook Validation & Retry

As a Backend Developer,
I want to validate Stripe webhook signatures and implement exponential backoff for retries,
So that we don't process fake events or lose data if the server blips.

**Acceptance Criteria:**
- Verify `stripe-signature` header on all webhook endpoints.
- Configure Medusa/Redis to retry failed webhook jobs (e.g. 5 retries with backoff).

### Story 6.2: Redis Connection Failure Handling

As a DevOps Engineer,
I want the application to degrade gracefully if Redis is temporarily unreachable,
So that checkout doesn't 500 hard.

**Acceptance Criteria:**
- If Redis is down, Capture Intent creation should log error but NOT block Checkout.
- Implement a "Recovery Mode" that scans DB for orders created during Redis outage.

### Story 6.3: Race Condition Handling

As a Developer,
I want to lock the order for editing near the 59:59 mark,
So that we don't allow edits while capture is starting.

**Acceptance Criteria:**
- Implement Optimistic Locking on the Order entity.
- If Capture Job has started, all Edit requests must return `409 Conflict`.

### Story 6.4: Increment Fallback Flow

As a Shopper,
I want to know if my "Add Item" request was declined by the bank,
So that I can try a different card or cancel the addition.

**Acceptance Criteria:**
- Handle Stripe `decline_code` specific errors.
- If `increment_authorization` fails, show specific error to user and revert local Order total.

---

## Epic 7: Security & Compliance

**Goal:** Harden the implementation against abuse and ensuring auditability.

### Story 7.1: Secure Token Generation

As a Security Engineer,
I want Magic Links to use cryptographically secure tokens (HMAC-SHA256),
So that they cannot be guessed or brute-forced.

**Acceptance Criteria:**
- Tokens must be at least 32 bytes of entropy.
- Use a rotating secret key for signing.

### Story 7.2: Rate Limiting

As a DevOps Engineer,
I want to rate limit the "Edit Order" endpoints,
So that malicious actors can't spam our backend.

**Acceptance Criteria:**
- Limit `/edit-order`: 10 requests / minute per IP.
- Limit `/magic-link`: 3 requests / hour per email.

### Story 7.3: Audit Logging

As a Compliance Officer,
I want a log of every modification made to an order during the grace period,
So that we can resolve disputes.

**Acceptance Criteria:**
- Log: `Timestamp`, `UserIP`, `Action` (Add/Remove), `OldAmount`, `NewAmount`.
- Store in a persistent `audit_log` table (not just console logs).

### Story 7.4: CSRF Protection

As a Security Engineer,
I want the "Edit Order" actions to be protected against CSRF,
So that attackers can't trigger edits via malicious sites.

**Acceptance Criteria:**
- Ensure Remix actions validate CSRF tokens (standard stack behavior, verify enabled).

---

## Epic 8: Operational Excellence

**Goal:** Provide visibility into the system's health and grace period performance.

### Story 8.1: Structured Logging

As a Developer,
I want logs to contain `order_id` and `trace_id` for the entire capture workflow,
So that I can debug issues easily.

**Acceptance Criteria:**

**Given** any payment-related operation occurs
**When** the system logs the event
**Then** the log entry SHALL be JSON-structured with fields: `timestamp`, `level`, `message`, `context`
**And** the `context` SHALL include `traceId`, and optionally `orderId`, `paymentIntentId`, `customerId`
**And** trace IDs SHALL be propagated via `x-trace-id` header from frontend to backend
**And** error responses SHALL include `traceId` for customer support reference

**Technical Notes:**
- Create `apps/storefront/app/lib/logger.ts` utility
- Generate trace IDs in format `gt_{timestamp}_{random}`
- Use `createLogger()` factory with child logger support
- Return `traceId` in error responses for support escalation
- **Updated 2025-12-12**: Expanded scope per Course Correction proposal

### Story 8.2: Metrics Dashboard

As a Product Manager,
I want to see metrics on "Edit Window Usage",
So that I know if the feature is valuable.

**Acceptance Criteria:**
- Track Metrics: `% Orders Edited`, `% Auto-Captured`, `% Manual-Captured`.
- Push to PostHog or Datadog.

### Story 8.3: Alerting

As an On-Call Engineer,
I want to be alerted if "Failed Captures" spike,
So that I can intervene manually.

**Acceptance Criteria:**
- Trigger Slack/PagerDuty alert if > 1% of Captures fail in 1 hour.

---



## Summary

The Payment Integration is now fully specified with 8 Epics covering the complete lifecycle from Checkout to Delayed Capture and Order Modification, including Guest Access, QA verification, Error Handling, Security, and Operational Excellence.

All 10 Functional Requirements are covered. **2 implementation gaps identified** (see TODO section above).

---

_For implementation: Use the `create-story` workflow to generate individual story implementation plans from this epic breakdown._

_This document will be updated after UX Design and Architecture workflows to incorporate interaction details and technical details._
