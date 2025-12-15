---
stepsCompleted: [1, 2, 3, 4]
inputDocuments:
  - "docs/product/prds/transactional-email-prd.md"
  - "docs/product/architecture/transactional-email-architecture.md"
workflowType: 'epics'
lastStep: 4
status: 'complete'
completedAt: '2025-12-14'
project_name: 'gracestowel'
user_name: 'Big Dick'
date: '2025-12-14'
---

# Epics & Stories - Transactional Email Integration

**Author:** Big Dick
**Date:** 2025-12-14

## Overview

This document defines the implementation epics and stories for the Transactional Email Integration feature. Each story is designed to be completed by a single AI dev agent with explicit, unambiguous acceptance criteria.

## Requirements Inventory

### Functional Requirements (26 FRs)

| ID | Requirement |
|----|-------------|
| FR1 | System can send transactional emails via Resend API |
| FR2 | System can queue email jobs asynchronously (non-blocking to order flow) |
| FR3 | System can retry failed email deliveries up to 3 times with exponential backoff |
| FR4 | System can move emails to Dead Letter Queue after all retries are exhausted |
| FR5 | System can store email job metadata (recipient, type, status, attempts, errors) |
| FR6 | System can trigger Order Confirmation email when `order.placed` event fires |
| FR7 | System can include order summary in Order Confirmation email (items, quantities, totals) |
| FR8 | System can include magic link in Order Confirmation email for guest order access |
| FR9 | System can generate magic link with 1-hour TTL matching grace period |
| FR10 | Customer can receive Order Confirmation email at the email address provided during checkout |
| FR11 | System can reuse existing GuestAccessService to generate magic links |
| FR12 | Magic link in email can authenticate guest to view/modify their specific order |
| FR13 | Magic link in email can remain valid for the full 1-hour grace period |
| FR14 | System can log all email send attempts with structured data (success, failure, retry) |
| FR15 | System can log email job metadata (id, type, recipient, orderId, status, timestamp) |
| FR16 | System can trigger alerts when email failure rate exceeds threshold |
| FR17 | Operator can view email delivery logs to diagnose issues |
| FR18 | Operator can view Dead Letter Queue entries via direct database/Redis access |
| FR19 | System can handle Resend API rate limits gracefully (backoff and retry) |
| FR20 | System can handle Resend API errors (5xx) with retry |
| FR21 | System can handle invalid email addresses by logging and moving to DLQ (no retry) |
| FR22 | System can handle network timeouts with retry |
| FR23 | System can continue processing orders even when email delivery fails |
| FR24 | System can be configured with Resend API credentials via environment variables |
| FR25 | System can be configured with sender email address via environment variables |
| FR26 | System can be enabled/disabled via feature flag for staged rollout |

### Non-Functional Requirements (22 NFRs)

| ID | Requirement |
|----|-------------|
| NFR1 | Email jobs must be queued within 1 second of triggering event |
| NFR2 | Email delivery to Resend API must complete within 30 seconds per attempt |
| NFR3 | Total email latency (event → inbox) must be < 5 minutes under normal conditions |
| NFR4 | Queue processing must not block Medusa event handlers |
| NFR5 | Resend API key must be stored in environment variables, never in code |
| NFR6 | Email addresses must not be logged in plain text in production logs |
| NFR7 | Magic links must use cryptographically secure tokens (existing GuestAccessService) |
| NFR8 | Magic links must expire after 1 hour (matching grace period) |
| NFR9 | DLQ entries containing email addresses must be access-controlled |
| NFR10 | Email failures must never block or fail order processing |
| NFR11 | System must retry transient failures with exponential backoff (3 attempts) |
| NFR12 | System must gracefully degrade when Resend is unavailable (queue + DLQ) |
| NFR13 | System must recover automatically when Resend becomes available |
| NFR14 | DLQ must persist failed emails until manually resolved |
| NFR15 | Queue must handle burst traffic during flash sales (10x normal volume) |
| NFR16 | Queue processing must be rate-limited to avoid Resend API limits |
| NFR17 | System must support adding new email types without architectural changes |
| NFR18 | System must integrate with Medusa's built-in subscriber/event system |
| NFR19 | System must reuse existing Redis infrastructure for queue and DLQ |
| NFR20 | System must reuse existing GuestAccessService for magic link generation |
| NFR21 | System must integrate with existing structured logging infrastructure |
| NFR22 | System must integrate with existing alerting infrastructure |

