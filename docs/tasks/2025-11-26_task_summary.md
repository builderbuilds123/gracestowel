# Task Summary: Post-Purchase Order Modification (1-Hour Window)
**Date**: 2025-11-26
**Author**: CPO Agent (v3.1)

## 1. Strategic Analysis (The "Why")

### 1.1 RICE Score Calculation
*   **Reach**: 10 (100% of customers see the confirmation page).
*   **Impact**: 2.0 (High - Reduces support tickets for "oops" moments, increases AOV if adding items).
*   **Confidence**: 80% (Medusa supports order edits; Stripe handling is the main complexity).
*   **Effort**: 7 (High complexity: State management, Payment re-authorization, Inventory locks).
*   **Score**: `(10 * 2.0 * 0.80) / 7` = **2.28** (High Priority)

### 1.2 Risk Simulation (Cagan’s Four)
*   **Value Risk**: Low. Customers universally value the ability to fix mistakes immediately.
*   **Usability Risk**: Medium. The UI must clearly communicate the "1-Hour" countdown and the financial implications (refunds/charges).
*   **Feasibility Risk**: High. Synchronizing Medusa Order Edits with Stripe Payment Intents (capturing/canceling) is technically non-trivial.
*   **Viability Risk**: Low. Reduces operational cost (CS tickets).

### 1.3 Conclusion
**APPROVED**. This feature aligns with our "Premium Experience" North Star. It turns a potential negative (mistake) into a positive brand interaction.

---

# Product Requirement Document (PRD)

## 1. Context & User Story
**User Story**: "As a customer who just placed an order, I want to modify it (cancel, change item, add item) within 1 hour so that I can correct mistakes without contacting support."

## 2. Technical Specifications

### 2.1 Architecture & Data Flow
*   **Entry Point**: `apps/storefront/app/routes/checkout.success.tsx`
*   **State**: Needs a `modification_window_expiry` timestamp on the Order entity.
*   **Backend**:
    *   Leverage Medusa's **Order Edit** API (`POST /admin/order-edits`).
    *   **Cron Job**: A scheduled job to "lock" orders after 1 hour if no action is taken.

### 2.2 Functional Requirements
1.  **Countdown Timer**: Display "You have X minutes to modify this order" on the success page.
2.  **Cancel Order**:
    *   Action: Void Stripe Payment Intent.
    *   Action: Cancel Medusa Order.
    *   Action: Release Inventory.
3.  **Modify Order (Add/Remove Items)**:
    *   *Complex Flow*: Requires creating an Order Edit.
    *   **If Total Increases**: Request *additional* payment (new Stripe Payment Intent or capture difference).
    *   **If Total Decreases**: Refund the difference.
    *   **Constraint**: Only allow modifications if fulfillment status is `not_fulfilled`.

### 2.3 MoSCoW Scope (v1.0)
*   **Must Have**: Cancel Order button (Full refund).
*   **Must Have**: 1-Hour Timer visualization.
*   **Should Have**: "Add to Order" (Upsell).
*   **Won't Have**: Modifying shipping address (Risk of fraud/tax recalculation complexity for v1).

## 3. Implementation Plan

### Phase 1: The "Undo" Button (Cancel Only)
*   [ ] **Backend**: Endpoint `POST /store/orders/:id/cancel` (protected by 1-hour check).
*   [ ] **Frontend**: Add "Cancel Order" button to `checkout.success.tsx`.

### Phase 2: The "Edit" Flow (Add/Remove)
*   [ ] **Backend**: Implement Order Edit wrappers.
*   [ ] **Frontend**: Re-use `CartDrawer` components to visualize Order Edit state.

## 4. Acceptance Criteria
1.  User can cancel order within 59 minutes of placement.
2.  User *cannot* cancel order after 61 minutes.
3.  Stripe payment is fully refunded (voided) upon cancellation.
4.  Inventory is returned to stock immediately.
