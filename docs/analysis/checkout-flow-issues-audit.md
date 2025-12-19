# Checkout Flow Audit — Issues & Story-Ready Fix Specs

Date: 2025-12-19

## Objective
Document the checkout flow’s key **bugs, security issues, correctness gaps, and architecture risks** in a format that can be turned into actionable implementation stories by other AI agents.

## Scope
- Storefront checkout (cart -> payment intent -> success)
- Stripe webhook ingestion + order creation
- 1-hour modification window (cancel, address, add items, update quantity)
- Delayed/manual capture via BullMQ worker
- Inventory adjustments and stock validation

## Glossary / Key Invariants
- **Stripe PaymentIntent (PI)**: should use **minor units** (e.g. cents) as integers. Created with `capture_method=manual`.
- **Medusa v2 prices/totals**: are stored in **major units** (e.g. `$20.00` stored as `20`) per official docs; convert to Stripe minor units (cents) only at the Stripe boundary.
- **Modification token**: JWT (signed) granting limited-time access to modify an order.
- **Modification window**: defaults ~1 hour; payment capture is scheduled near/at window expiry.

---

## Issue Index (Prioritized)

| ID | Severity | Title |
|---|---:|---|
| SEC-01 | Critical | Client-trust pricing & order contents (Stripe metadata is authoritative) |
| SEC-02 | Critical | `/store/orders/by-payment-intent` leaks PII + full table scan + token mint |
| SEC-03 | High | Prevent future regressions: token expiry must be anchored to order creation time |
| SEC-04 | High | `payment_intent_client_secret` can leak via Referrer on success page |
| SEC-05 | High | Modification token persisted in `localStorage` (XSS + persistence risk) |
| ORD-01 | High | “Add items” workflow writes metadata only (not real order items) |
| ORD-02 | High | Post-auth amount increases are inconsistent/unsafe (Stripe constraints) |
| ORD-03 | High | Address update expects token in body but storefront sends header |
| PAY-01 | High | Payment status model deviates from Medusa v2 (Payment Module bypass) |
| CHK-01 | High | Checkout bypasses Medusa cart completion + payment sessions |
| MNY-01 | High | Money unit mismatch (Medusa v2 major units vs Stripe minor units) |
| INV-01 | High | Inventory decrement is non-atomic + picks arbitrary location + not idempotent |
| REL-01 | Med/High | Stripe idempotency key generation is not idempotent (uses random nonce) |
| PERF-01 | Medium | Stock validation is slow, N+1 calls, and fail-open |
| CONC-01 | Medium | `edit_status` locking is best-effort; not atomic; race windows remain |
| UX-01 | Medium | Cart `updateQuantity` ignores color; can mutate wrong line |

---

# SEC-01 — Client-trust pricing & order contents (Critical)

## Problem
The system allows the **client** to provide price/amount inputs used to create or update Stripe PaymentIntents and (via metadata) to construct Medusa orders. This enables **underpayment**, mismatched order contents, and inconsistent tax/shipping outcomes.

## Where
- Storefront PI creation/update:
  - `apps/storefront/app/routes/api.payment-intent.ts`
    - Reads body: `amount`, `shipping`, `cartItems[].price` (formatted strings)
    - Computes `totalAmount = amount + (shipping || 0)`
    - Sends Stripe `amount = toCents(totalAmount)`
    - Stores metadata:
      - `metadata[cart_data] = { items: [{ variantId, title, price, quantity, ... }] }`
      - `metadata[shipping_amount] = shipping.toString()`
- Backend order creation from Stripe metadata:
  - `apps/backend/src/workflows/create-order-from-stripe.ts`
    - Uses `input.cartData.items` (fed by Stripe metadata)
    - Parses prices from formatted strings (e.g. `"$35.00" -> 35.00`)
    - Uses this to build order line items and inventory adjustments

## Impact
- **Revenue loss**: attacker can pay less than item value.
- **Fraud**: attacker can include expensive `variantId`s with cheap prices.
- **Tax/shipping inconsistencies**: tax-inclusive vs tax-exclusive regions become incorrect if computed client-side.

## Attack path / Repro
1. Call `POST /api/payment-intent` directly and send:
   - expensive `variantId`s in `cartItems`
   - `amount=1`, `shipping=0`
   - `cartItems[].price="$0.01"`
