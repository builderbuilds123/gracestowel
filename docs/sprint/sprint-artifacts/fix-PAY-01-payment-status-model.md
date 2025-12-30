# IMPL-PAY-01: Payment Status Model Alignment with Medusa v2

**Epic**: Checkout Audit Fixes  
**Priority**: High  
**Status**: Drafted  
**Type**: Architecture Refactor  
**Estimated Effort**: Large (Multi-Sprint)

---

## Story

**As a** system maintainer  
**I want** payment state tracked using Medusa's canonical Payment Module  
**So that** Admin workflows, reporting, refunds, and downstream integrations work correctly

---

## Problem Statement

The current system bypasses Medusa v2's Payment Module entirely:
- Orders are created via Stripe webhooks without `PaymentCollection` records
- Payment capture updates `order.metadata.payment_status` (non-canonical)
- No `OrderTransaction` records are created for captures/refunds
- Cancellation logic reads from metadata, not Payment Module

**Reference**: [checkout-flow-issues-audit.md](../analysis/checkout-flow-issues-audit.md) lines 353-408

---

## Current Architecture

```
Storefront → Stripe API (direct) → Stripe Webhook → create-order-from-stripe.ts
                                                           ↓
                                              Order (no PaymentCollection)
                                                           ↓
                                        payment-capture-worker.ts → Stripe capture
                                                           ↓
                                        order.metadata.payment_status = "captured"
```

**Problem Files**:
- `apps/backend/src/workflows/create-order-from-stripe.ts` - No PaymentCollection creation
- `apps/backend/src/workers/payment-capture-worker.ts` - Uses metadata, not Payment Module
- `apps/backend/src/loaders/stripe-event-worker.ts` - Duplicates metadata updates

---

## Target Architecture

```
Storefront → Stripe API → Stripe Webhook → create-order-from-stripe.ts
                                                      ↓
                                          Order + PaymentCollection + Payment
                                                      ↓
                                        payment-capture-worker.ts
                                                      ↓
                                        paymentModuleService.capturePayment()
                                                      ↓
                                        OrderTransaction (capture event)
```

---

## Acceptance Criteria

1. **AC1**: Orders created via Stripe webhook have a linked `PaymentCollection` with provider `pp_stripe`
2. **AC2**: `PaymentCollection` contains a `Payment` record with Stripe PaymentIntent ID in `data` field
3. **AC3**: Payment capture uses `paymentModuleService.capturePayment()`, not direct Stripe + metadata
4. **AC4**: Capture creates an `OrderTransaction` record of type `capture`
5. **AC5**: `GET /admin/orders/:id` returns canonical `payment_status` and `payments` array
6. **AC6**: Cancellation/refund logic reads from Payment Module, not `order.metadata.payment_status`

---

## Tasks/Subtasks

### Phase 1: Payment Collection Creation
- [ ] 1.1 Research Medusa v2 Payment Module service APIs (`paymentModuleService`)
- [ ] 1.2 Modify `create-order-from-stripe.ts` to create PaymentCollection on order creation
- [ ] 1.3 Create Payment record with Stripe PI ID in `data` field
- [ ] 1.4 Link PaymentCollection to Order via `order.payment_collection_id`

### Phase 2: Capture Refactor
- [ ] 2.1 Research `paymentModuleService.capturePayment()` signature and behavior
- [ ] 2.2 Refactor `payment-capture-worker.ts` to use Payment Module instead of direct Stripe
- [ ] 2.3 Ensure OrderTransaction is created for capture
- [ ] 2.4 Remove/deprecate `metadata.payment_status` updates

### Phase 3: Downstream Alignment
- [ ] 3.1 Update `cancel-order-with-refund.ts` to read from Payment Module
- [ ] 3.2 Update any other code reading `metadata.payment_status`
- [ ] 3.3 Update Admin API responses to include canonical payment fields

### Phase 4: Testing & Migration
- [ ] 4.1 Unit tests for Payment Module integration
- [ ] 4.2 Integration tests for full order → capture → admin view flow
- [ ] 4.3 Migration script for existing orders (optional)

---

## Dev Notes

### Key Files
| File | Current Role | Target Change |
|------|--------------|---------------|
| `create-order-from-stripe.ts` | Creates order only | + Create PaymentCollection |
| `payment-capture-worker.ts` | Direct Stripe + metadata | Use `paymentModuleService` |
| `stripe-event-worker.ts` | Metadata updates | Remove duplicates |
| `cancel-order-with-refund.ts` | Reads `metadata.payment_status` | Read Payment Module |

### Medusa v2 References
- [Payment Collection](https://docs.medusajs.com/resources/commerce-modules/payment/payment-collection)
- [Payment Session](https://docs.medusajs.com/resources/commerce-modules/payment/payment-session)
- [Order Transactions](https://docs.medusajs.com/resources/commerce-modules/order/transactions)

### Risk Assessment
- **High Risk**: Changes to payment capture path - requires thorough testing
- **Breaking Change**: Code reading `metadata.payment_status` will need updates
- **Recommended**: Feature flag for gradual rollout

---

## Dependencies

- **Blocking**: None (can implement independently)
- **Blocked By This**: 
  - RET-01 (Returns/Refunds) - needs OrderTransaction model
  - TAX-01 (Taxes) - ties into transaction recording

---

## Dev Agent Record

### Implementation Plan
*To be filled during implementation*

### Completion Notes
*To be filled on completion*

---

## Status
- **Drafted**: 2025-12-29 - Initial creation from audit analysis
