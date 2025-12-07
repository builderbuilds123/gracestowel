# Story 1.3: Implement Express Checkout Handler

## Goal
**IMPLEMENT** the missing `onConfirm` handler for the `ExpressCheckoutElement` in `apps/storefront/app/routes/checkout.tsx`.

**Current State:**
```typescript
<ExpressCheckoutElement onConfirm={() => { }} ... />
```

## Implementation Steps

### 1. Implement Handler
- [ ] In `apps/storefront/app/routes/checkout.tsx`, update `onConfirm`:
    - Call `elements.submit()`.
    - Handle validation errors.
    - Confirm the payment using `stripe.confirmPayment` or `stripe.confirmSetup` (depending on flow).
    - **CRITICAL:** Ensure the `shippingAddress` from the wallet is synced to the Medusa Cart/Order if allowed.

### 2. Validation
- [ ] Test with Google Pay (Chrome) or Apple Pay (Safari).
- [ ] Verify `onConfirm` triggers the payment flow.

## Acceptance Criteria
- [ ] `onConfirm` handler is implemented and not empty.
- [ ] Express Checkout flow completes successfully.
- [ ] Errors are handled gracefully (e.g., payment declined).
