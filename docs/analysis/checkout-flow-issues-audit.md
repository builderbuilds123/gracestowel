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
- **Medusa order totals**: should be treated as **minor units** (confirm in your Medusa v2 configuration and enforce).
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
| MNY-01 | High | Money units inconsistent; capture worker heuristic can under/overcharge |
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

# MNY-01 — Money units inconsistent; capture worker heuristic can under/overcharge (High)

## Problem
Money values are represented inconsistently across storefront/backend:
- Storefront totals are in **dollars** (parsed from formatted strings).
- Stripe uses **cents**.
- Some backend workflow code/comments assume **dollars**, while other parts use **cents**.
- Capture worker tries to infer units with a heuristic that fails when totals are integer dollars.

## Where
- Storefront:
  - `apps/storefront/app/lib/price.ts` (`calculateTotal`, `toCents`)
  - `apps/storefront/app/routes/api.payment-intent.ts` computes `totalAmount` in dollars then converts to cents
- Backend:
  - `apps/backend/src/workflows/create-order-from-stripe.ts` parses formatted prices and sets `unit_price` based on that parsing.
- Capture:
  - `apps/backend/src/workers/payment-capture-worker.ts`:
    - `const totalCents = Number.isInteger(total) ? total : Math.round(total * 100);`

## Why the heuristic is dangerous
If `order.total` is stored as integer dollars (e.g. `35` meaning $35.00), `Number.isInteger(total)` is true and the worker will treat it as **35 cents**.

## Proposed fix
- Declare and enforce a single money invariant across the repo:
  - **All persisted totals and Stripe amounts are minor units (cents) integers**.
- Remove heuristic conversion; instead:
  - Validate totals are integers.
  - Fail closed (do not capture) if totals are not integer minor units.
- Update all workflows and storefront boundary DTOs to be explicit:
  - Rename fields like `totalCents`, `shippingCents`, `unitPriceCents`.

## Acceptance Criteria
- Capture worker only accepts integer minor units.
- No path stores dollars in `order.total` or `metadata.updated_total`.

## Tests
- Unit test: integer dollar totals must not be misinterpreted.
- Integration: order total stored in cents yields correct capture amount.

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