### Additional Requirements (from Architecture)

| ID | Requirement |
|----|-------------|
| AR1 | Use BullMQ for queue (not Medusa workflow) |
| AR2 | Store DLQ in Redis List with key `email:dlq` |
| AR3 | Use React Email templates (existing infrastructure) |
| AR4 | Follow existing naming patterns (kebab-case files, camelCase functions) |
| AR5 | Follow existing logging patterns with `[NAMESPACE]` prefix |
| AR6 | Create PII masking utility for email addresses in logs |
| AR7 | Worker must start with Medusa application |
| AR8 | Queue singleton pattern (not new instance per call) |
| AR9 | Job IDs must be idempotent: `email-{orderId}` |
| AR10 | Backoff delays: 1s, 2s, 4s (exponential) |

## FR Coverage Map

| Epic | FRs Covered | Description |
|------|-------------|-------------|
| Epic 1: Email Queue Infrastructure | FR1, FR2, FR5, FR24, FR25 | BullMQ queue setup, worker skeleton, env config |
| Epic 2: Retry & Dead Letter Queue | FR3, FR4, FR19, FR20, FR21, FR22 | Exponential backoff, DLQ storage, error classification |
| Epic 3: Order Confirmation Email | FR6, FR7, FR8, FR9, FR10, FR11, FR12, FR13 | Subscriber wiring, magic link, template update |
| Epic 4: Observability & Security | FR14, FR15, FR16, FR17, FR18, FR23, FR26 | Logging, alerting, PII masking, non-blocking |

## Epic List

| # | Epic Title | Goal | Stories |
|---|------------|------|---------|
| 1 | Email Queue Infrastructure | Establish async email processing foundation | 3 |
| 2 | Retry & Dead Letter Queue | Handle failures gracefully with retry and DLQ | 3 |
| 3 | Order Confirmation Email | Deliver order confirmation with magic link | 4 |
| 4 | Observability & Security | Ensure visibility into email operations and protect PII | 3 |

---

## Epic 1: Email Queue Infrastructure

**Goal:** Establish the async email processing foundation using BullMQ so that email sending never blocks order flows.

**FRs Covered:** FR1, FR2, FR5, FR24, FR25
**NFRs Addressed:** NFR1, NFR4, NFR5, NFR15, NFR17, NFR18, NFR19

---

### Story 1.1: Create Email Queue Service

As a **developer**,
I want **a BullMQ queue service for email jobs**,
So that **emails can be processed asynchronously without blocking order flows**.

**Acceptance Criteria:**

**Given** the backend application starts
**When** the email queue module is loaded
**Then** a BullMQ queue named `email-queue` is created using the existing Redis connection

**And** the queue is a singleton (same instance returned on multiple calls)
**And** the queue uses the Redis connection from `apps/backend/src/lib/redis.ts`

**Given** a caller invokes `enqueueEmail(payload)`
**When** the payload contains `{ orderId, template, recipient, data }`
**Then** a job is added to the `email-queue` with:
- Job name: `email-{orderId}`
- Job ID: `email-{orderId}` (idempotency key)
- Payload: the full payload object
- Attempts: 3
- Backoff: exponential with 1000ms base delay

**Technical Requirements:**
- Create file: `apps/backend/src/lib/email-queue.ts`
- Export: `getEmailQueue(): Queue` (singleton)
- Export: `enqueueEmail(payload: EmailJobPayload): Promise<Job>`
- Import Redis connection from existing `apps/backend/src/lib/redis.ts`
- Follow pattern from `apps/backend/src/lib/payment-capture-queue.ts`

