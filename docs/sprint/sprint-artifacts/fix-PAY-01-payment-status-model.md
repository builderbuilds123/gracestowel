# IMPL-PAY-01: Payment status model deviates from Medusa v2

**Epic**: Checkout Audit Fixes
**Priority**: High
**Status**: Drafted

## Problem
The system uses `order.metadata.payment_status` instead of Medusa's canonical `PaymentCollection`, `PaymentSession`, and `OrderTransaction` models. This breaks standard Medusa admin workflow and reporting.

## Solution Overview
Align with Medusa's Payment Module.

## Implementation Steps

### 1. Order Creation (`apps/backend/src/workflows/create-order-from-stripe.ts`)
- [ ] **Create Payment Collection**: Ensure a PaymentCollection is created for the order (if not existing from cart).
- [ ] **Data Linking**: Store the Stripe PaymentIntent ID in the `data` field of the Payment Session/Collection.
- [ ] **Record Payment**: Create a `Payment` record in Medusa linked to the order, mirroring the Stripe PI state (authorized/captured).

### 2. Capture Worker (`apps/backend/src/workers/payment-capture-worker.ts`)
- [ ] **Update Payment Module**: Instead of updating metadata, use `paymentModuleService.capturePayment(...)`.
- [ ] **Create Transaction**: Ensure an OrderTransaction is created for the capture.

## Verification
- **Automated**:
  - Test: Create order. Capture payment. Query Medusa Admin API `GET /admin/orders/:id`. Verify `payment_status` is correct (standard field) and `payments` array has the capture.

## Dependencies
- RET-01 (Returns/Refunds) - needs standard payment model to work.
