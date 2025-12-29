# IMPL-UX-01: Cart updateQuantity ignores color

**Epic**: Checkout Audit Fixes
**Priority**: Medium
**Status**: Drafted

## Problem
`updateQuantity` identifies items by ID only, ignoring color/variant specifics in custom cart implementations.

## Solution Overview
Update the signature to include `color` or `lineItemId`.

## Implementation Steps

### 1. Cart Context (`apps/storefront/app/context/CartContext.tsx`)
- [ ] **Update Signature**: `updateQuantity(id: string, color: string | undefined, quantity: number)`.
- [ ] **Logic**: Find the item matching `id` AND `color`.

## Verification
- **Manual**:
  - Add "Towel (Red)" and "Towel (Blue)". Update Red quantity. Verify Blue is unchanged.

## Dependencies
- None.