**Definition of Done:**
- [ ] File `apps/backend/src/lib/email-queue.ts` exists
- [ ] `getEmailQueue()` returns singleton BullMQ Queue instance
- [ ] `enqueueEmail()` adds job with correct options (attempts: 3, exponential backoff)
- [ ] Job ID uses pattern `email-{orderId}` for idempotency
- [ ] No TypeScript errors in file
- [ ] Unit test verifies queue creation and job enqueueing

---

### Story 1.2: Create Email Worker

As a **developer**,
I want **a BullMQ worker that processes email jobs**,
So that **queued emails are sent via Resend**.

**Acceptance Criteria:**

**Given** the backend application starts
**When** the email worker module is loaded
**Then** a BullMQ worker is created that listens to the `email-queue`

**Given** a job exists in the `email-queue`
**When** the worker picks up the job
**Then** the worker extracts `{ orderId, template, recipient, data }` from job payload
**And** the worker calls the existing Resend notification provider service to send the email
**And** on success, the worker logs: `[EMAIL] Sent {template} to {maskedEmail} for order {orderId}`

**Given** the Resend API call fails
**When** the worker catches the error
**Then** the worker throws the error (BullMQ handles retry automatically)
**And** the worker logs: `[EMAIL] Failed to send {template} for order {orderId}: {error.message}`

**Technical Requirements:**
- Create file: `apps/backend/src/jobs/email-worker.ts`
- Worker listens to queue from `getEmailQueue()`
- Worker resolves `ResendNotificationProviderService` from Medusa container
- Worker calls `resendService.send()` with appropriate parameters
- Worker starts automatically when Medusa boots (register in `apps/backend/src/jobs/index.ts` or equivalent)
- Follow pattern from `apps/backend/src/jobs/fallback-capture.ts`

**Definition of Done:**
- [ ] File `apps/backend/src/jobs/email-worker.ts` exists
- [ ] Worker processes jobs from `email-queue`
- [ ] Worker calls Resend service to send emails
- [ ] Worker logs success with masked email address
- [ ] Worker logs failure with error message
- [ ] Worker throws on failure (enables BullMQ retry)
- [ ] Worker starts when Medusa application boots
- [ ] No TypeScript errors in file

---

### Story 1.3: Verify Non-Blocking Behavior

As a **developer**,
I want **to verify that email queue operations never block order processing**,
So that **order flows complete even if email infrastructure has issues**.

**Acceptance Criteria:**

**Given** the `enqueueEmail()` function is called
**When** Redis is unavailable or the queue operation fails
**Then** the error is caught and logged: `[EMAIL][ERROR] Failed to queue email for order {orderId}: {error.message}`
**And** the calling function does NOT throw (returns gracefully)
**And** the order processing continues uninterrupted

**Given** the email worker is processing a job
**When** the job fails after all retries
**Then** the failure is logged but does NOT affect any other system operations
**And** the order that triggered the email remains in its current state (not rolled back)

**Technical Requirements:**
- Modify `apps/backend/src/lib/email-queue.ts`: wrap `queue.add()` in try/catch
- `enqueueEmail()` must return `Promise<Job | null>` (null on failure)
- Add integration test that simulates Redis failure during enqueue
- Add integration test that verifies order completion when email fails

**Definition of Done:**
- [ ] `enqueueEmail()` catches all errors and returns null on failure
- [ ] `enqueueEmail()` logs errors with `[EMAIL][ERROR]` prefix
- [ ] Order processing code does not await email result or check for success
- [ ] Integration test: order completes when Redis is unavailable
- [ ] Integration test: order completes when email worker throws
- [ ] No TypeScript errors

---

## Epic 2: Retry & Dead Letter Queue

**Goal:** Handle email delivery failures gracefully with automatic retry and Dead Letter Queue for manual inspection.

