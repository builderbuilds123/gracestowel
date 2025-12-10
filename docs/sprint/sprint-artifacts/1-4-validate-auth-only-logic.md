# Story 1.4: Validate Auth-Only & Stock Logic

## Goal
Validate the **EXISTING** Auth-Only configuration in `apps/storefront/app/routes/api.payment-intent.ts`.

## Implementation Steps

### 1. Configuration Verification
- [ ] Verify `capture_method: "manual"` is present in `apps/storefront/app/routes/api.payment-intent.ts`.
- [ ] Verify `automatic_payment_methods` is configured correctly.

### 2. Stock Validation Logic
- [ ] Review `validateStock` function in `api.payment-intent.ts`.
- [ ] Ensure it correctly checks inventory from Medusa.

### 3. Integration Check
- [ ] Create a test order.
- [ ] Check Stripe Dashboard: Payment should be **Uncaptured**.
- [ ] Check Medusa Admin: Order status should be **Pending** (or Authorized).

## Acceptance Criteria
- [ ] PaymentIntents are created with `capture_method: manual`.
- [ ] Stock validation prevents checkout if items are OOS.
- [ ] Test order confirms "Auth-Only" behavior.
