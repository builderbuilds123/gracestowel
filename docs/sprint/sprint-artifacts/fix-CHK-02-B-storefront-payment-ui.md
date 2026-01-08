# IMPL-CHK-02-B: Storefront UI Payment Integration

**Epic**: Checkout Audit Fixes  
**Priority**: Critical  
**Status**: Draft  
**Type**: Implementation  
**Estimated Effort**: Medium (0.5 day)

---

## Story

**As a** customer  
**I want** the checkout payment form to load reliably  
**So that** I can pay without seeing errors

---

## Problem Statement

The checkout UI currently calls `/api/payment-intent` which is deprecated. It needs to be refactored to use the new Payment Collection IDs.

---

## Acceptance Criteria

1.  **AC1**: Checkout page initializes PaymentCollection on mount (if valid cart)
2.  **AC2**: Payment Session is created/retrieved before showing PaymentElement
3.  **AC3**: Stripe Elements (`<PaymentElement />`) renders using the `client_secret` from the Payment Session
4.  **AC4**: No regression in "Shipping Address" vs "Billing Address" state

---

## Technical Details

**Files:**
- `apps/storefront/app/routes/checkout.tsx`
- `apps/storefront/app/components/CheckoutForm.tsx`

**Components:**
- Remove direct call to `/api/payment-intent`
- Add calls to `/api/payment-collections`
- Store `paymentCollection.id` in React State

---

## Tasks

- [ ] 2.1 Refactor `checkout.tsx` `loader` or `useEffect` to initialize PaymentCollection
- [ ] 2.2 Update PaymentElement wrapper to use new session data
- [ ] 2.3 Verify Express Checkout (Apple/Google Pay) still initializes correctly
