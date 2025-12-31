# IMPL-RET-02: Stripe PaymentIntent ↔ Order Link (O(1) Lookup)

**Epic**: Checkout Audit Fixes  
**Priority**: High  
**Status**: Draft  

## Story

**As a** System Maintainer,
**I want** an efficient and reliable way to look up orders by their PaymentIntent ID,
**So that** refund and capture webhooks can process transactions quickly and accurately without scanning the entire order table.

**Acceptance Criteria:**

**Given** a Stripe PaymentIntent ID is received via a webhook
**When** the system looks up the corresponding order
**Then** the lookup should utilize a dedicated index or link table (O(1) complexity)
**And** it should not perform a full-table or large range scan
**And** unique constraints should prevent duplicate mappings
**And** multiple partial refunds should be processed correctly without duplicate transactions

## Problem

Refund and capture flows rely on an in-memory scan of the latest 5000 orders (`findOrderByPaymentIntentId`) to map a Stripe PaymentIntent to an order. This is O(n), can miss older orders, and risks skipped refunds in busy stores.

## Solution Overview

Create a dedicated Stripe PaymentIntent → Order link (small custom module) with unique constraints for O(1) lookup, and refactor webhook handlers to use it. No legacy backfill or fallbacks are required in this development phase.

## Implementation Steps

### 1) Link Model & Service (new module)


- [ ] Add model/table `stripe_payment_intent_links` with columns: `id (uuid PK)`, `payment_intent_id (text, UNIQUE, NOT NULL)`, `order_id (uuid FK order, UNIQUE, NOT NULL)`, timestamps.

- [ ] Create service `stripePaymentIntentLinkService` exposing: `createLink({ payment_intent_id, order_id })`, `findByPaymentIntentId(id)`, `findByOrderId(orderId)`.

- [ ] Enforce idempotency via unique constraints (on-conflict-do-nothing or handled error).

### 2) Write Path Integration


- [ ] In `create-order-from-stripe` workflow (order creation), insert link after order creation using the PaymentIntent ID.

- [ ] In refund/other Stripe webhook handlers, ensure link creation is invoked if absent (but do not backfill historical data).

### 3) Read Path Refactor


- [ ] Replace `findOrderByPaymentIntentId` scan with link lookup → fetch order by ID.

- [ ] Remove/skip the 5000-order scan path; fail with clear warning if link missing (dev phase).

### 4) Tests


- [ ] Unit: link service create/find, uniqueness/idempotency behavior.

- [ ] Integration: PaymentIntent order creation writes link; refund webhook resolves order via link; multiple partial refunds still work (no duplicate transactions).

- [ ] Regression: no in-memory scans; lookup is O(1).

## Acceptance Criteria


- O(1) lookup for PaymentIntent → Order using dedicated link; no pagination scans.

- Unique constraints prevent duplicate mappings (one PI ↔ one order).

- Refund and capture handlers succeed for multiple partial refunds of the same PaymentIntent (no dropped transactions).

- Tests covering service, workflow integration, and webhook flows are passing.

- No backfill/fallback paths included in this story (dev-phase only).

## Dependencies


- None (no backfill or migration of historical data required).

## File List (expected)


- `apps/backend/src/modules/stripe-payment-intent-link/*` (new module: model/service/index)

- `apps/backend/src/workflows/create-order-from-stripe.ts` (write-path link insert)

- `apps/backend/src/loaders/stripe-event-worker.ts` (read-path lookup + optional link insert)

- `apps/backend/src/utils/find-order-by-payment-intent.ts` or equivalent helper (refactored lookup)

- `apps/backend/integration-tests/unit/stripe-payment-intent-link.*.spec.ts` (new tests)

- `apps/backend/integration-tests/unit/charge-refunded-webhook.unit.spec.ts` (updated coverage)

## Verification


- **Automated**:

  - Unit tests for link service uniqueness/idempotency and lookup.

  - Integration tests: order creation writes link; charge.refunded resolves via link; multiple partial refunds processed without duplicate transactions.

  - Assert no use of in-memory order scans for PaymentIntent lookup.
