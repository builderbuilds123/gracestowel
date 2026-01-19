# Story: Cart Migration to Align with Medusa Storefront Docs

Date: 2026-01-19
Owner: Engineering
Status: Draft

## Objective
Align the storefront cart implementation with Medusa’s cart docs for create/retrieve/context/update/promotions/totals, while preserving current checkout behavior.

## Scope
- Storefront only (`apps/storefront`)
- Medusa cart API routes + cart state management
- No backend business logic changes

## References
- Medusa Cart Create: <https://docs.medusajs.com/resources/storefront-development/cart/create>
- Medusa Cart Retrieve: <https://docs.medusajs.com/resources/storefront-development/cart/retrieve>
- Medusa Cart Context: <https://docs.medusajs.com/resources/storefront-development/cart/context>
- Medusa Cart Update: <https://docs.medusajs.com/resources/storefront-development/cart/update>
- Manage Line Items: <https://docs.medusajs.com/resources/storefront-development/cart/manage-items>
- Manage Promotions: <https://docs.medusajs.com/resources/storefront-development/cart/manage-promotions>
- Show Totals: <https://docs.medusajs.com/resources/storefront-development/cart/totals>

---

## Current State Summary
- Local cart state lives in `CartContext` and localStorage.
- Medusa cart exists but is created primarily in checkout flows and stored in sessionStorage.
- Totals are computed locally instead of using Medusa cart totals.
- Cart transfer to authenticated user is not implemented.

---

## Plan (Prioritized)

### Priority 0 — Correctness & User Trust
1) **Expose Medusa cart totals**
   - Add `subtotal`, `discount_total`, `shipping_total`, `tax_total`, `total`, `currency_code` to `GET /api/carts/:id` response.

2) **Use Medusa totals in checkout UI**
   - Prefer Medusa totals when available, keep local totals as fallback.

### Priority 1 — Core Alignment
3) **Create cart on first cart interaction**
   - Create cart when the user adds the first item and persist `cart_id` in localStorage.

4) **Introduce Medusa Cart Context**
   - Store Medusa cart object + actions in a new context, or refactor `CartContext` to wrap Medusa cart.

5) **Transfer cart on login**
   - When user authenticates, transfer guest cart to customer using Medusa flow.

### Priority 2 — Maintainability & Performance
6) **Reduce sync chatter**
   - Optimize `syncCartItems` to avoid unnecessary calls and reduce N+1 updates.

7) **Unify region/locale handling**
   - Ensure region + sales channel + locale are set consistently on cart create/update.

---

## Acceptance Criteria
- Medusa totals are returned and used for display when available.
- Cart ID persists across sessions (localStorage), and cart is recreated only when expired.
- Cart is transferred when the user logs in.
- Cart context exposes Medusa cart object and actions.
- Line-item sync avoids redundant calls.

## Risks & Notes
- Ensure UI never regresses during migration; keep local totals as fallback until stable.
- Cart transfer must avoid duplicate carts for logged-in users.

