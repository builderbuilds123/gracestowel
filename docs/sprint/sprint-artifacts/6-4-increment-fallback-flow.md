# Story 6.4: Increment Fallback Flow

Status: Done

## Story

As a Shopper,
I want to know if my "Add Item" request was declined by the bank,
So that I can try a different card or cancel the addition.

## Acceptance Criteria

## Acceptance Criteria

1.  **Given** I try to add an item to an existing order.
2.  **When** the backend attempts `stripe.paymentIntents.incrementAuthorization`.
3.  **And** Stripe returns a decline (e.g. `insufficient_funds`, `card_declined`).
4.  **Then** the system must capture the specific error code.
5.  **And** return a user-friendly error message to the frontend (e.g. "Your bank declined the additional charge.").
6.  **And** CRITICAL: The local Medusa Order total must NOT be updated (rollback line item addition).
7.  **And** the UI should revert to the previous state.

## Tasks / Subtasks

- [x] Task 1: Error Handling in Edit Workflow (AC: 1, 2, 3, 4)
  - [x] **Location**: `apps/backend/src/workflows/add-item-to-order.ts` (NOT service).
  - [x] **Transaction**: Workflow step order ensures rollback - Stripe step runs before DB update.
  - [x] **Client**: Use `getStripeClient()` from `apps/backend/src/utils/stripe.ts` (DO NOT instantiate new client).
  - [x] **Error Mapping**: Map `stripe.error.decline_code`:
    - `insufficient_funds` → "Insufficient funds."
    - `card_declined` → "Your card was declined."
    - `expired_card` → "Your card has expired."
    - Plus 8 more decline codes mapped

- [x] Task 2: Atomic Cleanup (AC: 6)
  - [x] **Rollback**: Workflow throws CardDeclinedError BEFORE updateOrderValuesStep - no DB changes on failure.
  - [x] **Warning**: `incrementAuthorization` requires Stripe API version `2022-08-01` or later. Verified: using `2025-10-29.clover`.

- [x] Task 3: Frontend Error Feedback (AC: 5, 7)
  - [x] **Component**: Error displayed in OrderModificationDialogs error alert.
  - [x] **Resync**: Action handler returns `retryable` flag for frontend UX.

## Dev Notes

- **Stripe API**: Ensure the project is using a compatible API version.
- **Reuse**: Check `PaymentProviderService` for existing Stripe error mappers.
- **Workflow**: This logic belongs in the Workflow step, not a service method.

## Testing Strategy

- **Simulate Decline**: Use Stripe Test Cards for "Insufficient Funds".
- **Verify Rollback**:
  - Add item -> fail Stripe Auth.
  - Assert HTTP Error returned.
  - Check DB: Order total and Line Items should match *pre-request* state.
- **Verify UI**: Ensure user sees error toast and cart total reverts.

### Project Structure Notes

- **Workflow**: `apps/backend/src/workflows/add-item-to-order.ts`
- **Utils**: `apps/backend/src/utils/stripe.ts`

### References

