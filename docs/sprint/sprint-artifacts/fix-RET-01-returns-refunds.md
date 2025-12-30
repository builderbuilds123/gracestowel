# IMPL-RET-01: Returns/refunds not modeled

**Epic**: Checkout Audit Fixes
**Priority**: High
**Status**: Drafted

## Problem
Refunds are manual-only and do not update Medusa order status or create Return records.

## Solution Overview
Implement webhook listener for `charge.refunded` or `payment_intent.canceled` to trigger Medusa logic.

## Implementation Steps

### 1. Webhook Handler (`apps/backend/src/loaders/stripe-event-worker.ts`)
- [ ] **Handle Refund**: Listen for `charge.refunded`.
- [ ] **Create Swap/Return**: Call Medusa's `orderService.registerReturn` or `createRefund`.
- [ ] **Update Status**: Ensure order status updates to `refunded` or `partially_refunded`.

## Verification
- **Automated**:
  - Test: Mock `charge.refunded` webhook. Verify order status update.

## Dependencies
- PAY-01 (Payment models).