2. Confirm payment.
3. Stripe webhook triggers order creation.
4. Order is created using attacker-controlled pricing metadata.

## Root cause
- Stripe PI metadata is treated as an **authoritative pricing & cart snapshot**.
- There is no server-side pricing authority check against Medusa pricing rules.

## Proposed fix (recommended)
### Option A (preferred): Make Medusa cart the single source of truth
- On PI create/update:
  - Send only `cartId` + shipping option selection (or an order draft id).
  - Server fetches Medusa cart totals (including discounts, taxes, shipping) and sets Stripe PI `amount`.
  - Store `medusa_cart_id` in Stripe metadata.
- On order creation (webhook worker):
  - Fetch Medusa cart/order-draft snapshot.
  - Validate currency and totals vs PI.
  - Create order from that canonical source.

### Option B (mitigation): Validate mismatch and fail closed
- Recompute totals server-side using Medusa data.
- If mismatch with Stripe PI amount/currency -> do not create order; emit audit + alert.

## Acceptance Criteria
- PI amount is derived from server-side totals; client cannot choose amount.
- Order creation does not trust client-provided item prices.
- Mismatch causes a hard fail + audit event.

## Tests
- Tamper request to PI endpoint -> amount ignored/recomputed or request rejected.
- Webhook order creation rejects mismatched totals.

## Observability
- Metric/event: `pricing_mismatch_detected` (order/pi id + expected vs actual)

---

# SEC-02 — `/store/orders/by-payment-intent` is unsafe (Critical)

## Problem
`GET /store/orders/by-payment-intent?payment_intent_id=...`:
- Performs a **full scan** of all orders.
- Returns **unmasked shipping address**.
- Returns a valid **modification token**.

## Where
- `apps/backend/src/api/store/orders/by-payment-intent/route.ts`
  - Full scan via `query.graph({ entity: "order", fields: ["...", "shipping_address.*", "items.*"] })`
  - In-memory filter: `order.metadata?.stripe_payment_intent_id === paymentIntentId`
  - Response includes `shipping_address: order.shipping_address`
  - Generates token via `modificationTokenService.generateToken(...)`

## Impact
- **PII leak**: shipping address exposure.
- **Token mint**: endpoint becomes a token factory.
- **Scalability**: full scan gets slower as orders grow.

## Attack path
- If `payment_intent_id` leaks (URL logs, analytics, referrer, screenshots), attacker can fetch the order + shipping address + modification token.

## Proposed fix
### Phase 0 (emergency)
- Remove PII from response.
- Add `Cache-Control: no-store, private` and `X-Content-Type-Options: nosniff`.
- Return minimal payload:
  - `{ order_id, modification_allowed, remaining_seconds }` (or a polling status only)

### Phase 1 (access control)
- Require proof-of-knowledge:
  - Prefer: require `payment_intent_client_secret` and validate via Stripe that it matches the PI.
  - Better: issue a server-generated `checkout_nonce` at PI creation; store server-side and in HttpOnly cookie; require it here.
- Add rate limiting by IP + PI id.

### Phase 2 (performance)
- Stop scanning:
  - Store an indexed mapping `stripe_payment_intent_id -> order_id` in DB.

## Acceptance Criteria
- No PII returned.
- No full table scan.
- Caller must prove they own the checkout session.
- Rate limiting prevents brute force.

## Tests
- Security test: PI id alone cannot retrieve order PII/token.
- Performance test: lookup is indexed / bounded.

---

# SEC-03 — Token expiry anchoring: add regression protection (High)

## Problem
Modification tokens must **never** extend beyond the business-defined modification window.

## Current state (verify)
- `apps/backend/src/api/store/orders/by-payment-intent/route.ts` currently passes `order.created_at` into `generateToken(...)` (good).
- Other call sites (`workflows/create-order-from-stripe.ts`, `subscribers/order-placed.ts`) also anchor to order creation time.

## Risk
This is easy to regress (future change removes `created_at` arg). If that happens, tokens could be minted with `exp = now + window`, effectively extending modification indefinitely.

## Proposed fix
- Add unit/integration tests ensuring:
  - Token `exp` is anchored to order creation time.
  - Tokens minted after window expiry still have `remaining_seconds=0`.
- Add a code-level guard in `generateToken`:
  - Optionally require `createdAt` for all non-test usage, or log/warn when omitted.

## Acceptance Criteria
- Tests fail if any production call site omits `createdAt`.

---

