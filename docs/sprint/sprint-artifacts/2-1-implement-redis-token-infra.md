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
- [ ] Modify `apps/backend/src/subscribers/order-placed.ts`.
- [ ] In `orderPlacedHandler`, extract `modification_token` from `event.data`.
- [ ] Pass `modification_token` into the `input` payload of `sendOrderConfirmationWorkflow`.

### 2. Update Workflow
- [ ] Modify `apps/backend/src/workflows/send-order-confirmation.ts`.
- [ ] Update `SendOrderConfirmationInput` type to include optional `modification_token`.
- [ ] Pass this token into the `data` object of `sendNotificationStep`.

### 3. Verify Email Template Data
- [ ] Ensure the `order-placed` email template (likely in Resend or local template lookup) expects `data.token` (or `data.modification_token`).
- [ ] **Link Format**: The email should generate a link like:
    ```
    ${process.env.STORE_URL}/order/edit/${order.id}?token=${token}
    ```

## Acceptance Criteria
- [ ] **Token Propagation**: The `data` object sent to the email provider clearly contains the valid JWT.
- [ ] **No Regression**: Ordinary order flow remains uninterrupted.
- [ ] **Type Safety**: New input fields are properly typed.

## Technical Notes
- The token is *stateless* (JWT), so we do not need to save it to the DB.
- `modificationTokenService` is already correctly implemented.