**FRs Covered:** FR3, FR4, FR19, FR20, FR21, FR22
**NFRs Addressed:** NFR11, NFR12, NFR13, NFR14, NFR16

---

### Story 2.1: Implement Exponential Backoff Retry

As a **developer**,
I want **email jobs to retry with exponential backoff on transient failures**,
So that **temporary issues (rate limits, network errors) are handled automatically**.

**Acceptance Criteria:**

**Given** an email job fails on the first attempt
**When** the failure is a transient error (Resend 5xx, rate limit, network timeout)
**Then** BullMQ automatically retries after 1 second (1000ms)

**Given** an email job fails on the second attempt
**When** the failure is a transient error
**Then** BullMQ automatically retries after 2 seconds (2000ms)

**Given** an email job fails on the third attempt
**When** the failure is a transient error
**Then** BullMQ automatically retries after 4 seconds (4000ms)

**Given** an email job fails on all 3 attempts
**When** the final retry fails
**Then** the job is marked as failed (BullMQ `failed` event fires)
**And** the job is available for DLQ processing (Story 2.2)

**Technical Requirements:**
- Job options in `enqueueEmail()` already set: `attempts: 3, backoff: { type: 'exponential', delay: 1000 }`
- Verify worker throws errors correctly to trigger retry
- Add logging for each retry attempt: `[EMAIL][RETRY] Attempt {attemptsMade}/3 for order {orderId}`

**Definition of Done:**
- [ ] Jobs retry 3 times with delays: 1s, 2s, 4s
- [ ] Each retry attempt is logged with attempt number
- [ ] After 3 failures, job enters `failed` state
- [ ] Unit test verifies retry timing configuration
- [ ] Integration test verifies retry behavior on simulated failure

---

### Story 2.2: Implement Dead Letter Queue

As a **developer**,
I want **failed email jobs to be stored in a Dead Letter Queue**,
So that **operators can inspect and manually retry failed emails**.

**Acceptance Criteria:**

**Given** an email job has failed all 3 retry attempts
**When** BullMQ fires the `failed` event for the job
**Then** the job data is stored in Redis list with key `email:dlq`
**And** the stored data includes:
```json
{
  "jobId": "email-ord_123",
  "orderId": "ord_123",
  "template": "order_confirmation",
  "recipient": "****@example.com",
  "error": "Resend API error: rate limit exceeded",
  "failedAt": "2025-12-14T10:30:00.000Z",
  "attempts": 3
}
```
**And** a log entry is created: `[EMAIL][DLQ] Job {jobId} moved to DLQ after 3 attempts: {error}`

**Given** an operator wants to inspect the DLQ
**When** they run `redis-cli LRANGE email:dlq 0 -1`
**Then** they see all failed email jobs as JSON strings

**Technical Requirements:**
- Modify `apps/backend/src/jobs/email-worker.ts`: add `failed` event handler
- Use `redis.lpush('email:dlq', JSON.stringify(dlqEntry))` to store failed jobs
- Mask email address in DLQ entry (use PII masking from Story 4.1)
- DLQ key: `email:dlq` (Redis List)

**Definition of Done:**
- [ ] Worker has `failed` event handler
- [ ] Failed jobs are stored in Redis list `email:dlq`
- [ ] DLQ entries contain: jobId, orderId, template, masked recipient, error, failedAt, attempts
- [ ] Email addresses are masked in DLQ entries
- [ ] Log entry created when job moves to DLQ
- [ ] Manual verification: `redis-cli LRANGE email:dlq 0 -1` shows entries
- [ ] No TypeScript errors

---

### Story 2.3: Handle Invalid Email Addresses

As a **developer**,
I want **invalid email addresses to be detected and moved directly to DLQ without retry**,
So that **we don't waste retry attempts on undeliverable emails**.

**Acceptance Criteria:**

