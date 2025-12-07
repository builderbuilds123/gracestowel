# Story 1.2: Storefront Payment Element

## Goal
Implement the secure, PCI-compliant Stripe Payment Element on the checkout page.

## Implementation Steps

### 1. Storefront Setup
- [ ] Run `npm install @stripe/react-stripe-js @stripe/stripe-js` in `apps/storefront`.
- [ ] Create `apps/storefront/app/components/Checkout/PaymentElement.tsx`.

### 2. Medusa Integration
- [ ] Ensure `MedusaPaymentSession` is passed to the component.
- [ ] Initialize `Elements` provider with the `client_secret` from the session.

### 3. Verification
- [ ] Go to `/checkout`.
- [ ] Verify the Card form appears.
- [ ] Test with a Stripe Test Card (4242...).
- [ ] Verify successful submission redirects to success page.

## Acceptance Criteria
- [ ] Stripe Payment Element renders on Checkout.
- [ ] Supports Cards (Wallets handled in 1.3).
- [ ] `return_url` correctly set to `/checkout/success`.
- [ ] PCI Compliant (Hosted Fields).