# SEC-04 — PI client secret leak via Referrer on success page (High)

## Problem
The success page URL contains `payment_intent_client_secret`. The page also makes a third-party request which can include the URL in the `Referer` header.

## Where
- `apps/storefront/app/routes/checkout.success.tsx`
  - Reads `payment_intent_client_secret` from `window.location.search`.
  - Performs `monitoredFetch("https://nominatim.openstreetmap.org/search?..." )`.

## Impact
- Leakage of Stripe PI client secret to third parties (via `Referer`).
- Downstream risk: using leaked client secret + PI id to query endpoints or infer order/session state.

## Proposed fix
- Immediately remove query params after extracting values:
  - `history.replaceState({}, "", "/checkout/success")`
- Set `Referrer-Policy` to `no-referrer` or `strict-origin`.
- Consider moving geocoding server-side or removing it.

## Acceptance Criteria
- No outbound request from success page contains referrer with PI secret.

---

# SEC-05 — Modification token stored in `localStorage` (High)

## Problem
The storefront stores the modification token in `localStorage`, which is accessible to any XSS payload and can persist beyond the user’s intended session.

## Where
- `apps/storefront/app/routes/checkout.success.tsx`
  - `localStorage.setItem('modificationToken', data.modification_token)`

## Impact
- If XSS exists anywhere on storefront, attacker can steal tokens.
- Tokens may remain on shared/public devices.

## Proposed fix
- Prefer HttpOnly cookie storage for sensitive tokens.
- If that’s too heavy, use `sessionStorage` instead of `localStorage` and wipe on tab close.
- Add explicit logout/clear action and clear on successful capture / window expiry.

## Acceptance Criteria
- Token is not persisted in `localStorage`.
- Token is cleared when window expires or after capture.

---

# ORD-01 — “Add items” workflow is metadata-only (High)

## Problem
Adding items during the modification window does **not** create real Medusa order line items; it only updates order metadata.

## Where
- `apps/backend/src/workflows/add-item-to-order.ts`
  - Updates:
    - `metadata.added_items = JSON.stringify([...])`
    - `metadata.updated_total = input.newTotal`
  - Does not create an actual `order.items` record.
- Guest view:
  - `apps/backend/src/api/store/orders/[id]/guest-view/route.ts` returns `order.items` only and does not merge `metadata.added_items`.

## Impact
- Customer can be charged for added items (capture uses `updated_total`) but fulfillment cannot see items.
- Inventory may not be adjusted for added items.

## Proposed fix
- Implement real order edits:
  - Use Medusa’s order edit / order change mechanisms.
  - Ensure recalculation uses Medusa totals.
  - Ensure inventory is reserved/adjusted.

## Acceptance Criteria
- After “Add item”, the item appears in DB-backed `order.items` and in guest view after refresh.
- Capture amount equals recomputed Medusa total.

---

# ORD-02 — Post-auth amount increases are inconsistent/unsafe (High)

## Problem
Two modification paths treat increasing authorized amount differently:
- Add-item workflow attempts to do `stripe.paymentIntents.update({ amount: newAmount })`.
- Quantity workflow explicitly refuses increasing amount once PI is authorized (`requires_capture`).

## Where
- `apps/backend/src/workflows/add-item-to-order.ts`
  - `stripe.paymentIntents.update(input.paymentIntentId, { amount: input.newAmount })`
- `apps/backend/src/workflows/update-line-item-quantity.ts`
  - If PI is `requires_capture` and new amount > current -> throws.

## Impact
- Some “increase total” flows may fail unpredictably depending on Stripe/payment method rules.
- System can enter inconsistent states if Stripe update succeeds but DB write fails (workflow logs critical alert).

## Proposed fix
Pick one product/engineering stance:
- **Option A (safer)**: Disallow increases after auth everywhere.
- **Option B**: Implement incremental authorization correctly (eligibility-based) and handle failures with clear UX.

## Acceptance Criteria
- Behavior is consistent across add-item and update-qty paths.

---

# ORD-03 — Address update token transport mismatch (High, low effort)

## Problem
Storefront sends modification token via header, but backend expects it in the request body.

## Where
- Storefront:
  - `apps/storefront/app/routes/order_.status.$id.tsx` sends `x-modification-token` header.
- Backend:
  - `apps/backend/src/api/store/orders/[id]/address/route.ts` expects `{ token, address }` in body.

