# Story 1.4: Auth-Only Configuration

## Goal
Configure the Stripe integration to use `capture_method: manual` (Auth-Only), enabling the 1-hour grace period logic.

## Implementation Steps

### 1. Payment Intent Config
- [ ] In `apps/backend`, identify where `createPaymentSession` or `createPaymentIntent` is handled.
- [ ] Ensure the option `capture_method: "manual"` is passed to the Stripe Provider.
- [ ] Verify `automatic_payment_methods` does not override this (some APMs don't support manual capture).

### 2. Medusa Order Status
- [ ] Verify that upon authorization, the Order Status in Medusa becomes `pending` (and Payment Status `awaiting` or `authorized`), NOT `captured`.

### 3. Verification
- [ ] Complete a full checkout.
- [ ] Check Stripe Dashboard > Payments.
- [ ] The payment should say "Uncaptured" or "Authorized".
- [ ] The customer's bank should show a "Pending" charge, not a settled one.

## Acceptance Criteria
- [ ] Stripe Payment Intent created with `capture_method: manual`.
- [ ] No funds automatically captured at checkout.
- [ ] Order created successfully in Medusa with `authorized` payment status.
