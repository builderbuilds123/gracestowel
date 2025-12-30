# IMPL-ORD-01: 'Add items' workflow is metadata-only

**Epic**: Checkout Audit Fixes
**Priority**: High
**Status**: Drafted

## Problem
The "Add items" workflow only updates order metadata (`metadata.added_items`) and `updated_total`. It does not create actual Medusa order line items. This means fulfillment workflows and inventory systems (which look at `order.items`) verify strictly against the original order, ignoring the added items.

## Solution Overview
Implement a real order edit workflow using Medusa's Order Edit or Order Change features (or manually inserting line items if v2 requires it).

## Implementation Steps

### 1. Backend Workflow (`apps/backend/src/workflows/add-item-to-order.ts`)
- [ ] **Create Line Item**: Instead of just updating metadata, use `orderService.createLineItems` (or `orderService.update` with items) to insert the new item into the database.
- [ ] **Update Order Total**: Ensure the core `order.total` is updated (not just metadata).
- [ ] **Update Payment Collection**: Fetch the order's Payment Collection and update its `amount` and the linked `Payment.amount` to match the new order total.
- [ ] **Inventory Reservation**: Explicitly call inventory service to reserve stock for the new item.
- [ ] **Metadata Cleanup**: Remove reliance on `metadata.added_items` as the source of truth; use `order.items`.

### 2. Guest View (`apps/backend/src/api/store/orders/[id]/guest-view/route.ts`)
- [ ] Ensure the query returns the updated `order.items` list (it should automatically if the DB is updated).

## Verification
- **Automated**:
  - Test: Add item to order. Fetch order via Medusa Admin API. Verify `items` array contains the new item.
  - Test: Verify inventory quantity allows for the new item and is decremented/reserved.

## Dependencies
- ORD-02 (Post-auth amount increases) - ensure the payment update logic handles the new total.