## Impact
- Address updates fail with `TOKEN_REQUIRED`.

## Proposed fix
- Backend should accept token from `x-modification-token` header (primary) and fall back to body for compatibility.

## Acceptance Criteria
- Address update works with current storefront request.

---

# PAY-01 — Payment status model deviates from Medusa v2 (Payment Module bypass) (High)

## Problem
The repo treats payment state as `order.metadata.payment_status` and flips `order.status` to `completed` on capture.
 
This bypasses Medusa v2’s canonical payment modeling:
- Payment Collections / Payment Sessions / Payments (Payment Module)
- Order Transactions (Order Module)

## Official Medusa v2 behavior (docs)
- Payment Collection is the starting point for payment processing and holds payment sessions, payments, and providers:
  - https://docs.medusajs.com/resources/commerce-modules/payment/payment-collection
- Payment Session is an amount to authorize; `status` includes `pending`, `requires_more`, `authorized`, `error`, `canceled`:
  - https://docs.medusajs.com/resources/commerce-modules/payment/payment-session
- Transactions balance paid vs outstanding amounts; the Order Module doesn’t store payments directly and references Payment Module records:
  - https://docs.medusajs.com/resources/commerce-modules/order/transactions

## Where (current repo)
- Capture worker writes capture state to order metadata (not Payment Module records):
  - `apps/backend/src/workers/payment-capture-worker.ts`
    - Sets `metadata.payment_status = "captured"`: lines **285-293**
    - Sets `status = "completed"`: lines **295-297**
- Stripe webhook handler repeats the same metadata-based update:
  - `apps/backend/src/loaders/stripe-event-worker.ts`
    - Sets `metadata.payment_status = "captured"`: lines **242-250**
    - Sets `status = "completed"`: lines **254-256**
- Cancellation logic gates on metadata payment status (not Payment Collection status / transactions):
  - `apps/backend/src/workflows/cancel-order-with-refund.ts`
    - Reads `(order.metadata as ...).payment_status`: lines **168-174**
- Orders can exist without Payment Collections:
  - `apps/backend/src/scripts/check-payment-capture-status.ts`
    - Logs “No Payment Collections found for this order”: lines **59-67**
- Stripe webhook order creation does not explicitly create Payment Collections / Transactions:
  - `apps/backend/src/workflows/create-order-from-stripe.ts`
    - Uses `createOrdersWorkflow.runAsStep(...)`: lines **344-347**
    - Only persists `metadata.stripe_payment_intent_id`: lines **171-183**

## Impact
- Medusa Admin + downstream logic can’t reliably use canonical payment primitives (`payment_collections[].status`, transactions/outstanding amount).
- Higher risk of drift between Stripe state and Medusa state (since Payment Module is not authoritative here).
- Harder to safely support partial captures, refunds, and order edits that require additional payment/refund.

## Proposed fix
- Align to Medusa’s Payment Module + Transactions model:
  - Ensure a Payment Collection exists for orders created via Stripe webhook (store Stripe PI id in provider `data`).
  - On authorization/capture/refund, update Payment Module records and create Order Transactions referencing them.
- Treat `order.metadata.payment_status` as legacy/debug-only (or remove after migration).

## Acceptance Criteria
- Payment state is readable via canonical Medusa fields (Payment Collections + Transactions), not only `order.metadata`.
- Capture/cancel/refund flows do not rely on `order.metadata.payment_status` to determine canonical payment state.

---

# CHK-01 — Checkout bypasses Medusa payment sessions + complete cart (High)

## Problem
Medusa v2’s canonical checkout is cart-centric:
- Cart is linked to a Payment Collection.
- Storefront initializes Payment Sessions via Medusa.
- After payment provider actions, storefront completes the cart (`cart.complete`) to place the order.

This repo instead runs a Stripe-first flow:
- Storefront creates/updates Stripe PaymentIntents directly.
- Order is created asynchronously from Stripe webhooks (not from cart completion).
- No Payment Sessions are initialized and the Store “Complete Cart” step is never executed.

## Official Medusa v2 behavior (docs)
- Checkout payment step includes creating a payment collection (if missing) and initializing payment sessions (or `initiatePaymentSession` in the JS SDK):
  - https://docs.medusajs.com/resources/storefront-development/checkout/payment
