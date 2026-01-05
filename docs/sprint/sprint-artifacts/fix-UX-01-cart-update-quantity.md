# IMPL-UX-01: Cart updateQuantity ignores color

**Epic**: Checkout Audit Fixes
**Priority**: Medium
**Status**: Ready for Dev
## Story

**As a** Customer,
**I want** to be able to adjust the quantity of cart items with specific variants (e.g., color),
**So that** I can buy exactly what I want without accidentally affecting other items in my cart.

**Acceptance Criteria:**

**Given** a customer uses the cart interface
**When** they update the quantity of a specific item variant (e.g., Red Towel)
**Then** the system should identify the item by both ID and variant attributes (e.g., color)
**And** only the target variant's quantity should be updated
**And** other variants of the same product should remain unchanged

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
