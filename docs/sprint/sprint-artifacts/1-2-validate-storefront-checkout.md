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
- [ ] Create `apps/storefront/app/components/__tests__/CheckoutForm.spec.tsx`.
- [ ] Test: Renders PaymentElement container.
- [ ] Test: Handles form submission state.
- [ ] Test: Displays loading state during payment processing.

### 2. E2E Validation (Manual or Automated)
- [ ] Verify `CheckoutForm` component correctly handles the Stripe `clientSecret` from PaymentIntent.
- [ ] Ensure `return_url` is set to `/checkout/success`.
- [ ] Verify error states display correctly (e.g., card declined).

## Acceptance Criteria
- [ ] `CheckoutForm` renders without errors.
- [ ] Payment submission triggers Stripe `confirmPayment`.
- [ ] Unit/Component tests pass.
