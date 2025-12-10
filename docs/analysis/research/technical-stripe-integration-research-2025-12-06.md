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
*   **Redis**: Critical for **Event Bus** (Webhooks) and **Keyspace Notifications** (Delayed Capture).

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

### 1-Hour Grace Period Architecture (Event-Driven Token Expiration)

This architecture eliminates "polling" or "scheduled jobs" in favor of a reactive **Token Expiration** pattern using Redis Keyspace Notifications.

1.  **Authorization (At Purchase)**:
    *   **Stripe**: Payment is authorized (`capture_method: manual`). Funds are held.
    *   **Redis Token**: Medusa creates a "Capture Token" in Redis:
        *   **Key**: `capture_intent:{order_id}`
        *   **Value**: `payment_id`
        *   **TTL**: `3600` (1 hour)
    *   **State**: Order is `pending_capture`.

2.  **Modification Window (0-60 mins)**:
    *   **User Action**: User edits order via storefront.
    *   **Token Validation**: The presence of the `capture_intent` key confirms the edit window is open.
    *   **Updates**: 
        *   If amount increases: Call Stripe `increment_authorization`.
        *   If amount decreases: No immediate Stripe action needed.
        *   **Reset Timer (Optional)**: If you want to reset the 1-hour window on edit, we update the Redis TTL. If not, we leave it.

3.  **Delayed Capture (At 60 mins - The Trigger)**:
    *   **Event**: The Redis Key `capture_intent:{order_id}` **expires**.
    *   **Notification**: Redis publishes a `__keyevent@0__:expired` event.
    *   **Subscriber**: A Medusa Subscriber Service listening to this channel receives the `order_id`.
    *   **Action**: The Subscriber triggers `medusa.payment_processor.capturePayment(order_id)`.
    *   **Outcome**: Payment is captured precisely when the token expires.

### Performance & Security
*   **Redis Keyspace Notifications**: Efficient, event-driven mechanism. No database scanning.
*   **PCI-DSS**: Uses Stripe Elements (Tokenization) -> SAQ A.
*   **Scalability**: Redis handles millions of expiring keys efficiently.

---

## Implementation Roadmap (Next Steps)

1.  **Redis Config**: Enable Keyspace Notifications (`notify-keyspace-events Ex`).
2.  **Medusa Subscriber**: Create a subscriber to listen to Redis expired events.
3.  **Purchase Flow**: Update Cart Completion strategy to set the Redis Key with 1h TTL.
4.  **Order Edit Flow**: Implement logic to check Redis Key existence before allowing edits.
