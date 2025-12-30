# IMPL-SEC-01: Client-trust pricing & order contents

**Epic**: Checkout Audit Fixes
**Priority**: Critical
**Status**: Drafted

## Problem
The system currently trusts client-provided prices for PaymentIntent creation and order generation. This allows malicious actors to manipulate prices and order contents, leading to revenue loss and data inconsistency.

## Solution Overview
(Option A from Audit): Make Medusa cart the single source of truth.
1. MODIFY `api.payment-intent` to ignore client-provided amounts and recalculate totals from the Medusa Cart.
2. MODIFY `create-order-from-stripe` workflow to fetch the canonical Medusa Cart/Order Draft instead of trusting Stripe metadata for item prices.

## Implementation Steps

### 1. Storefront API (`apps/storefront/app/routes/api.payment-intent.ts`)
- [ ] Remove logic that sums `amount + shipping` from request body.
- [ ] Verify `cartId` exists in request or metadata.
- [ ] Fetch Medusa Cart using `cartId`.
- [ ] Use `cart.total` (Medusa canonical total) + `shipping_methods` logic to derive the true `amount` in cents.
  - *Note: Ensure MNY-01 compliance: Medusa (major) -> Stripe (minor).*
- [ ] Update `stripe.paymentIntents.create/update` to use this server-derived amount.
- [ ] Persist `medusa_cart_id` in Stripe metadata.

### 2. Backend Workflow (`apps/backend/src/workflows/create-order-from-stripe.ts`)
- [ ] Update `prepareOrderDataStep` to NOT parse prices from `metadata.cart_data` strings (e.g., "$35.00").
- [ ] Instead, fetch the Medusa Cart (or DraftOrder) referenced in metadata (or find by ID).
- [ ] Validate that the Cart's total matches the PaymentIntent's amount (within tolerance if currency conversion involved, but ideally exact).
- [ ] Use the **Cart's Line Items** (prices, variants, tax lines) to construct the Order object.
- [ ] Throw/Fail if there is a significant mismatch or if the Cart is missing.

## Verification
- **Automated**:
  - Test: Send a `POST /api/payment-intent` with a forged `amount` (e.g., 100 on a 5000 item). Verify the created PI has the *correct* (5000) amount, ignoring the client input.
  - Test: Manipulate Stripe metadata in a test case and ensure `create-order-from-stripe` rejects the order or uses the Cart's correct prices.
- **Manual**:
  - Attempt to checkout with modified JS variable for price. Confirm final Stripe charge is correct.

## Dependencies
- MNY-01 (Money unit mismatch) - ensure we convert correctly.
