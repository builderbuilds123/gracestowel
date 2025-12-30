# IMPL-FUL-01: Fulfillment creation/tracking is out-of-band

**Epic**: Checkout Audit Fixes
**Priority**: Medium
**Status**: Drafted

## Problem
Orders are created without fulfillments. Tracking is manual.

## Solution Overview
Auto-create fulfillment groups upon order creation or payment capture.

## Implementation Steps

### 1. Workflow (`create-order-from-stripe.ts`)
- [ ] **Create Fulfillment**: Call `fulfillmentService.createFulfillment` for the order items immediately (if auto-fulfillment is desired) or create a `FulfillmentGroup` to represent the pending shipment.

## Verification
- **Automated**:
  - Test: Create order. Verify `order.fulfillments` array is not empty (or has pending status).

## Dependencies
- SHP-01 (Need correct Shipping Option).
