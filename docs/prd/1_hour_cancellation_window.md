# Product Requirement Document: 1-Hour Order Cancellation & Modification Window

**Status**: **Approved**
**Date**: 2025-11-27
**Author**: Product Manager Agent
**Reviewers**: Senior Technical Plan Reviewer, CPO Agent

## 1. Executive Summary

This feature allows customers to modify their orders (cancel, change shipping address) within a strict 1-hour window after purchase. This capability directly supports our "Premium Experience" North Star by empowering users to correct mistakes immediately, reducing "oops" support tickets, and increasing customer trust.

**Strategic Value**:
*   **Reach**: 100% of customers (post-purchase).
*   **Impact**: High (Reduces support costs, improves NPS).
*   **Risk**: High (Financial & Inventory synchronization).

## 2. User Stories

| Actor | Story | Acceptance Criteria |
| :--- | :--- | :--- |
| **Guest Customer** | As a guest customer, I want to cancel my order within 1 hour of placing it so I can fix a mistake without waiting for support. | - Accessible via secure link in email/success page.<br>- "Cancel Order" button available for 60 mins.<br>- Immediate confirmation of cancellation.<br>- Payment voided/refunded. |
| **Guest Customer** | As a guest customer, I want to update my shipping address within 1 hour so my package goes to the right place. | - Address form editable.<br>- Tax/Shipping recalculated if region changes.<br>- Payment adjusted if total changes (or blocked if complex). |
| **Guest Customer** | As a guest customer, I want to add items to my order within 1 hour so I can buy more things without paying for shipping again. | - "Add to Order" button on success page.<br>- Catalog browser or specific upsell recommendations.<br>- Payment of price difference.<br>- Inventory check. |
| **Warehouse System** | As the fulfillment system, I need to know *not* to ship an order until the 1-hour window has passed. | - Orders stay in `pending_fulfillment` or `on_hold` for 60 mins.<br>- No sync to WMS until window expires. |

## 3. Functional Requirements

### 3.1. The 1-Hour Timer & UI
*   **Countdown**: The Order Success page (`checkout.success.tsx`) must display a clear countdown timer: "You have X minutes to modify this order."
*   **Expiration**: Once the timer hits 0, modification controls must be disabled/hidden.
*   **State Recovery**: The page must be able to reload and recover the state (timer, order details) using a secure token, even if `localStorage` is cleared.

### 3.2. Cancellation (The "Undo" Button)
*   **Action**: Users can click "Cancel Order".
*   **Payment Handling**:
    *   **Authorized (Not Captured)**: Perform a **Void** on the Stripe Payment Intent.
    *   **Captured**: Perform a **Refund**.
    *   *Constraint*: If payment fails (e.g., bank decline on refund), the cancellation should fail gracefully and prompt user to contact support.
*   **Inventory**: Items must be immediately restocked (inventory count incremented).
*   **Notification**: Trigger an `order.canceled` email to the customer.

### 3.3. Address Modification
*   **Action**: Users can click "Edit Shipping Address".
*   **Validation**: New address must be valid and within shippable regions.
*   **Recalculation**:
    *   Trigger re-calculation of **Tax** and **Shipping Rates**.
    *   **Price Increase**: If new total > old total, prompt for payment of difference.
    *   **Price Decrease**: Refund the difference.
*   **Risk**: Re-run Stripe Radar check if address changes significantly (e.g., different country).

### 3.4. Order Modification (Add Items / Upsell)
*   **Action**: Users can click "Add Items" or select recommended upsells on the success page.
*   **Flow**:
    1.  User selects product/variant to add.
    2.  System checks **Inventory** availability.
    3.  System recalculates Order Total (Item Price + Tax + Shipping adjustment if any).
    4.  **Payment (Frictionless Upsell)**:
        *   **Strategy**: **Incremental Authorization**.
        *   **Pre-requisite**: The initial order payment must be **Authorized Only** (not captured). We will configure Medusa/Stripe to use `capture_method: manual`.
        *   **Logic**:
            *   Calculate `Delta = New Total - Old Total`.
            *   Call Stripe API to `increment_authorization` on the existing `PaymentIntent` by `Delta`.
            *   **User Experience**: User clicks "Confirm Add" -> System spins -> Success. **No credit card entry required.**
            *   *Fallback*: If increment fails (e.g., card declined), prompt user to enter a new card (fallback to "Mini-Checkout").
    5.  **Confirmation**: Update Medusa Order (add line item), decrement inventory, and send "Order Updated" email.
