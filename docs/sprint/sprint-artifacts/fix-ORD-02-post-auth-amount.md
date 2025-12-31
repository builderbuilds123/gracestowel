# IMPL-ORD-02: Post-auth amount increases are inconsistent

## User Story

**As a** Store Owner,
**I want** modifications that increase the order total to be handled reliably,
**So that** I can capture the full amount for upsells without technical errors.

## Acceptance Criteria

### Scenario 1: Incremental Authorization

**Given** an order with an authorized payment
**When** I increase the quantity of an item (increasing the total)
**Then** the system should attempt to increment the Stripe authorization
**And** update the Payment Collection amount in Medusa

### Scenario 2: Graceful Failure

**Given** an order where the payment provider usually declines increments
**When** the increment fails
**Then** the modification workflow should rollback (revert quantity)
**And** return a readable error message to the user

## Technical Implementation Plan (Original)

### Problem

Adding items tries to update the PaymentIntent amount, but updating quantity throws an error if the amount increases after authorization (`requires_capture`), leading to inconsistent behavior.

### Solution Overview

Standardize behavior. Option B (Implement incremental authorization) is complex. Option A (Disallow increases) is safer for now.
*Decision*: Implement **Incremental Authorization** if possible (Stripe supports it), OR fail gracefully with a "Contact Support" or "New Order Required" message.
Given the codebase attempts to update amount in `add-item`, let's try to support it consistently.

### Implementation Steps

#### 1. Update Workflow (`apps/backend/src/workflows/update-line-item-quantity.ts`)


- [ ] Remove the check that throws if `newAmount > authorizedAmount` when status is `requires_capture`.

- [ ] Instead, allow the `stripe.paymentIntents.update` call to proceed (which attempts to increment authorization).

- [ ] **Update Payment Collection**: Update the Payment Collection Amount to reflect the new total.

- [ ] Handle Stripe failures (e.g., "insufficient funds", "cannot capture more than authorized") gracefully:

  - If increment fails, revert the quantity change and return a user-friendly error (e.g., "Card declined for additional amount").

#### 2. Common Utility


- [ ] Extract the "Update Stripe Amount & Payment Collection" logic into a reusable step/service used by both `add-item` and `update-quantity` to ensure identical behavior.

### Verification


- **Automated**:

  - Test: Update quantity (increase price). Mock Stripe success. Verify PI amount updated.

  - Test: Mock Stripe failure. Verify workflow rolls back and returns error.

### Dependencies


- None.
