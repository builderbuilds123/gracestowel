# Product Requirements Document (PRD): Stripe Payment Integration

**Status:** Draft
**Owner:** Technical Lead
**Date:** 2025-12-06
**Related Documents:** [Technical Research](../analysis/research/technical-stripe-integration-research-2025-12-06.md)

---

## 1. Executive Summary
Integrate **Stripe** as the primary payment processor for the Medusa backend and Remix storefront. The key differentiator is a **1-Hour Grace Period** feature, allowing customers to add, delete, or modify their orders for up to 60 minutes after purchase before the payment is captured. This ensures a flexible "Amazon-like" experience.

## 2. Goals & Success Metrics
*   **Performance:** Seamless One-Page Checkout experience.
*   **Flexibility:** Customers can edit orders (add/remove items) post-purchase without contacting support.
*   **Adoption:** Support for 95%+ of US/EU payment methods via Express Checkout (Apple Pay, Google Pay, PayPal, Klarna, Affirm).
*   **Compliance:** Full SAQ-A PCI Compliance (no raw data touches our servers).

## 3. User Stories

| ID | As a... | I want to... | So that... |
| :--- | :--- | :--- | :--- |
| **US-1** | Shopper | Pay using Apple Pay / GPay / PayPal | I can checkout instantly without typing details. |
| **US-2** | Shopper | Edit my order (add/remove items) within 1 hour | I can fix mistakes or add forgotten items without cancelling. |
| **US-3** | Shopper | See a clear timer counting down the "Edit Window" | I know how much time I have left to make changes. |
| **US-4** | Shopper (Guest) | access my order via a secure link in my email | I can edit my order even if I closed the browser tab. |
| **US-5** | Admin | Have payments captured automatically after 1 hour | I don't have to manually process every order. |

## 4. Functional Requirements

### 4.1. Checkout Experience (Remix Storefront)
*   **Express Checkout**: Implement `<ExpressCheckoutElement />` at the top of the checkout page. Must strictly support Apple Pay, Google Pay, PayPal,and Link.
*   **Standard Payment**: Implement `<PaymentElement />` for Credit Cards and BNPL (Klarna, Affirm).
*   **Guest Checkout**: Full support for Guest Checkout (no account required to pay, but account created/linked for order editing).

### 4.2. Authorization & Payment Flow
*   **Auth-Only**: Payments must be **Authorized Only** (`capture_method: manual`) at the moment of purchase.
*   **Funds Hold**: System must validly hold funds for the duration of the grace period (1 hour).
*   **Method Support**: If a user selects a payment method that *does not* support delayed capture (e.g., certain instant vouchers), the system should either:
    *   Disable the "1-Hour Edit Window" for that specific order (immediate capture).
    *   Hide the method from checkout (if strict adherence to grace period is required).
    *   *Decision*: For this phase, we support standard methods (Cards, Wallets, BNPL) which all support auth-capture.

### 4.2.1. PaymentIntent Lifecycle (Added 2025-12-12)
*   **Single Intent Per Session**: The system SHALL create exactly one PaymentIntent per checkout session.
*   **Reuse Pattern**: WHEN cart or shipping changes during checkout, THE system SHALL UPDATE the existing PaymentIntent rather than creating a new one.
*   **Idempotency**: THE system SHALL use deterministic idempotency keys (based on cart hash) for PaymentIntent creation to prevent duplicates on network retries.
*   **Client Secret Stability**: THE system SHALL NOT change the `clientSecret` after initial PaymentIntent creation, as this breaks Stripe Elements.

### 4.3. 1-Hour Grace Period (The "Edit Window")
*   **Session Persistence**: The system must persist a secure **HttpOnly Cookie** (or LocalStorage Token) containing the `order_id` and a temporary `edit_token`. This allows users to simply navigate back to the store (or refresh the page) and immediately see their pending order/edit interface without needing to click a link.
*   **Guest Access (Fallback)**: Order Confirmation emails must *also* contain a secure **Magic Link** (tokenized URL) to allow Guest Users to re-access the Order Status page from a different device or if cookies are cleared.
*   **Token Logic**: Upon purchase, a **Redis Token** (`capture_intent:{order_id}`) is generated with a **1-hour TTL**.
*   **Permissions**: 
    *   **Active Token**: User sees "Edit Order" button on Order Confirmation page.
    *   **Expired Token**: "Edit Order" button disappears; Order status moves to "Processing".
*   **Modification Logic**:
    *   **Add Item**: Trigger Stripe `increment_authorization` to increase the held amount. If failed (card declined), block the addition.
    *   **Remove Item**: Update Medusa Order totals. (Capture less later).

### 4.4. Automatic Capture
*   **Trigger**: System listens for the **Redis Key Expiration Event**.
*   **Action**: Instantly triggers the Payment Capture for the *current* order total.
*   **Fallback**: A daily cron job updates any "stuck" authorizations that missed the Redis event.

## 5. Non-Functional Requirements
*   **Security**: All payment inputs must use hosted iframes (Stripe Elements).
*   **Performance**: Webhook processing must use **Redis Event Bus** to prevent blocking.
*   **Reliability**: Redis Keyspace Notifications must be enabled (`notify-keyspace-events Ex`) to drive the workflow.

### 5.1. Observability (Added 2025-12-12)
*   **Structured Logging**: All payment operations SHALL emit JSON-structured logs with fields: `timestamp`, `level`, `message`, `context`.
*   **Trace Correlation**: Trace IDs SHALL be generated in format `gt_{timestamp}_{random}` and propagated via `x-trace-id` header from frontend through backend.
*   **Error References**: User-facing payment errors SHALL include `traceId` for customer support escalation.
*   **Webhook Idempotency**: Order creation from webhooks SHALL check for existing orders with same `stripe_payment_intent_id` to prevent duplicates on retry.

## 6. Technical Architecture Overview
*   **Backend**: Medusa v2 with `medusa-payment-stripe` (v6.0.7+).
*   **Event Engine**: Redis Pub/Sub for Token Expiration.
*   **Frontend**: Remix using `@stripe/react-stripe-js`.

## 7. Open Questions / Risks
*   **Risk**: `increment_authorization` is not supported by *all* banks. 
    *   *Mitigation*: For cards that refuse increment, we may need to trigger a second authorization or block "Add Item" functionality for those specific transactions.
*   **Risk**: Redis event delivery is "fire and forget". 
    *   *Mitigation*: Mandatory "Fallback Cron" to capture any orders that miss the event.
*   **Risk**: Race Conditions (User edits at 59:59).
    *   *Mitigation*: **Edit Freeze**. The backend `updateOrder` endpoint must check TWO conditions before allowing a change:
        1.  Redis Key exists.
        2.  Order Status is NOT `captured` or `processing`.
        If the Redis key expires mid-request, the database update must fail.
