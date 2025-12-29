# IMPL-SHP-01: Shipping option selection not persisted

**Epic**: Checkout Audit Fixes
**Priority**: High
**Status**: Drafted

## Problem
Shipping method is sent as a raw amount to Stripe and then synthesized into the order. The actual `shipping_option_id` is lost, breaking fulfillment integrations.

## Solution Overview
Persist `shipping_option_id` on the cart.

## Implementation Steps

### 1. Storefront (`apps/storefront/app/routes/checkout.tsx`)
- [ ] **Add Shipping Method**: When user selects shipping, call Medusa API `POST /store/carts/:id/shipping-methods` with `option_id`.
- [ ] **Persist in Metadata**: If using Stripe-first flow, store `shipping_option_id` in Stripe metadata.

### 2. Order Creation (`apps/backend/src/workflows/create-order-from-stripe.ts`)
- [ ] **Use Persisted Option**: Retrieve `shipping_option_id`.
- [ ] **Create Method**: Create the order shipping method using the Option ID and its official price/data, not just the raw amount.

## Verification
- **Automated**:
  - Test: Create order with specific shipping option. Verify `order.shipping_methods[0].shipping_option_id` matches.

## Dependencies
- None.
