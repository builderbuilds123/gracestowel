# IMPL-INV-01: Inventory decrement is non-atomic

**Epic**: Checkout Audit Fixes
**Priority**: High
**Status**: Drafted

## Problem
Inventory is decremented by reading `stocked_quantity` and writing back `current - quantity` without locking, allowing overselling.

## Solution Overview
Use atomic database increments or Medusa's inventory service reservation system.

## Implementation Steps

### 1. Workflow (`apps/backend/src/workflows/create-order-from-stripe.ts`)
- [ ] **Use Inventory Service**: Replace manual DB write with `inventoryService.confirmInventory` or `reserveInventory`.
- [ ] **Atomic Decrement**: If manual update is kept, use `req.em.nativeUpdate(..., { stocked_quantity: () => 'stocked_quantity - ' + quantity })` (MikroORM).

## Verification
- **Automated**:
  - Test: Concurrent order creation (simulate race). verification via `stocked_quantity` check.

## Dependencies
- None.
