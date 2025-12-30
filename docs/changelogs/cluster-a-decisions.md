# Cluster A Decisions (Checkout Core Refactor)

## Summary
Refactored checkout flow to enforce server-side pricing (SEC-01), fix money unit mismatches (MNY-01), and implement canonical Medusa cart completion (CHK-01).

## Decisions

### SEC-01: Server-Side Pricing Enforcement
*   **Decision:** The Storefront API (`api.payment-intent.ts`) now **strictly requires** a `cartId` in the request body.
*   **Rationale:** To prevent malicious actors from manipulating the payment amount by modifying client-side JavaScript.
*   **Implementation:**
    *   The API fetches the authoritative Cart from Medusa using the provided `cartId`.
    *   It uses `cart.summary.current_order_total` (or `cart.total`) as the single source of truth for the amount.
    *   The backend workflow `create-order-from-stripe.ts` also strictly requires `cartId` and fetches items/totals from Medusa, rejecting requests that rely on legacy metadata.

### MNY-01: Money Unit Standardization
*   **Decision:** Treat Medusa API monetary values (specifically `cart.total`) as **minor units (cents)**.
*   **Rationale:** Medusa v2 API returns integers representing cents. Previous logic incorrectly assumed major units (dollars) and multiplied by 100, risking 100x overcharges.
*   **Implementation:**
    *   Removed `toCents()` conversion in `api.payment-intent.ts` when processing Medusa cart totals.
    *   Updated unit tests to mock Medusa responses with integer values (e.g., `5000` for $50.00).

### CHK-01: Canonical Cart Completion
*   **Decision:** Explicitly call `medusa.carts.complete(cartId)` after successful payment.
*   **Rationale:** The previous flow relied solely on webhooks for order creation, which could lead to race conditions or incomplete cart states in Medusa if webhooks failed.
*   **Implementation:**
    *   Added `onComplete` callback to `CheckoutForm`.
    *   `checkout.tsx` calls a new endpoint `/api/carts/:id/complete` upon successful Stripe payment.
    *   This ensures the Medusa cart is marked as completed synchronously from the client's perspective (best effort), while the webhook ensures backend consistency.

## Verification
*   **Unit Tests:** Added `apps/storefront/app/routes/api.payment-intent.test.ts` to verify:
    *   Client-provided amounts are ignored.
    *   Medusa cart total is used.
    *   Missing `cartId` results in a 400 error.
*   **Manual Verification:** Verified that `worker-configuration.d.ts` correctly reflects the environment (Cloudflare Workers) and that secrets like `STRIPE_SECRET_KEY` are handled via manual type casting as they are not in `wrangler.toml` vars.