- Stripe storefront flow obtains `client_secret` from `cart.payment_collection.payment_sessions[0].data.client_secret`, then calls `sdk.store.cart.complete(cart.id)` after `confirmCardPayment`:
  - https://docs.medusajs.com/resources/storefront-development/checkout/payment/stripe
- Completing cart places the order and returns `{ type: "order", order }` on success:
  - https://docs.medusajs.com/resources/storefront-development/checkout/complete-cart

## Where (current repo)
- Storefront creates/updates Stripe PaymentIntent directly:
  - `apps/storefront/app/routes/checkout.tsx`
    - Builds `requestData` with `amount`, `shipping`, `cartItems`, optional `paymentIntentId`: lines **137-153**
    - Calls `POST /api/payment-intent`: lines **169-178**
- Storefront server route calls Stripe PaymentIntents API (not Medusa payment sessions):
  - `apps/storefront/app/routes/api.payment-intent.ts`
    - Sets Stripe `amount = toCents(totalAmount)` and calls `https://api.stripe.com/v1/payment_intents`: lines **322-380**
    - Stores cart snapshot in Stripe metadata (`metadata[cart_data]`, `metadata[shipping_amount]`): lines **348-375**
- Success page confirms Stripe PI and polls a custom Medusa endpoint instead of using `cart.complete` result:
  - `apps/storefront/app/routes/checkout.success.tsx`
    - `stripe.retrievePaymentIntent(...)`: lines **124-133**
    - Polls `GET /store/orders/by-payment-intent`: lines **215-274**
- Backend creates orders from Stripe webhooks (not from cart completion):
  - `apps/backend/src/loaders/stripe-event-worker.ts`
    - Handles `payment_intent.amount_capturable_updated`: lines **55-57**
    - Invokes order creation from PaymentIntent: lines **120-134**, **370-381**
  - `apps/backend/src/workflows/create-order-from-stripe.ts`
    - Creates orders via `createOrdersWorkflow.runAsStep(...)` (no cart completion / payment sessions): lines **344-347**
- Medusa cart is used for item sync + shipping option quotes only (no payment/complete):
  - `apps/storefront/app/services/medusa-cart.ts`
    - Exposes `getOrCreateCart`, `syncCartItems`, `updateShippingAddress`, `getShippingOptions`: lines **71-242**
- Shipping method selection is not persisted as a Medusa shipping option; order creation synthesizes a shipping method from a raw amount:
  - `apps/backend/src/workflows/create-order-from-stripe.ts`
    - Builds `shipping_methods` from `shippingAmount` and hardcodes name: lines **148-154**

## Impact
- Medusa checkout invariants are bypassed (Payment Session `requires_more` flows, canonical error handling, provider abstraction).
- Order confirmation requires polling and/or querying by PaymentIntent ID.
- Shipping method selection is not modeled as a real shipping option selection in the cart/order.

## Proposed fix
- Prefer adopting canonical Medusa v2 checkout:
  - Cart -> shipping method -> payment sessions -> `cart.complete` -> order confirmation.
- If Stripe-first flow is retained, mirror Medusa models:
  - Create a Payment Collection/Session linked to the cart/order.
  - Create the order via a transactional “complete” step (avoid webhook-only order creation).

## Acceptance Criteria
- Checkout uses Medusa payment sessions and completes the cart, returning an order synchronously (or provides equivalent canonical Medusa records if custom flow is retained).
- Shipping method selection is persisted using a shipping option ID, not just a raw amount.

---

# MNY-01 — Money unit mismatch (Medusa v2 major units vs Stripe minor units) (High)

## Problem
Medusa v2 stores monetary values in **major units** (for example, `$20.00` stored as `20`), while Stripe APIs require **minor units** (cents) integers.

This repo mixes assumptions about which unit Medusa returns/stores:
- Backend capture assumes Medusa order totals are **major units** and multiplies by 100 for Stripe capture.
- Storefront order pages render Medusa order amounts as if they’re **minor units** (divide by 100).
- Shipping amounts are passed through Stripe metadata with ambiguous units and then parsed as integers.

## Official Medusa v2 behavior (docs)
- Pricing: `Price.amount` is stored in major units (`$20.00` -> `20`):
  - https://docs.medusajs.com/resources/commerce-modules/pricing/concepts
- Order totals: `OrderSummary.totals.total` is a unit amount (example `total: 30`):
  - https://docs.medusajs.com/resources/commerce-modules/order/transactions
