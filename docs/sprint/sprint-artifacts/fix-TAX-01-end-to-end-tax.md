# IMPL-TAX-01: Taxes not modeled end-to-end

**Epic**: Checkout Audit Fixes
**Priority**: High
**Status**: Done
**Completed**: 2025-12-30

## Problem
Tax calculation is bypassed or ad-hoc (client-side sum). Modifications don't re-calculate tax reliably.

## Solution Overview
Use Medusa Cart/Order totals (which include tax provider logic) as source of truth.

## Acceptance Criteria

- [x] **AC1**: PaymentIntent amount includes `cart.tax_total` at checkout (covered by SEC-01)
- [x] **AC2**: When adding an item to an order, tax is calculated using Medusa's `calculated_price.tax_total`
- [x] **AC3**: Per-item tax amount is stored in `added_items[].tax_amount` metadata
- [x] **AC4**: Accumulated tax total is stored in `metadata.updated_tax_total`
- [x] **AC5**: Tax-inclusive regions calculate tax correctly (tax included in price)
- [x] **AC6**: Tax-exclusive regions calculate tax correctly (tax added to price)
- [x] **AC7**: Zero-tax/tax-exempt products are handled correctly
- [x] **AC8**: Multiple item additions accumulate tax properly

## Implementation Steps

### 1. Checkout
- [x] Ensure PaymentIntent amount includes `cart.tax_total`. (Covered by SEC-01 fix).

### 2. Modifications (`apps/backend/src/workflows/add-item-to-order.ts`)
- [x] **Recalculate Tax**: When adding an item, use Medusa's tax service to calculate line item tax.
- [x] **Update Order Tax Total**: Update the order's tax total field (stored in metadata as computed fields).

## Implementation Details

### Medusa v2 Tax Architecture
- In Medusa v2, `tax_total` and `subtotal` are **computed fields** calculated from line items
- Direct updates to these fields are not supported via `updateOrders`
- Tax calculation uses Medusa's `calculated_price.tax_total` as the source of truth

### Solution Approach
1. **Fetch tax per unit** from `variant.calculated_price.tax_total`
2. **Calculate total tax** for added items: `taxPerUnit * quantity`
3. **Store in metadata**:
   - Per-item tax in `added_items[].tax_amount`
   - Accumulated tax in `metadata.updated_tax_total`
   - Accumulated subtotal in `metadata.updated_subtotal`
4. These metadata values will be used when converting additions to actual line items

### Changes Made
- **`validatePreconditionsHandler`**: Fetches `tax_total` and `subtotal` from order
- **`calculateTotalsStep`**: Calculates per-unit and total tax for added items
- **`updateOrderValuesStep`**: Stores tax information in order metadata
- **Workflow**: Passes tax totals through transformation steps

### Test Coverage
Added 7 new unit tests covering:
- Tax-inclusive region calculations
- Tax-exclusive region calculations
- Zero-tax (tax-exempt) products
- Tax accumulation across multiple additions
- Metadata storage verification

## Verification
- **Automated**:
  - ✅ 7 new unit tests in `integration-tests/unit/add-item-to-order.unit.spec.ts` (28 total passing):
    - Tax-inclusive region calculations (AC5)
    - Tax-exclusive region calculations (AC6)
    - Zero-tax products (AC7)
    - Tax accumulation across multiple additions (AC8)
    - Per-item tax metadata storage (AC3)
    - Order-level tax metadata storage (AC4)

## Dependencies
- ✅ SEC-01 (Done) - PaymentIntent includes cart.tax_total

## Files Modified
- `apps/backend/src/workflows/add-item-to-order.ts`
  - Updated `validatePreconditionsHandler` to fetch `tax_total` and `subtotal`
  - Updated `calculateTotalsStep` to calculate per-unit and total tax
  - Updated `updateOrderValuesStep` to store tax in metadata
  - Added `ValidationResult` interface with tax fields

## Files Created
- `apps/backend/integration-tests/unit/add-item-to-order.unit.spec.ts` (7 new tests added)

## Dev Agent Record

- **Status**: Complete
- **Summary**: Implemented end-to-end tax calculation for order modifications during the grace period. Uses Medusa's `calculated_price.tax_total` as source of truth. Tax is tracked per-item and accumulated in order metadata since Medusa v2's `tax_total` is a computed field.
- **Implementation Notes**:
  - Medusa v2 `tax_total` and `subtotal` are computed fields (cannot be directly updated)
  - Tax stored in metadata: `added_items[].tax_amount`, `metadata.updated_tax_total`
  - When items are converted to actual line items (at capture), tax info is available for proper accounting

## Change Log

- **2025-12-30**: Initial implementation
  - Added tax calculation to add-item-to-order workflow
  - Fetches tax from `variant.calculated_price.tax_total`
  - Stores per-item tax in `added_items[].tax_amount`
  - Accumulates tax in `metadata.updated_tax_total`
  - Added 7 comprehensive unit tests