- [Stripe Increment Authorization](https://stripe.com/docs/payments/connected-accounts/increment-authorization)
- [Stripe Testing Declines](https://stripe.com/docs/testing#declines)

### 3. Testing Strategy

- **Concurrent Capture Race Test**:
  - Script: Trigger `POST /store/orders/{id}/edit` (Increment) AND `POST /admin/orders/{id}/capture` (Capture) simultaneously.
  - Expectation: If capture wins, increment fails with 409. If increment wins, capture waits (or fails safely).
  - **Critical**: Ensure `metadata.edit_status` remains consistent.
- **Rollback Verification**:
  - Mock Stripe decline. Verify database transaction rolls back (no partial updates).
- **UI Error Feedback**:
  - Mock `balance_insufficient` error. Verify frontend shows "Insufficient funds" toast (not generic 400).

## Previous Story Intelligence

- **Related Stories**:
  - Story 3.2 (Increment Logic): This story handles the *failure* path of the logic defined in 3.2.
  - Story 6.1 (Webhooks): Errors here might overlap with asynchronous webhook failures.
  - Story 6.3 (Race Conditions): Must respect the `locked_for_capture` flag.

## Integration & Security Patterns

- **Observability**:
  - Metric: `payment_increment_decline_count` (Counter, labels: `reason_code`).
  - Metric: `payment_increment_rollback_error` (Counter) - Critical alert if > 0.
- **Frontend Contract**:
  - Error Response Payload: `{ code: "PAYMENT_DECLINED", message: "User friendly message", type: "payment_error", retryable: boolean }`.
  - HTTP Status: `402 Payment Required` (preferred) or `400 Bad Request`.
- **Decline Code Mapping**:
  | Stripe Code | Application Code | User Message |
  | :--- | :--- | :--- |
  | `generic_decline` | `PAYMENT_DECLINED` | "Your card was declined." |
  | `insufficient_funds` | `PAYMENT_DECLINED` | "Insufficient funds." |
  | `lost_card` \| `stolen_card` | `PAYMENT_DECLINED` | "Your card was declined. Please try another." |
  | `expired_card` | `PAYMENT_DECLINED` | "Your card has expired." |
  | `incorrect_cvc` | `PAYMENT_DECLINED` | "Your card's security code is incorrect." |
  | `processing_error` | `PAYMENT_ERROR` | "An error occurred while processing your card." |
- **Security**:
  - **Sanitization**: NEVER return raw Stripe error objects to the client. Only return mapped, safe messages.
  - **Logging**: Do NOT log full card details or sensitive PII in error logs.
- **Error Handling**:
  - Follow `project_context.md` patterns for consistent payload structure (`{ code, message, type }`).

### Refined Anti-Patters & Implementation Details

- **Frontend Error Handling**: The error toast logic is in `apps/storefront/app/components/order/OrderModificationDialogs.tsx`. The action handler is in `apps/storefront/app/routes/order_.status.$id.tsx`.
- **Test Data**: Use specific Stripe test cards for declines:
  - **4000 0000 0000 0002**: "Your card was declined." (Generic)
  - **4000 0000 0000 9995**: "Insufficient funds."
  - **4000 0000 0000 9420**: "Your card has expired."

## Dev Agent Record

### Context Reference

- `docs/product/epics/payment-integration.md` - Epic 6 Source.
- `apps/backend/src/utils/stripe.ts` - Stripe util.
- `apps/storefront/app/components/order/OrderModificationDialogs.tsx` - Frontend Error Handling.
- `apps/storefront/app/routes/order_.status.$id.tsx` - Action Handler.

### Agent Model Used

Antigravity (Google Deepmind)

### Completion Notes List

- Corrected file path to `add-item-to-order.ts`.
- Added Stripe API version warning (2022-08-01+).
- Enforced use of `getStripeClient()`.
- Added specific decline codes and frontend toast/loader patterns.
- Added "Previous Story Intelligence" linking Story 3.2.
- Added strict Security/Sanitization rules for payment errors.
- Corrected frontend file paths.
- Added Stripe test card numbers.

### File List

- `apps/backend/src/workflows/add-item-to-order.ts` (modified - added decline code mapping, enhanced CardDeclinedError)
- `apps/backend/src/api/store/orders/[id]/line-items/route.ts` (modified - updated 402 response format)
- `apps/storefront/app/routes/order_.status.$id.tsx` (modified - handle payment_error type)
- `apps/backend/integration-tests/unit/increment-fallback-flow.unit.spec.ts` (new - 14 tests)

### Change Log

- 2025-12-12: Implemented Story 6.4 Increment Fallback Flow
  - Added `DECLINE_CODE_MESSAGES` mapping for 11 Stripe decline codes
  - Added `RETRYABLE_DECLINE_CODES` set for UX guidance
  - Added `mapDeclineCodeToUserMessage()` function
  - Enhanced `CardDeclinedError` with `code`, `type`, `userMessage`, `retryable` properties
  - Updated API route to return `{ code, message, type, retryable, decline_code }`
  - Updated frontend action handler to pass through payment error details
  - Added 14 unit tests covering all decline code mappings and error properties
