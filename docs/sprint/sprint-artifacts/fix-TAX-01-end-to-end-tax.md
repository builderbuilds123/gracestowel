# IMPL-TAX-01: Taxes not modeled end-to-end

**Epic**: Checkout Audit Fixes
**Priority**: High
**Status**: Drafted

## Problem
Tax calculation is bypassed or ad-hoc (client-side sum). Modifications don't re-calculate tax reliably.

## Solution Overview
Use Medusa Cart/Order totals (which include tax provider logic) as source of truth.

## Implementation Steps

### 1. Checkout
- [ ] Ensure PaymentIntent amount includes `cart.tax_total`. (Covered by SEC-01 fix).

### 2. Modifications (`apps/backend/src/workflows/add-item-to-order.ts`)
- [ ] **Recalculate Tax**: When adding an item, use Medusa's tax service to calculate line item tax.
- [ ] **Update Order Tax Total**: Update the order's tax total field.

## Verification
- **Automated**:
  - Test: Add item to order in tax-inclusive region. Verify order total increases by Price + Tax (or Price includes Tax). Verify `tax_total` is updated.

## Dependencies
- SEC-01.
