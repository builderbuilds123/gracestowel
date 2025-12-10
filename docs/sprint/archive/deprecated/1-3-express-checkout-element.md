# Story 1.3: Express Checkout Element

## Goal
Implement the frictionless "Express Checkout" button (Apple Pay / Google Pay) for mobile and quick-buy users.

## Implementation Steps

### 1. Storefront Component
- [ ] Implement `ExpressCheckoutElement` from `@stripe/react-stripe-js` in `apps/storefront`.
- [ ] Place it at the top of the Checkout flow (Cart or Payment Step).

### 2. Logic Handling
- [ ] Handle `onClick` events to sync Medusa Cart state.
- [ ] Handle `onConfirm` to submit the Payment Session to Medusa.
- [ ] Note: Shipping Address handling is complex; MVP focus on Payment Step execution where address is already known, OR implement `onShippingAddressChange` callbacks.

### 3. Verification
- [ ] Use Chrome (Google Pay) or Safari (Apple Pay) to test.
- [ ] Verify wallet sheet opens.
- [ ] Verify successful payment.

## Acceptance Criteria
- [ ] "Express Checkout" button visible on supported devices.
- [ ] Clicking launches native wallet.
- [ ] Success redirects to order confirmation.
