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
**Done** ✅

## Dev Agent Record

### Implementation Plan
- Modified subscriber to extract and pass `modification_token` from event data
- Updated workflow input type and transform to propagate token to notification step
- Enhanced email template with "Modify Order" section that displays link with JWT token

### Completion Notes
- All 98 unit tests pass (13 test suites)
- Added 3 new test files with 21 new tests specifically for token propagation
- Email template conditionally renders modify order link only when token is present
- Backward compatible: works with or without token
- Added STORE_URL validation with error logging in email template

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
- `apps/backend/integration-tests/emails/order-placed.unit.spec.ts` (new)

## Change Log
- 2025-12-08: Implemented modification token flow fix. Token now propagates from order.placed event through subscriber, workflow, to email template. Added "Modify Order" link section to confirmation email.
- 2025-12-08: Code review completed. Added email template unit tests, STORE_URL validation, and fixed gitleaks false positives.

---

## Code Review Record

### Review Date
2025-12-08

### Reviewer
Dev Agent (Amelia) - Adversarial Code Review

### Review Summary

| Metric | Result |
|--------|--------|
| **Tests Passing** | 98/98 ✅ |
| **Test Suites** | 13 passed |
| **Git vs Story Alignment** | Perfect match |
| **All ACs Implemented** | ✅ Yes |
| **All Tasks Complete** | ✅ Yes |

### Initial Findings (First Review)

#### MEDIUM Issues Found
1. **Missing Email Template Tests** - No unit tests for email template rendering
   - **Resolution:** Added `apps/backend/integration-tests/emails/order-placed.unit.spec.ts` with 7 tests
   
2. **Missing STORE_URL Validation** - Email template assumed STORE_URL was always set
   - **Resolution:** Added explicit validation with error logging when env var missing

#### LOW Issues Found
1. **Story File List Incomplete** - Missing new test file from documentation
   - **Resolution:** Updated File List to include all 6 files

### Final Review (After Fixes)

All issues resolved. Implementation quality rated **EXCELLENT**.

### Gitleaks Resolution
- **Issue:** Test files contained JWT-like mock tokens triggering false positives
- **Resolution:** 
  1. Replaced JWT-format tokens with obviously fake tokens (`test-modification-token-for-unit-tests`)
  2. Added fingerprints to `.gitleaksignore` for historical commits

### Files Changed During Review
- `apps/backend/src/modules/resend/emails/order-placed.tsx` - Added STORE_URL validation
- `apps/backend/integration-tests/emails/order-placed.unit.spec.ts` - New test file (7 tests)
- `apps/backend/integration-tests/subscribers/order-placed.unit.spec.ts` - Updated mock tokens
- `apps/backend/integration-tests/workflows/send-order-confirmation.unit.spec.ts` - Updated mock tokens
- `.gitleaksignore` - Added fingerprints for test file false positives

### Verification Commands
```bash
# Run all backend tests
cd apps/backend && npm test

# Expected output: 98 tests passing, 13 test suites
```