**Given** an email job is being processed
**When** the Resend API returns a 400 error indicating invalid email address
**Then** the job is NOT retried
**And** the job is immediately moved to DLQ with error: `Invalid email address: {maskedEmail}`
**And** a log entry is created: `[EMAIL][INVALID] Invalid email address for order {orderId}, moved to DLQ`

**Given** an email job is being processed
**When** the Resend API returns a 5xx error (server error)
**Then** the job IS retried (normal retry flow)

**Given** an email job is being processed
**When** the Resend API returns a 429 error (rate limit)
**Then** the job IS retried (normal retry flow)

**Technical Requirements:**
- Modify `apps/backend/src/jobs/email-worker.ts`: detect error type before throwing
- For invalid email (400 with specific error code), call `moveToDLQ()` directly and return (don't throw)
- For retryable errors (5xx, 429, network), throw to trigger BullMQ retry
- Create helper function: `isRetryableError(error): boolean`

**Definition of Done:**
- [ ] Worker detects invalid email errors (Resend 400)
- [ ] Invalid email errors skip retry and go directly to DLQ
- [ ] Retryable errors (5xx, 429, network) trigger normal retry
- [ ] Log entry distinguishes invalid email from other failures
- [ ] Unit test: invalid email goes to DLQ without retry
- [ ] Unit test: 5xx error triggers retry
- [ ] No TypeScript errors

---

## Epic 3: Order Confirmation Email

**Goal:** Deliver order confirmation emails with magic links so guests can access and modify their orders within the 1-hour grace period.

**FRs Covered:** FR6, FR7, FR8, FR9, FR10, FR11, FR12, FR13
**NFRs Addressed:** NFR3, NFR7, NFR8, NFR18, NFR20

---

### Story 3.1: Wire Order Placed Subscriber to Email Queue

As a **developer**,
I want **the order.placed subscriber to enqueue an order confirmation email**,
So that **customers receive confirmation emails when they place orders**.

**Acceptance Criteria:**

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
    // magicLink added in Story 3.2
  }
}
```

**Given** the `enqueueEmail()` call fails (Redis unavailable)
**When** the error is caught
**Then** the error is logged: `[EMAIL][ERROR] Failed to queue confirmation for order {orderId}`
**And** the subscriber continues (does NOT throw)
**And** the order processing completes successfully

**Technical Requirements:**
- Modify file: `apps/backend/src/subscribers/order-placed.ts`
- Import `enqueueEmail` from `../lib/email-queue`
- Add email queue call after existing subscriber logic
- Wrap in try/catch to ensure non-blocking
- Query order data using `query.graph` (existing pattern in subscriber)

**Definition of Done:**
- [ ] `order-placed.ts` imports and calls `enqueueEmail()`
- [ ] Email payload includes: orderId, template, recipient, order data
- [ ] Queue call is wrapped in try/catch (non-blocking)
- [ ] Error logging uses `[EMAIL][ERROR]` prefix
- [ ] Existing subscriber functionality unchanged
- [ ] Integration test: order.placed event triggers email queue job
- [ ] No TypeScript errors

---

### Story 3.2: Generate Magic Link for Guest Orders

As a **developer**,
I want **magic links generated for guest orders and included in the email payload**,
So that **guests can access their orders via the confirmation email**.

**Acceptance Criteria:**

**Given** a guest places an order (no customer account)
**When** the order.placed subscriber prepares the email payload
**Then** a magic link is generated using the existing `GuestAccessService`
**And** the magic link has a 1-hour TTL (matching grace period)
**And** the magic link is included in the email payload: `data.magicLink`

**Given** a registered customer places an order
**When** the order.placed subscriber prepares the email payload
**Then** NO magic link is generated (registered users log in normally)
**And** `data.magicLink` is `null` or omitted

**Given** the magic link generation fails
**When** the error is caught
**Then** the email is still queued WITHOUT a magic link
**And** the error is logged: `[EMAIL][WARN] Failed to generate magic link for order {orderId}`

**Technical Requirements:**
- Modify file: `apps/backend/src/subscribers/order-placed.ts`
- Import `GuestAccessService` from existing location
- Check if order has `customer_id` (registered) or not (guest)
- For guests: call `guestAccessService.generateMagicLink(orderId, { ttl: 3600 })`
- Magic link TTL: 3600 seconds (1 hour)
- Add `magicLink` to email payload data

**Definition of Done:**
- [ ] Guest orders include magic link in email payload
- [ ] Registered customer orders do NOT include magic link
- [ ] Magic link TTL is 1 hour (3600 seconds)
- [ ] Magic link generation failure does not block email
- [ ] Warning logged if magic link generation fails
- [ ] Unit test: guest order generates magic link
- [ ] Unit test: registered order has no magic link
- [ ] No TypeScript errors

---

### Story 3.3: Update Order Confirmation Email Template

As a **developer**,
I want **the order confirmation email template to display the magic link**,
So that **guests can click through to modify their orders**.

**Acceptance Criteria:**

**Given** an order confirmation email is rendered for a guest
**When** the template receives `magicLink` in props
**Then** the email displays a prominent "Modify Your Order" button/link
**And** the button links to the magic link URL
**And** the email includes text: "You have 1 hour to modify your order"

**Given** an order confirmation email is rendered for a registered customer
**When** the template receives `magicLink: null` or no magicLink
**Then** the "Modify Your Order" button is NOT displayed
**And** the email includes text: "Log in to your account to view your order"

**Given** any order confirmation email is rendered
**When** the template receives order data
**Then** the email displays:
- Order number (display_id)
- List of items with quantities
- Order total with currency
- Shipping address (if available)

**Technical Requirements:**
- Modify file: `apps/backend/src/modules/resend/emails/order-placed.tsx`
- Add `magicLink?: string` to component props interface
- Conditionally render magic link section based on prop presence
- Use React Email components for styling (keep simple for MVP)
- Follow existing template patterns in the resend/emails folder

**Definition of Done:**
- [ ] Template accepts `magicLink` prop (optional)
- [ ] Magic link renders as clickable button when present
- [ ] Magic link section hidden when prop is null/undefined
- [ ] Order summary displays: order number, items, total
- [ ] Template renders without errors for both guest and registered
- [ ] Visual test: email renders correctly in preview
- [ ] No TypeScript errors

---

### Story 3.4: End-to-End Order Confirmation Flow

As a **developer**,
I want **to verify the complete order confirmation email flow works end-to-end**,
So that **we have confidence the feature works before release**.

**Acceptance Criteria:**

**Given** a guest places an order in the storefront
**When** the order is successfully created
**Then** within 5 minutes, the guest receives an order confirmation email
**And** the email contains the correct order details
**And** the email contains a working magic link
**And** clicking the magic link opens the order page in the storefront

**Given** a registered customer places an order
**When** the order is successfully created
**Then** within 5 minutes, the customer receives an order confirmation email
**And** the email contains the correct order details
**And** the email does NOT contain a magic link
**And** the email instructs them to log in to view their order

**Given** the Resend API is temporarily unavailable
**When** an order is placed
**Then** the order completes successfully (not blocked)
**And** the email job retries 3 times
**And** if all retries fail, the job moves to DLQ
**And** an alert is triggered (logged)

**Technical Requirements:**
- Create integration test file: `apps/backend/src/__tests__/email-flow.integration.test.ts`
- Test scenarios:
  1. Guest order → email with magic link
  2. Registered order → email without magic link
  3. Resend failure → retry → DLQ
- Use test mode or mock Resend API
- Verify email content matches order data

**Definition of Done:**
- [ ] Integration test: guest order triggers email with magic link
- [ ] Integration test: registered order triggers email without magic link
- [ ] Integration test: magic link URL is valid and accessible
- [ ] Integration test: Resend failure triggers retry
- [ ] Integration test: exhausted retries move to DLQ
- [ ] Manual test: place real order, receive real email, click magic link
- [ ] All tests pass in CI

---

## Epic 4: Observability & Security

**Goal:** Ensure visibility into email operations, protect PII in logs, and alert on failures.

**FRs Covered:** FR14, FR15, FR16, FR17, FR18, FR23, FR26
**NFRs Addressed:** NFR5, NFR6, NFR9, NFR10, NFR21, NFR22

---

### Story 4.1: Create PII Masking Utility

As a **developer**,
I want **a utility to mask email addresses in logs**,
So that **PII is not exposed in production logs**.

**Acceptance Criteria:**

**Given** an email address `john.doe@example.com`
**When** the masking utility is called
**Then** it returns `j*******@example.com` (first char + asterisks + @ + domain)

**Given** an email address `a@b.co`
**When** the masking utility is called
**Then** it returns `a@b.co` (short emails kept as-is, domain visible)

**Given** an invalid email or null/undefined
**When** the masking utility is called
**Then** it returns `[invalid-email]` (safe fallback)

**Technical Requirements:**
- Create file: `apps/backend/src/utils/email-masking.ts`
- Export function: `maskEmail(email: string | null | undefined): string`
- Preserve domain for debugging (know which email provider)
- Mask local part (before @) except first character
- Handle edge cases gracefully

**Definition of Done:**
- [ ] File `apps/backend/src/utils/email-masking.ts` exists
- [ ] `maskEmail()` masks local part, preserves domain
- [ ] Short emails handled gracefully
- [ ] Invalid/null inputs return safe fallback
- [ ] Unit tests cover: normal email, short email, invalid email, null
- [ ] No TypeScript errors

---

### Story 4.2: Add Structured Logging Throughout Email Flow

As a **developer**,
I want **structured logging at every step of the email flow**,
So that **operators can diagnose issues and monitor email health**.

**Acceptance Criteria:**

**Given** an email job is enqueued
**When** `enqueueEmail()` succeeds
**Then** log: `[EMAIL][QUEUE] Enqueued {template} for order {orderId} to {maskedEmail}`

**Given** an email job is picked up by the worker
**When** processing begins
**Then** log: `[EMAIL][PROCESS] Processing {template} for order {orderId}, attempt {attemptsMade}/3`

**Given** an email is sent successfully
**When** Resend API returns success
**Then** log: `[EMAIL][SENT] Sent {template} to {maskedEmail} for order {orderId}`
**And** log metric: `[METRIC] email_sent template={template} order={orderId}`

**Given** an email send fails
**When** Resend API returns error
**Then** log: `[EMAIL][FAILED] Failed {template} for order {orderId}: {error.message}`
**And** log metric: `[METRIC] email_failed template={template} order={orderId} error={error.code}`

**Given** an email job moves to DLQ
**When** all retries exhausted
**Then** log: `[EMAIL][DLQ] Job {jobId} moved to DLQ after {attempts} attempts`
**And** log metric: `[METRIC] email_dlq template={template} order={orderId}`

**Technical Requirements:**
- Use existing logger from Medusa container: `container.resolve(ContainerRegistrationKeys.LOGGER)`
- All logs use `[EMAIL]` namespace prefix
- All email addresses use `maskEmail()` utility
- Metric logs use `[METRIC]` prefix for easy parsing
- Update files: `lib/email-queue.ts`, `jobs/email-worker.ts`

**Definition of Done:**
- [ ] Queue enqueue logged with `[EMAIL][QUEUE]`
- [ ] Worker processing logged with `[EMAIL][PROCESS]`
- [ ] Success logged with `[EMAIL][SENT]` and `[METRIC]`
- [ ] Failure logged with `[EMAIL][FAILED]` and `[METRIC]`
- [ ] DLQ logged with `[EMAIL][DLQ]` and `[METRIC]`
- [ ] All email addresses masked in logs
- [ ] Logs include orderId, template, attempt count where relevant
- [ ] No TypeScript errors

---

### Story 4.3: Add Failure Alerting

As a **developer**,
I want **alerts triggered when email failures exceed a threshold**,
So that **operators are notified of email system issues**.

**Acceptance Criteria:**

**Given** an email job moves to DLQ
**When** the DLQ handler runs
**Then** an alert log is created: `[EMAIL][ALERT] Email delivery failed for order {orderId} after 3 attempts`
**And** the alert includes: orderId, template, error message, timestamp

**Given** multiple emails fail in a short period
**When** the failure rate is high (implementation detail for post-MVP)
**Then** for MVP, each DLQ entry triggers an individual alert log

**Technical Requirements:**
- Modify `apps/backend/src/jobs/email-worker.ts`: add alert logging in DLQ handler
- Use `logger.error()` with `[EMAIL][ALERT]` prefix for alerting
- Alert log format enables external alerting tools to parse and trigger notifications
- For MVP: simple per-failure alerting (no rate-based aggregation)

**Alert Log Format:**
```
[EMAIL][ALERT] Email delivery failed | order={orderId} template={template} error={errorMessage} attempts=3 timestamp={iso8601}
```

**Definition of Done:**
- [ ] DLQ handler logs alert with `[EMAIL][ALERT]` prefix
- [ ] Alert log includes: orderId, template, error, attempts, timestamp
- [ ] Alert uses `logger.error()` level (not info)
- [ ] Alert format is parseable by external tools (pipe-delimited key=value)
- [ ] Integration test: DLQ entry triggers alert log
- [ ] No TypeScript errors

---

## Implementation Sequence

The stories should be implemented in this order to ensure dependencies are satisfied:

### Phase 1: Infrastructure (Epic 1)
1. **Story 1.1** - Create Email Queue Service
2. **Story 1.2** - Create Email Worker
3. **Story 1.3** - Verify Non-Blocking Behavior

### Phase 2: Resilience (Epic 2)
4. **Story 2.1** - Implement Exponential Backoff Retry
5. **Story 2.2** - Implement Dead Letter Queue
6. **Story 2.3** - Handle Invalid Email Addresses

### Phase 3: Core Feature (Epic 3)
7. **Story 3.1** - Wire Order Placed Subscriber to Email Queue
8. **Story 3.2** - Generate Magic Link for Guest Orders
9. **Story 3.3** - Update Order Confirmation Email Template
10. **Story 3.4** - End-to-End Order Confirmation Flow

### Phase 4: Observability (Epic 4)
11. **Story 4.1** - Create PII Masking Utility (can be done earlier, needed by 4.2)
12. **Story 4.2** - Add Structured Logging Throughout Email Flow
13. **Story 4.3** - Add Failure Alerting

**Note:** Story 4.1 (PII Masking) can be implemented in parallel with Phase 1 as it has no dependencies.

---

## Appendix: File Reference

### New Files to Create

| File | Story | Purpose |
|------|-------|---------|
| `apps/backend/src/lib/email-queue.ts` | 1.1 | BullMQ queue singleton + enqueue function |
| `apps/backend/src/jobs/email-worker.ts` | 1.2 | Worker that processes email jobs |
| `apps/backend/src/utils/email-masking.ts` | 4.1 | PII masking utility |
| `apps/backend/src/__tests__/email-flow.integration.test.ts` | 3.4 | E2E integration tests |

### Files to Modify

| File | Story | Change |
|------|-------|--------|
| `apps/backend/src/subscribers/order-placed.ts` | 3.1, 3.2 | Add email queue call + magic link |
| `apps/backend/src/modules/resend/emails/order-placed.tsx` | 3.3 | Add magic link prop + display |

### Existing Files to Reference (Patterns)

| File | Pattern |
|------|---------|
| `apps/backend/src/lib/payment-capture-queue.ts` | Queue singleton pattern |
| `apps/backend/src/jobs/fallback-capture.ts` | Worker/job pattern |
| `apps/backend/src/lib/redis.ts` | Redis connection |
| `apps/backend/src/services/guest-access.ts` | Magic link generation |
