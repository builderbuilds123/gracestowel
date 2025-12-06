# Technical Research: Stripe integration for Medusa backend and Remix storefront

## Technical Research Scope Confirmation

**Research Topic:** Stripe integration for Medusa backend and Remix storefront
**Research Goals:** Architecture for performance, one-time checkout, backend & frontend guidance
**Required Payment Methods:** PayPal, Apple Pay, Klarna, Affirm, GPay, Link, Card (Express Checkout support requested)
**Special Requirement:** 1-hour grace period for order modifications (Add/Delete/Modify) before capturing payment.

**Scope Confirmed:** 2025-12-06

---

## Technology Stack Analysis

### Programming Languages
*   **TypeScript / JavaScript**: Core language for Medusa (Node.js) and Remix (React).
*   **React (tsx)**: Essential for the storefront UI (Stripe Payment Element).

### Frameworks & Libraries
*   **Medusa Stripe Plugin (`medusa-payment-stripe`)**: Version 6.0.7+ recommended. Handles Payment Intents, Webhooks (via Event Bus), and Captures.
*   **Stripe SDKs**: `@stripe/stripe-js` & `@stripe/react-stripe-js` for Remix.
*   **Remix Framework**: Server-side `loaders` and `actions` for secure key management.

### Database & Storage
*   **PostgreSQL**: Stores `PaymentSession` and `Order` data.
*   **Redis**: Critical for **Event Bus** (Webhooks) and **Scheduled Jobs** (Delayed Capture).

---

## Integration Patterns Analysis

### Unified Payment Strategy
*   **Stripe is the Hub**: Instead of install 5 different plugins (PayPal, Klarna, etc.), we authorize mostly everything via **Stripe Payment Intents**.
*   **Configuration**: Enable "Apple Pay", "Google Pay", "Klarna", "Affirm", "PayPal" in the **Stripe Dashboard**.
*   **Medusa Config**: Set `automatic_payment_methods: { enabled: true }`.

### Frontend (Remix)
*   **Express Checkout Element**: Placed at the top. Auto-detects Apple Pay / GPay / Link.
*   **Payment Element**: Placed below. Handles Cards and BNPL (Klarna/Affirm).
*   **Flow**:
    1.  Medusa creates Cart -> Payment Session -> Stripe Payment Intent.
    2.  Remix fetches `client_secret`.
    3.  User fills Payment Element -> `stripe.confirmPayment()`.
    4.  **Crucial Change**: We configure `capture_method: 'manual'` for the 1-hour delay.

### Webhooks
*   **Endpoint**: `/hooks/payment/stripe`
*   **Events**: `payment_intent.succeeded` (Auth success), `payment_intent.amount_capturable_updated`, `payment_intent.payment_failed`.

---

## Architectural Patterns and Design

### 1-Hour Grace Period Architecture (Authorize-Capture)

This is the core architecture to support your "add/delete/modify within 1 hour" requirement.

1.  **Authorization (At Purchase)**:
    *   We set `capture_method: 'manual'` in the Stripe Plugin options.
    *   When user "buys", Stripe **authorizes** the funds (holds them) but does *not* charge the card.
    *   Order is created in Medusa with Payment Status `awaiting` (or `authorized`).

2.  **Modification Window (0-60 mins)**:
    *   **User Edits Cart**:
        *   **Decrease Total (Delete Item)**: No action needed on Stripe immediately. Or we can release the difference if significantly lower.
        *   **Increase Total (Add Item)**:
            *   *Minor Increase*: Stripe allows capturing slightly more than authorized (sometimes).
            *   *Major Increase*: We must use the **`increment_authorization`** endpoint (if supported by the card/bank) OR trigger a re-authorization flow.
            *   *Fallback*: If increment fails, user must re-enter CVV/Auth.

3.  **Delayed Capture (At 60 mins)**:
    *   **Mechanism**: A **Medusa Scheduled Job** (Cron) runs every X minutes (or triggered via Redis delay).
    *   **Logic**: Finds Orders created > 60 mins ago with Payment Status `authorized`.
    *   **Action**: Triggers `medusa.orders.capturePayment(orderId)`.
    *   **Result**: Funds move from Customer -> Merchant. Order is "Completed".

### Performance & Security
*   **Tokenization**: Raw card data never touches the server (SAQ A Compliance).
*   **Redis Event Bus**: Webhooks are acknowledged instantly and processed in background.

---

## Implementation Roadmap (Next Steps)

1.  **Configure Stripe Plugin**: Enable `capture_method: manual`.
2.  **Frontend**: Implement Express Checkout + Payment Element.
3.  **Scheduled Job**: Create `src/jobs/capture-expired-orders.ts` to scan for >1hr authorized orders.
4.  **Order Edit Flow**: Implement the UI for users to modify their "Pending" orders and the backend logic to `updatePaymentCollection` and `increment_authorization`.