- Storefront order confirmation examples format `item.unit_price` directly (no `/ 100`):
  - https://docs.medusajs.com/resources/storefront-development/checkout/order-confirmation

## Where (current repo)
- Backend capture converts Medusa total -> Stripe cents:
  - `apps/backend/src/workers/payment-capture-worker.ts`
    - `const totalCents = Math.round(total * 100)`: lines **184-188**
- Storefront renders Medusa order amounts as if they’re cents:
  - `apps/storefront/app/routes/order_.status.$id.tsx`
    - `(item.unit_price / 100)`: line **439**
    - `(orderDetails.total / 100)`: line **446**
- Storefront utilities/comments encode the opposite assumption (“Medusa is cents”):
  - `apps/storefront/app/lib/price.ts`
    - `formatPriceCents(...)` comment (“Used for Medusa prices which are stored in cents”): lines **82-95**
- Shipping option amounts are inconsistently described:
  - `apps/storefront/app/routes/api.shipping-rates.ts`
    - “Medusa API returns prices in cents (smallest currency unit).”: lines **34-36**
  - `apps/storefront/app/routes/api.carts.$id.shipping-options.ts`
    - “amounts are in dollars from Medusa”: line **30**
- Stripe metadata `shipping_amount` unit ambiguity:
  - `apps/storefront/app/routes/checkout.tsx`
    - Sends `shipping: selectedShipping?.amount`: line **140**
  - `apps/storefront/app/routes/api.payment-intent.ts`
    - `const totalAmount = amount + (shipping || 0)`: line **262**
    - `body.append("amount", toCents(totalAmount).toString())`: lines **322-324**
    - Stores `metadata[shipping_amount] = shipping.toString()`: line **372**
  - `apps/backend/src/loaders/stripe-event-worker.ts`
    - “stored in cents” + `parseInt(metadata.shipping_amount, 10)`: lines **313-315**
  - `apps/backend/src/workflows/create-order-from-stripe.ts`
    - Input comment says “Shipping cost in cents”: line **39**
    - Uses `shippingAmount` directly as shipping method `amount`: lines **148-153**

## Impact
- 100x display/capture errors are possible depending on which unit assumption is applied at a boundary.
- Shipping totals can be truncated (`parseInt`) and/or recorded in a different unit than the Stripe PaymentIntent amount, complicating reconciliation.

## Proposed fix
- Adopt the canonical Medusa v2 invariant:
  - **All Medusa-stored prices/totals/shipping amounts are major units.**
  - **Convert to Stripe cents only at the Stripe boundary** (PI create/update, capture, refunds).
- Fix storefront rendering:
  - Remove `/ 100` formatting for Medusa order totals; use `Intl.NumberFormat` with the order currency (as Medusa docs show).
- Eliminate ambiguous money-in-metadata patterns:
  - Prefer storing stable identifiers (for example `cart_id`, `shipping_option_id`) and recomputing totals server-side.
  - If amounts must be stored in Stripe metadata, store explicit unit-suffixed fields (for example `shipping_amount_major`, `shipping_amount_cents`).

## Acceptance Criteria
- No storefront rendering divides Medusa order amounts by 100.
- Stripe amounts are always derived by `toCents(<major-unit>)` at API boundaries.
- Shipping amount used to create the Medusa order is in major units and reconciles with the Stripe PaymentIntent amount.

## Tests
- Unit: a known Medusa total (major units) results in correct Stripe cents.
- Integration: checkout with shipping yields consistent Stripe amount, Medusa order totals, and storefront display.

---

# INV-01 — Inventory decrement is non-atomic + wrong location selection + not idempotent (High)

## Problem
Inventory is decremented by:
- reading `stocked_quantity` then writing `stocked_quantity - item.quantity` (non-atomic)
- selecting the **first** inventory level/location
- performing no idempotency guard (workflow retries can double-decrement)

## Where
- `apps/backend/src/workflows/create-order-from-stripe.ts`
  - `prepareInventoryAdjustmentsStep`:
    - queries `inventory_level` by `inventory_item_id`
    - picks `inventoryLevels[0]`
    - writes `stocked_quantity: currentStockedQuantity - item.quantity`

## Impact
- Oversell under concurrency.
- Stock can go negative.
- Wrong warehouse/location can be decremented.
- Retry of workflow can decrement multiple times.

