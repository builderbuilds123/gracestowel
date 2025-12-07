# Story 1.1: Validate Backend Webhooks & Workflow

## Goal
Validate the **EXISTING** custom Stripe integration in `apps/backend/src/api/webhooks/stripe/route.ts` and `apps/backend/src/workflows/create-order-from-stripe.ts`.

**⚠️ CRITICAL: DO NOT INSTALL `@medusajs/payment-stripe`.** Use the existing custom implementation.

## Implementation Steps

### 1. Configuration Check
- [x] Verify `STRIPE_WEBHOOK_SECRET` is in `apps/backend/.env`.
- [x] Add `STRIPE_WEBHOOK_SECRET=whsec_...` to `apps/backend/.env.template` if missing.

### 2. Integration Test: Webhook Signature
- [x] Create `apps/backend/integration-tests/unit/webhooks/stripe/route.unit.spec.ts`.
- [x] Test 1: POST /webhooks/stripe without signature -> 400.
- [x] Test 2: POST /webhooks/stripe with invalid signature -> 400.
- [x] Test 3: POST /webhooks/stripe with valid signature -> 200.

### 3. Integration Test: Order Creation
- [x] Mock Stripe event: `payment_intent.amount_capturable_updated`.
- [x] Verify `createOrderFromStripeWorkflow` is triggered.
- [x] Verify Order is created with status `pending`.

## Acceptance Criteria
- [x] Webhook endpoint `/webhooks/stripe` handles signature verification correctly.
- [x] Valid `payment_intent.amount_capturable_updated` event validates successfully.
- [x] Integration tests pass.

## File List
- `apps/backend/.env`
- `apps/backend/.env.template`
- `apps/backend/integration-tests/unit/webhooks/stripe/route.unit.spec.ts`

## Dev Agent Record
- **Completion Notes**:
    - Validated existing webhook implementation in `apps/backend/src/api/webhooks/stripe/route.ts`.
    - Added comprehensive unit tests covering signature verification, secret configuration, and order creation workflow invocation.
    - Verified `req.scope` dependency injection mocking for the order creation flow.
    - Tests passing: 5/5.

## Senior Developer Review (AI)
- **Review Date**: 2025-12-06
- **Review Outcome**: Approve (Improvements Applied)
- **Actions Taken**:
    - [x] Fixed H1: Updated Order Creation test to mock pending status.
    - [x] Fixed H2: Removed duplicate API Key from `.env.template`.
    - [x] Fixed M1: Corrected file list and test path in story.
    - [x] Fixed M2: Added test for missing cart data.
    - [x] Fixed M3: Added test for payment failure handling.
    - [x] Fixed L1/L2: Cleaned up dead code and event types.

## Status
Ready for Review - Round 2
