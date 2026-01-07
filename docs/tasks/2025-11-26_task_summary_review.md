# Plan Review: Post-Purchase Order Modification (1-Hour Window)

**Date**: 2025-11-26
**Reviewer**: Senior Technical Plan Reviewer
**Target PRD**: [2025-11-26_task_summary.md](./2025-11-26_task_summary.md)

## 1. Executive Summary

The proposal to allow customers to modify orders within a 1-hour window is a high-value feature that significantly enhances the "Premium Experience" and reduces support overhead. However, the technical implementation carries **High Risk** due to the complexity of synchronizing Medusa's Order state with Stripe's Payment Intents (Void vs. Refund vs. Capture).

**Verdict**: **Proceed with Caution**. The plan requires significant refinement in the **Security**, **Payment Integration**, and **Frontend Data Architecture** sections before implementation can begin.

## 2. Critical Issues (Show-Stoppers)

### 2.1. Frontend Data Source & State Management
*   **Issue**: The current `checkout.success.tsx` relies heavily on `localStorage` and Stripe's `payment_intent` to display order details. It does **not** appear to fetch the full Medusa Order entity.
*   **Impact**: You cannot perform an "Order Edit" (add/remove items) without the full Order context (Line Items, Region, Tax Rates) from Medusa. If a user refreshes the page or accesses the link from an email, `localStorage` may be empty, breaking the feature.
*   **Requirement**: The success page must be refactored to fetch the Order by ID (or a secure token) from Medusa immediately upon load.

### 2.2. Missing Payment Module Configuration
*   **Issue**: A review of `apps/backend/medusa-config.ts` shows no explicit configuration for the Stripe Module, despite `stripe` being in `package.json`.
*   **Impact**: The backend cannot perform server-side actions like `void` or `refund` without a properly configured Payment Module. The plan assumes these capabilities exist but the infrastructure appears missing or incomplete.
*   **Requirement**: Verify and configure the Stripe Module in `medusa-config.ts` before attempting any payment logic.

### 2.3. Security & Authorization (The "Guest" Problem)
*   **Issue**: The plan mentions a "1-hour check" but does not specify how a user is authorized to cancel an order.
*   **Risk**: If the endpoint is just `POST /store/orders/:id/cancel`, an attacker could enumerate Order IDs and cancel other people's orders.
*   **Requirement**:
    *   **Logged-in Users**: Verify ownership via session.
    *   **Guest Users**: You MUST implement a **Signed Token** (e.g., JWT) mechanism. The token should be generated at order creation, valid for 1 hour, and included in the success URL and confirmation email. The API must validate this token.

### 2.4. Payment State Synchronization (Void vs. Refund)
*   **Issue**: The plan assumes "Void Payment Intent".
*   **Reality**: This is only possible if the payment is *Authorized* but not *Captured*. If your store is set to `automatic` capture (common for immediate fulfillment flows), you cannot void; you must **Refund**.
*   **Requirement**: Clarify the capture strategy. If `automatic`, update the plan to use "Refund". If `manual`, ensure the "Capture" job respects the 1-hour delay.

## 3. Missing Considerations

### 3.1. Fulfillment Race Conditions
*   **Scenario**: What if the warehouse (or 3PL) picks up the order immediately (e.g., within 10 minutes)?
*   **Risk**: A user cancels the order at minute 45, but it's already on a truck.
*   **Recommendation**: The "1-hour lock" must also be respected by the Fulfillment workflow. Orders should stay in a `pending_fulfillment` or `on_hold` state for 1 hour before being exposed to the WMS (Warehouse Management System).

### 3.2. Email Notifications
*   **Gap**: The plan does not mention email updates.
*   **Question**: Does the user get a "Cancellation Confirmed" email? If they modify the address, do they get an "Order Updated" email?
*   **Recommendation**: Add email triggers for `order.canceled` and `order.updated` events.

### 3.3. Inventory Locking
*   **Gap**: When adding an item during an edit, is the inventory reserved immediately?
*   **Risk**: A user adds an item, but payment fails. Is the item held?
*   **Recommendation**: Medusa's Order Edit flow handles this, but verify that inventory is released if the edit is *not* confirmed/paid.

## 4. Implementation Recommendations

### 4.1. Architecture: The "Modification Token"
Instead of relying on just the Order ID, generate a secure link:
`https://store.com/orders/status?id=order_123&token=eyJhbG...`
The backend endpoint `POST /store/orders/:id/cancel` should require this `token` in the header or body.

### 4.2. Refined Phasing
*   **Phase 1 (Foundation)**:
    *   Configure Stripe Module in Backend.
    *   Implement "Signed Token" logic on Order Creation.
    *   Refactor `checkout.success.tsx` to fetch Order from Medusa using the ID/Token.
*   **Phase 2 (Cancel)**:
    *   Implement Cancel endpoint with Token validation.
    *   Handle Void vs. Refund logic based on payment status.
*   **Phase 3 (Edit)**:
    *   Complex edits (add/remove items).

### 4.3. Codebase Specifics
*   **Location**: Create a new module or service `OrderModificationService` in `apps/backend/src/modules/order-modification` (if following modular architecture) or `src/services` to encapsulate this logic, keeping it separate from core Order logic.

## 5. Alternative Approaches

### 5.1. "Request Cancellation" (Low Risk)
Instead of immediately voiding/refunding, the button simply tags the order as `cancellation_requested`.
*   **Pros**: Zero risk of payment errors or race conditions. A CS agent (or async job) reviews and processes it.
*   **Cons**: Not "instant" gratification for the user.

### 5.2. Store Credit for Edits
If "Add/Remove" payment logic is too complex (partial captures are messy):
*   **Refunds**: Issue Store Credit immediately.
*   **Additions**: Treat as a separate "Upsell Order" linked to the parent order.
*   **Pros**: Simplifies Stripe logic significantly.

## 6. Research Findings
*   **Medusa V2**: Confirmed usage of Medusa V2 (`@medusajs/medusa: ^2.11.3`).
*   **Stripe**: `stripe` package is present but configuration is missing in `medusa-config.ts`.
*   **Frontend**: `checkout.success.tsx` is currently insufficient for the proposed features and needs a data-fetching overhaul.