## Proposed fix
- Use Medusa inventory reservation / allocation mechanisms rather than raw “set absolute quantity”.
- Ensure adjustments are atomic:
  - use inventory service decrement operation or DB transactional update.
- Determine correct location by:
  - order region / sales channel / shipping method mapping
- Add idempotency:
  - store an `inventory_adjusted=true` marker in order metadata keyed by order id + workflow run id
  - or ensure workflow step is idempotent by design.

## Acceptance Criteria
- Inventory decrements are atomic and location-correct.
- Retried order creation does not double-decrement.

---

# REL-01 — Stripe idempotency key generation is not idempotent (Med/High)

## Problem
PI creation “idempotency” key includes randomness, making it effectively **not idempotent**.

## Where
- `apps/storefront/app/routes/api.payment-intent.ts`
  - `generateIdempotencyKey(...)` includes:
    - time bucket
    - `const nonce = Math.random().toString(36)...`

## Impact
- Retries can create multiple PaymentIntents.
- Can cause double authorization attempts and confusing payment state.

## Proposed fix
- Make idempotency truly deterministic for a given checkout session:
  - Use Medusa `cartId` + stable session nonce stored once (cookie/localStorage) + currency.
  - Do not use per-request randomness.
- Also consider storing PI id server-side for the cart and reusing it.

## Acceptance Criteria
- Same checkout attempt yields same idempotency key for retries.

---

# PERF-01 — Stock validation is slow + fail-open (Medium)

## Problem
Stock validation does N sequential network calls and fails open if Medusa API errors.

## Where
- `apps/storefront/app/routes/api.payment-intent.ts`
  - `validateStock(...)` loops items and calls:
    - `/store/products?variants.id=...&fields=*variants.inventory_quantity`
  - On exception it logs and continues (checkout not blocked).

## Impact
- Latency at checkout.
- Oversell when Medusa is slow/unavailable.
- `inventory_quantity` may not reflect reservations/backorders.

## Proposed fix
- Batch stock checks:
  - fetch all needed variants in one query (or a backend endpoint that accepts variant IDs)
- Decide fail strategy:
  - for high-demand items, fail closed
  - or allow checkout but mark order as `requires_manual_stock_review`
- Prefer server-side reservation at order creation.

## Acceptance Criteria
- Stock checks do not do N sequential calls.
- Failure mode is explicit and observable.

---

# CONC-01 — `edit_status` lock is best-effort and not atomic (Medium)

## Problem
Locking is done via metadata updates without atomic compare-and-set.

## Where
- `apps/backend/src/workers/payment-capture-worker.ts`
  - `setOrderEditStatus(orderId, "locked_for_capture")` updates metadata
- Modification workflows check `order.metadata.edit_status`:
  - `apps/backend/src/workflows/add-item-to-order.ts`
  - `apps/backend/src/workflows/update-line-item-quantity.ts`

## Impact
- Race window where modification can start right before capture lock is written.
- Two processes can "acquire" lock simultaneously.

## Proposed fix
- Use a distributed lock (Redis) or DB transactional lock for `orderId`.
- If staying with metadata locking:
  - implement compare-and-set semantics (expected current status)
  - fail modification if lock acquisition can’t be guaranteed

## Acceptance Criteria
- Concurrent capture + modification cannot both proceed.

---

# UX-01 — Cart `updateQuantity` ignores color (Medium)

## Problem
Cart supports multiple items with same `id` but different `color` (addToCart uses both `id` and `color`), but `updateQuantity` updates by `id` only.

## Where
- `apps/storefront/app/context/CartContext.tsx`
  - `addToCart` matches on `productIdsEqual(item.id, newItem.id) && item.color === newItem.color`
  - `updateQuantity` matches on `productIdsEqual(item.id, id)` only

## Impact
- Changing quantity for one color can inadvertently change quantity for other colors of the same product.

## Proposed fix
- Update `updateQuantity` signature to accept optional `color`, mirroring `removeFromCart`.
- Ensure UI passes the correct `color`.

## Acceptance Criteria
- Quantity update affects exactly one cart line.

---

## Notes for Implementation Agents
- Prioritize **SEC-01** and **SEC-02** first: they are systemic security/correctness risks.
- Money/unit normalization (**MNY-01**) is a prerequisite for safe capture and safe modifications.
- “Add items” correctness (**ORD-01**) requires real Medusa order edit mechanics; metadata-only will keep producing fulfillment mismatches.
