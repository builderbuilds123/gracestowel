# IMPL-FUL-01: Fulfillment creation/tracking is out-of-band

## User Story

**As a** Customer Service Rep,
**I want** fulfillments to be automatically created and linked to orders,
**So that** I can track shipping status and customers automatically receive shipping confirmations.

## Acceptance Criteria

### Scenario 1: Auto-Creation

**Given** a new order is successfully placed (and paid)
**When** the order workflow completes
**Then** a Fulfillment (or Fulfillment Group) should be created for the items
**And** it should be in a 'not_fulfilled' or 'pending' state ready for the warehouse

### Scenario 2: Shipping Confirmation

**Given** a Fulfillment has been created
**When** the Fulfillment is marked as 'shipped' (tracking added)
**Then** the "Order Shipped" email workflow should be triggered automatically

## Technical Implementation Plan (Original)

### Problem

Orders are created without fulfillments. Tracking is manual.

### Solution Overview

Auto-create fulfillment groups upon order creation or payment capture.

### Implementation Steps

#### 1. Workflow (`create-order-from-stripe.ts`)


- [ ] **Create Fulfillment**: Call `fulfillmentService.createFulfillment` for the order items immediately (if auto-fulfillment is desired) or create a `FulfillmentGroup` to represent the pending shipment.

### Verification


- **Automated**:

  - Test: Create order. Verify `order.fulfillments` array is not empty (or has pending status).

### Dependencies


- SHP-01 (Need correct Shipping Option).
