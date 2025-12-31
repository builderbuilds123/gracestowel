# IMPL-RET-01: Returns/refunds not modeled

**Epic**: Checkout Audit Fixes
**Priority**: High
**Status**: Done
**Completed**: 2025-12-30

## Problem
Refunds are manual-only and do not update Medusa order status or create Return records.

## Solution Overview
Implement webhook listener for `charge.refunded` to trigger Medusa logic that updates PaymentCollection status, creates OrderTransaction records, and updates order status.

## Implementation Steps

### 1. Webhook Handler (`apps/backend/src/loaders/stripe-event-worker.ts`)
- [x] **Handle Refund**: Listen for `charge.refunded`.
- [x] **Update PaymentCollection**: Update status to "canceled" for full refunds, "completed" for partial refunds.
- [x] **Create OrderTransaction**: Create refund transaction record with negative amount.
- [x] **Update Order Status**: Set order status to "canceled" for full refunds.

## Implementation Details

### Webhook Handler
The `handleChargeRefunded` function processes Stripe `charge.refunded` webhooks:

1. **Extract PaymentIntent ID** from the charge object
2. **Find Order** by querying orders with matching `stripe_payment_intent_id` in metadata
3. **Determine Refund Type**: Full refund if `charge.refunded === true` OR `charge.amount_refunded === charge.amount`
4. **Update PaymentCollection**:
   - Full refund → status: "canceled"
   - Partial refund → status: "completed" (tracked via OrderTransactions)
5. **Create OrderTransaction**:
   - Negative amount to represent money going back to customer
   - Reference type: "refund"
   - Reference ID: PaymentIntent ID
6. **Update Order Status**: Set to "canceled" only for full refunds

### Error Handling
- Missing PaymentIntent: Log warning, skip processing
- Order not found: Log warning, skip processing
- Missing PaymentCollection: Log error, continue with OrderTransaction creation
- PaymentCollection update failure: Log error, continue processing
- OrderTransaction creation failure: Log error, continue processing
- Order status update failure: Log error, don't throw (refund already processed in Stripe)

### Currency Units
- Stripe webhooks provide amounts in cents (minor units)
- Medusa v2 expects amounts in major units (dollars)
- Conversion: `amountInMajorUnits = amountCents / 100`
- OrderTransaction amounts are **negative** for refunds

## Verification
- **Automated**:
  - ✅ 9 unit tests passing in `integration-tests/unit/charge-refunded-webhook.unit.spec.ts`:
    - Full refund scenarios (2 tests)
    - Partial refund scenarios (2 tests)
    - Edge cases (4 tests): missing payment_intent, order not found, no PaymentCollection, PaymentCollection update failure
    - Currency handling (1 test): EUR currency support

## Dependencies
- ✅ PAY-01 (Payment models) - DONE

## Files Modified
- `/Users/leonliang/Github Repo/gracestowel/apps/backend/src/loaders/stripe-event-worker.ts`
  - Added `handleChargeRefunded` function
  - Added `updatePaymentCollectionOnRefund` function
  - Added `createOrderTransactionOnRefund` function
  - Added `updateOrderStatusOnFullRefund` function
  - Added `charge.refunded` case to event switch statement
  - Added `Modules` import for Order and Payment module resolution

## Files Created
- `/Users/leonliang/Github Repo/gracestowel/apps/backend/integration-tests/unit/charge-refunded-webhook.unit.spec.ts`
  - Comprehensive test suite with 9 passing tests
  - Tests full refunds, partial refunds, edge cases, and currency handling

## Notes
- Refunds do **not** create Return records in Medusa (not required for basic refund functionality)
- Return records would be needed for return merchandise authorization (RMA) workflows
- Current implementation focuses on financial tracking via PaymentCollection and OrderTransactions
- Partial refunds keep order status as "completed" and are tracked via OrderTransaction history
- OrderTransaction records enable downstream features to calculate refundable amounts