*   **Constraint**: Cannot *remove* items in this flow (use Cancel for that). Focus is on **Upsell**.

### 3.4. Fulfillment Hold (Backend)
*   **Logic**: Orders must be tagged or held in a state that prevents WMS (Warehouse Management System) pickup for 60 minutes.
*   **Release Mechanism**: A **Redis-based Delayed Job** (BullMQ) scheduled at order creation will "release" the order to fulfillment (and capture payment) exactly after 60 minutes.

## 4. Technical Specifications & Security (CRITICAL)

### 4.1. Security: The Modification Token
*   **Problem**: Guest users have no session. We cannot rely on Order ID alone (insecure).
*   **Solution**: Generate a **Signed JWT (Modification Token)** at order creation.
    *   **Payload**: `order_id`, `exp` (1 hour from now).
    *   **Storage**: Store hash of token on Order entity (optional, for revocation) or stateless verification.
    *   **Distribution**: Embed in:
        1.  Order Success URL: `https://store.com/order/confirmed/123?token=eyJ...`
        2.  Order Confirmation Email link.
*   **Enforcement**: All modification endpoints (`/store/orders/:id/cancel`, `/store/orders/:id/edit`, `/store/orders/:id/add-item`) **MUST** validate this token.

### 4.2. Backend Architecture (Medusa + Stripe)
*   **Stripe Configuration**:
    *   **Manual Capture**: Configure the Stripe Module to use `capture: manual` (or `automatic_payment_methods: { allow_redirects: 'never' }` if applicable) to ensure funds are only authorized initially.
    *   **Capture Strategy**: **Redis-based Delayed Job** (BullMQ).
        *   **Trigger**: `order.placed` event schedules a job with a 1-hour delay.
        *   **Worker**: Processes the job, checks status, and captures payment.
    *   **Monitoring**: Implement alerts for "Uncaptured Payments > 24 hours" and Dead Letter Queue monitoring for failed jobs.
*   **Endpoints**:
    *   `POST /store/orders/:id/cancel`: Validates token, voids payment, cancels Medusa order.
    *   `POST /store/orders/:id/address`: Validates token, updates address, handles tax/shipping recalc.
    *   `POST /store/orders/:id/line-items`: Validates token, adds item, handles payment delta.
*   **Concurrency**: Use database transactions to ensure Inventory and Order Status are updated atomically.

### 4.3. Frontend Architecture
*   **Data Fetching**: Refactor `checkout.success.tsx` to fetch the full Order object from Medusa using the `token` (if present) or session. Do **not** rely solely on `localStorage` or Stripe redirect params.

## 5. Implementation Phases

### Phase 1: Foundation (Security & Data)
1.  **Backend**: Configure Stripe Module in `medusa-config.ts`.
2.  **Backend**: Implement `ModificationTokenService` to generate/validate tokens.
3.  **Backend**: Add token generation hook to Order Creation.
4.  **Frontend**: Update `checkout.success.tsx` to hydrate from API using ID+Token.

### Phase 2: Cancellation (MVP)
1.  **Backend**: Implement `POST /cancel` with Void/Refund logic.
2.  **Backend**: Implement Inventory restocking logic.
3.  **Frontend**: Add "Cancel Order" button and Countdown Timer.
4.  **Email**: Add `order.canceled` template. Ensure "Order Confirmed" email clearly states payment is "Authorized" or "Pending" (if visible).

### Phase 3: Upsell & Address Modification
1.  **Backend**: Implement `POST /add-item` (Order Edit wrapper).
2.  **Backend**: Implement **Incremental Authorization** logic (Stripe).
3.  **Frontend**: "Add to Order" UI (One-Click Confirm).
4.  **Backend**: Address update + Tax/Shipping recalc logic.
5.  **Frontend**: Address Edit Modal.

### Phase 4: Fulfillment Safety
1.  **Backend**: Implement "Hold" logic (e.g., `status: pending_fulfillment` but filtered out of WMS exports until `created_at + 1h`).

## 6. Metrics & Success Indicators
*   **Adoption**: % of cancellations performed via self-serve vs. support tickets.
*   **Support Load**: Reduction in "Cancel my order" tickets.
*   **Error Rate**: % of failed cancellation attempts (e.g., due to payment sync errors).

## 7. Testing Strategy
*   **Concurrency**: Test "Capture Job" running *while* a user is modifying the order.
*   **Payment Failure**: Test "Incremental Authorization" failure (insufficient funds) -> Fallback to Mini-Checkout.
*   **Race Condition**: User cancels order while Warehouse job is running.
