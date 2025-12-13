# Story: Checkout Payment Flow Fixes

**Epic:** Epic 1 (Stripe Integration) + Epic 8 (Operational Excellence)
**Status:** Ready for Review
**Priority:** Critical
**Created:** 2025-12-12
**Source:** Course Correction Proposal

---

## Overview

Critical fixes for the checkout payment flow addressing multiple bugs discovered during implementation testing. This story consolidates three approved changes from the Sprint Change Proposal.

**Related Proposal:** `docs/sprint/proposals/sprint-change-proposal-2025-12-12-checkout-fixes.md`

---

## User Story

As a **Shopper**,
I want the checkout payment flow to work reliably without creating duplicate charges or losing my session,
So that I can complete my purchase with confidence.

As a **Developer**,
I want structured logging with trace IDs throughout the payment flow,
So that I can debug issues quickly when they occur.

---

## Bugs Addressed

| # | Bug | Root Cause | Fix |
|---|-----|------------|-----|
| 1 | Multiple PaymentIntents created | New PI on every useEffect trigger | Create once, update on changes |
| 2 | PaymentIntent not persistent | clientSecret changes break Elements | Store PI ID, only set clientSecret once |
| 3 | Order not propagated to backend | No idempotency in webhook handler | Check for existing order before create |
| 4 | Capture failures | No retry logic or error handling | Structured logging, re-throw for retry |
| 5 | No error tracing | Console.log only | JSON structured logs with trace IDs |

---

## Acceptance Criteria

### Change 1: PaymentIntent Lifecycle

**Given** I am in the checkout flow
**When** I modify my cart or shipping selection
**Then** the system SHALL UPDATE the existing PaymentIntent rather than creating a new one
**And** the `clientSecret` SHALL remain stable (not change)

**Given** a PaymentIntent is being created
**When** the API request is made
**Then** the system SHALL use a deterministic idempotency key based on cart contents

### Change 2: Structured Logging

**Given** any payment-related operation occurs
**When** the system logs the event
**Then** the log entry SHALL be JSON-structured with `timestamp`, `level`, `message`, `context`
**And** the `context` SHALL include `traceId`

**Given** a payment error occurs
**When** the error is returned to the user
**Then** the response SHALL include `traceId` for support reference

### Change 3: Backend Idempotency

**Given** a webhook fires for a PaymentIntent
**When** the handler attempts to create an order
**Then** it SHALL first check if an order already exists with that `stripe_payment_intent_id`
**And** if exists, it SHALL skip creation and return early

---

## Technical Implementation

### Files to Modify

1. **`apps/storefront/app/lib/logger.ts`** (NEW)
   - Create `createLogger()` factory
   - Generate trace IDs: `gt_{timestamp}_{random}`
   - JSON structured output
   - Child logger support

2. **`apps/storefront/app/routes/api.payment-intent.ts`**
   - Accept optional `paymentIntentId` parameter
   - CREATE with idempotency key when no PI ID
   - UPDATE existing PI when PI ID provided
   - Return both `clientSecret` and `paymentIntentId`
   - Add structured logging

3. **`apps/storefront/app/routes/checkout.tsx`**
   - Add `paymentIntentId` state
   - Single `useEffect` for create/update
   - Only set `clientSecret` once (on create)
   - Pass `x-trace-id` header
   - Display trace ID on errors

4. **`apps/backend/src/loaders/stripe-event-worker.ts`**
   - Add idempotency check before order creation
   - Query for existing order with same PI ID
   - Add structured logging
   - Re-throw errors for Stripe retry

### Implementation Order

1. Logger utility (no dependencies)
2. PaymentIntent lifecycle (depends on logger)
3. Backend idempotency (depends on logger)

---

## Tasks/Subtasks

- [x] 1. Create Logger Utility
  - [x] 1.1 Create `apps/storefront/app/lib/logger.ts` with `createLogger()` factory
  - [x] 1.2 Implement `generateTraceId()` function (format: `gt_{timestamp}_{random}`)
  - [x] 1.3 Implement JSON structured log output with `timestamp`, `level`, `message`, `context`
  - [x] 1.4 Add child logger support for adding context

- [x] 2. Update PaymentIntent API Route
  - [x] 2.1 Add `paymentIntentId` to request interface
  - [x] 2.2 Implement `generateIdempotencyKey()` from cart hash
  - [x] 2.3 Add CREATE vs UPDATE logic based on `paymentIntentId` presence
  - [x] 2.4 Return both `clientSecret` and `paymentIntentId` in response
  - [x] 2.5 Add structured logging throughout

- [x] 3. Update Checkout Page
  - [x] 3.1 Add `paymentIntentId` state variable
  - [x] 3.2 Consolidate to single `useEffect` for PaymentIntent management
  - [x] 3.3 Only set `clientSecret` on initial create (not updates)
  - [x] 3.4 Add error state with trace ID display

- [x] 4. Update Backend Webhook Handler
  - [x] 4.1 Add idempotency check before order creation
  - [x] 4.2 Add structured logging to webhook handler

---

## Dev Agent Record

### Implementation Plan
1. Created logger utility first (no dependencies)
2. Updated PaymentIntent API with lifecycle management
3. Updated checkout page with single useEffect pattern
4. Added idempotency to backend webhook handler

### Debug Log
- All files pass TypeScript diagnostics
- No linting errors detected

### Completion Notes
✅ All 4 tasks completed successfully:
- Logger utility with trace ID generation and JSON structured output
- PaymentIntent API now supports create OR update with idempotency keys
- Checkout page uses single PaymentIntent per session, clientSecret stable
- Backend webhook has idempotency check and structured logging

---

## File List

**New Files:**
- `apps/storefront/app/lib/logger.ts`

**Modified Files:**
- `apps/storefront/app/routes/api.payment-intent.ts`
- `apps/storefront/app/routes/checkout.tsx`
- `apps/storefront/app/components/CheckoutForm.tsx`
- `apps/backend/src/loaders/stripe-event-worker.ts`

---

## Change Log
- 2025-12-12: Initial implementation of all checkout payment flow fixes (Amelia/Dev Agent)

---

## Testing Requirements

- [ ] E2E: Complete checkout, verify single PI created in Stripe Dashboard
- [ ] E2E: Change cart during checkout, verify PI updated (not new)
- [ ] E2E: Change shipping during checkout, verify PI updated
- [ ] E2E: Simulate webhook retry, verify no duplicate order
- [ ] Unit: Logger generates valid trace IDs
- [ ] Unit: Idempotency key is deterministic for same cart
- [ ] Manual: Check Stripe Dashboard for orphaned PaymentIntents (should be none)
- [ ] Manual: Verify structured logs appear in production

---

## Success Criteria

- [ ] Single PaymentIntent per checkout session
- [ ] Cart/shipping changes UPDATE existing PI, not create new
- [ ] Structured JSON logs with trace IDs in production
- [ ] Webhook retries don't create duplicate orders
- [ ] Error messages include trace ID for support

---

## References

- Stripe Best Practices: "Create once, update as needed"
- Stripe Idempotency: https://docs.stripe.com/api/idempotent_requests
- Sprint Change Proposal: `docs/sprint/proposals/sprint-change-proposal-2025-12-12-checkout-fixes.md`
