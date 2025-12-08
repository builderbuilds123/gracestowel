# Story 2.1: Fix Modification Token Flow

## Goal
Ensure the **Modification Token** (JWT), which is correctly generated during order creation, is successfully passed to the `send-order-confirmation` workflow so it can be included in the customer's email.

## Context
- **Epic**: [Epic 2: Grace Period & Delayed Capture Engine](../product/epics/payment-integration.md)
- **Problem**: `create-order-from-stripe.ts` generates the token and emits it in `order.placed`. The `order-placed` subscriber receives it but **fails to pass it** to the `sendOrderConfirmationWorkflow`. The workflow then re-fetches the order from the DB (where the token doesn't exist) and sends the email without the token.
- **Existing Code**: 
    - `src/services/modification-token.ts` (Working JWT logic)
    - `src/subscribers/order-placed.ts` (Drops the token)
    - `src/workflows/send-order-confirmation.ts` (Accepts only ID)

## Implementation Steps

### 1. Update Subscriber
- [x] Modify `apps/backend/src/subscribers/order-placed.ts`.
- [x] In `orderPlacedHandler`, extract `modification_token` from `event.data`.
- [x] Pass `modification_token` into the `input` payload of `sendOrderConfirmationWorkflow`.

### 2. Update Workflow
- [x] Modify `apps/backend/src/workflows/send-order-confirmation.ts`.
- [x] Update `SendOrderConfirmationInput` type to include optional `modification_token`.
- [x] Pass this token into the `data` object of `sendNotificationStep`.

### 3. Verify Email Template Data
- [x] Ensure the `order-placed` email template (likely in Resend or local template lookup) expects `data.token` (or `data.modification_token`).
- [x] **Link Format**: The email should generate a link like:
    ```
    ${process.env.STORE_URL}/order/edit/${order.id}?token=${token}
    ```

## Acceptance Criteria
- [x] **Token Propagation**: The `data` object sent to the email provider clearly contains the valid JWT.
- [x] **No Regression**: Ordinary order flow remains uninterrupted.
- [x] **Type Safety**: New input fields are properly typed.

## Technical Notes
- The token is *stateless* (JWT), so we do not need to save it to the DB.
- `modificationTokenService` is already correctly implemented.

## Status
**Ready for Review**

## Dev Agent Record

### Implementation Plan
- Modified subscriber to extract and pass `modification_token` from event data
- Updated workflow input type and transform to propagate token to notification step
- Enhanced email template with "Modify Order" section that displays link with JWT token

### Completion Notes
- All 90 unit tests pass (12 test suites)
- Added 2 new test files with 14 new tests specifically for token propagation
- Email template conditionally renders modify order link only when token is present
- Backward compatible: works with or without token

### Debug Log
- Initial test confirmed subscriber was dropping token (RED phase)
- Fixed subscriber input, then fixed workflow type error
- Added email template modifications with proper styling

## File List
- `apps/backend/src/subscribers/order-placed.ts` (modified)
- `apps/backend/src/workflows/send-order-confirmation.ts` (modified)
- `apps/backend/src/modules/resend/emails/order-placed.tsx` (modified)
- `apps/backend/integration-tests/subscribers/order-placed.unit.spec.ts` (new)
- `apps/backend/integration-tests/workflows/send-order-confirmation.unit.spec.ts` (new)

## Change Log
- 2025-12-08: Implemented modification token flow fix. Token now propagates from order.placed event through subscriber, workflow, to email template. Added "Modify Order" link section to confirmation email.
