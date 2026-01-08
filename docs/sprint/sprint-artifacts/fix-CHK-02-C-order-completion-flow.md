# IMPL-CHK-02-C: Order Completion & Cleanup

**Epic**: Checkout Audit Fixes  
**Priority**: Critical  
**Status**: Draft  
**Type**: Implementation  
**Estimated Effort**: Medium (0.5 day)

---

## Story

**As a** developer  
**I want** to standardize the order completion flow  
**So that** carts are correctly converted to orders via Medusa v2 standards

---

## Problem Statement

Currently, order completion relies on a race-prone webhook or broken cart completion endpoint. We need to standardize on `POST /store/carts/:id/complete`.

---

## Acceptance Criteria

1.  **AC1**: `POST /store/carts/:id/complete` is called after successful Stripe Payment
2.  **AC2**: Order is created successfully in Medusa
3.  **AC3**: Legacy `/api/payment-intent` route is removed/deprecated
4.  **AC4**: Shipping updates correctly update the Payment Collection amount

---

## Technical Details

**Key Change:**
- Ensure `payment_collection_id` is linked to cart before completion
- Verify `cart.complete()` handles the "Authorized" payment status correctly

---

## Tasks

- [ ] 3.1 Implement final cart completion call in `checkout.tsx` `handleSubmit`
- [ ] 3.2 Add Integration Test: full flow (Cart -> Payment Collection -> Session -> Order)
- [ ] 3.3 Validate shipping changes trigger `payment-collection` updates
- [ ] 3.4 Cleanup old code
