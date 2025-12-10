# Story 1.2: Validate Storefront Checkout UI

## Goal
Validate the **EXISTING** checkout UI in `apps/storefront/app/routes/checkout.tsx`.

## Related Files
- **Checkout Page:** `apps/storefront/app/routes/checkout.tsx`
- **Checkout Form:** `apps/storefront/app/components/CheckoutForm.tsx`
- **Stripe Init:** `apps/storefront/app/lib/stripe.ts`
- **PaymentIntent API:** `apps/storefront/app/routes/api.payment-intent.ts`

## Implementation Steps

### 1. Component Testing
- [x] Create `apps/storefront/app/components/__tests__/CheckoutForm.spec.tsx`.
- [x] Test: Renders PaymentElement container.
- [x] Test: Handles form submission state.
- [x] Test: Displays loading state during payment processing.

### 2. E2E Validation (Manual or Automated)
- [x] Verify `CheckoutForm` component correctly handles the Stripe `clientSecret` from PaymentIntent.
- [x] Ensure `return_url` is set to `/checkout/success`.
- [x] Verify error states display correctly (e.g., card declined).

### 3. Bug Fix
- [x] Fixed null check for error object in `handleSubmit` to prevent crash.

## Acceptance Criteria
- [x] `CheckoutForm` renders without errors.
- [x] Payment submission triggers Stripe `confirmPayment`.
- [x] Unit/Component tests pass.

## Dev Agent Record
- **Completion Notes**:
    - Validated `CheckoutForm.tsx` via component tests.
    - Fixed a potential crash in `CheckoutForm` regarding error object handling.
    - Implemented comprehensive mocks for Stripe Elements, `window.location`, and `localStorage`.
    - Tests passing: 6/6.

## Senior Developer Review (AI)
- **Actions Taken**:
    - [x] Fixed M1: Replaced hardcoded Stripe Publishable Key in `app/lib/stripe.ts` with `VITE_STRIPE_PUBLISHABLE_KEY`.
    - [x] Fixed M2: Updated `CheckoutForm` to divide amount by 100 for correct cents-to-dollars display.
    - [x] Fixed M3: Added test for `elements` null check.
    - [x] Fixed L2: Added Bug Fix task to story file.

## Status
Complete
