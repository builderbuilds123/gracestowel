# Sprint Change Proposal: Unified Order Cancellation

**Date:** 2026-01-11
**Workflow:** Correct Course
**Trigger:** Requirement to support order cancellation AFTER the 1-hour grace period (Post-Capture).

## 1. Issue Summary
*   **Trigger**: User request to allow order cancellation at any time *before* shipping, even if payment is captured.
*   **Current State**: Cancellation logic (Story 3.4) only handles the "Grace Period" (Uncaptured/Void) scenario.
*   **Gap**: Missing logic to handle "Refunds" for captured payments and "Shipped" status checks for late cancellations.

## 2. Impact Analysis
*   **Epics**:
    *   `Epic 3: Order Modification` needs to account for post-capture scenarios.
*   **Artifacts**:
    *   `docs/sprint/sprint-artifacts/3-5-unified-order-cancellation.md` (New Story created).
    *   `docs/prd/e2e-testing-overhaul.md` (Updated with new test requirements R8, R8a).
*   **Technical**:
    *   Need to integrate Medusa v2 `cancelOrderWorkflow` which supports refunds.
    *   Need to add logic to block cancellation if `fulfillment_status` is `shipped` or `partially_shipped`.

## 3. Recommended Approach
**Option 1: Direct Adjustment (Story 3.5)**
*   Implement a unified cancellation endpoint with strict conditional branching:
    *   **Branch A (Grace Period)**: Custom Queue Stop -> Void Auth.
    *   **Branch B (Post-Grace Period & Unified)**:
        *   **Refactor Route**: Remove token expiration check from `route.ts`.
        *   **Refactor Workflow**: Convert `cancel-order-with-refund.ts` to "Safety Wrapper".
        *   **Steps**:
        *   **Steps**:
            1.  **Global Safety Check**: Verify `not_fulfilled`. (Reject if shipped).
            2.  **Remove Capture Job**: Remove *only* this order's job to prevent race condition. (Worker continues for others).
            3.  **Branching**:
                *   Valid Token (< 1h) -> Void.
                *   Expired Token (> 1h) -> Native Refund.
            4.  **Compensation**: Re-add Job if Logic fails (Idempotent Safety).
                *   *Note*: If already captured, job is no-op. If not, it prevents revenue loss.
            4.  Call Native `cancelOrderWorkflow`.
        *   **Remove**: `LateCancelError`, manual `voidPayment` steps.

## 4. Implementation Handoff
**Scope**: **Minor/Moderate** (New Story, but logic is contained).
**Assignee**: Development Team (or Agent `dev`).

### Deliverables
1.  [Story 3.5: Unified Order Cancellation](file:///Users/leonliang/Github%20Repo/gracestowel/docs/sprint/sprint-artifacts/3-5-unified-order-cancellation.md)
2.  [PRD Update: E2E Testing](file:///Users/leonliang/Github%20Repo/gracestowel/docs/prd/e2e-testing-overhaul.md)

### Success Criteria
*   Order can be canceled < 1 hour (Void).
*   Order can be canceled > 1 hour (Refund) IF not shipped.
*   Order cannot be canceled if shipped.
*   E2E tests pass for all 3 scenarios.
