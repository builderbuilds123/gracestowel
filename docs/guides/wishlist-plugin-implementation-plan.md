# Wishlist Plugin Implementation Plan

> Based on [Medusa Wishlist Plugin Guide](https://docs.medusajs.com/resources/plugins/guides/wishlist).  
> **Important:** The official guide uses a **separate plugin package** and **Next.js storefront**. This project uses an **in-app wishlist module** inside `apps/backend` and a **React Router v7 + Cloudflare Workers** storefront. This plan adapts the guide accordingly.

---

## 1. Current State

### 1.1 Storefront (client-only today)

- **`WishlistContext`** (`apps/storefront/app/context/WishlistContext.tsx`): localStorage-backed wishlist. Items are `{ id, handle, title, price, image, addedAt }` where `id` is the **product variant ID**.
- **`WishlistButton`**: Uses `toggleItem(product)` with `product.id` (variant id), `handle`, `title`, `price`, `image`.
- **`/wishlist`** route: Renders list, “Add to cart”, “Clear all”. No backend.
- **Auth:** Customer token in `medusa_customer_token` (localStorage); `getAuthToken()` from `CustomerContext`. Authenticated store calls use `medusaFetch` + `x-publishable-api-key` + `Authorization: Bearer ${token}` when needed (e.g. `account.tsx`, `CustomerContext`).

### 1.2 Backend

- **No wishlist today.** Only `review` and `resend` as in-app modules under `apps/backend/src/modules/`.
- **Links:** `apps/backend/src/links/reservation-line-item.ts` defines a link; Medusa loads links from this area (convention or config).
- **Store auth:** `AuthenticatedMedusaRequest` and publishable-key checks are used on store routes (e.g. `apps/backend/src/api/store/orders/[id]/route.ts`).
- **Modules:** Registered in `medusa-config.ts` via `resolve: "./src/modules/..."`.

### 1.3 Differences from the official guide

| Aspect | Official guide | This project |
|--------|-----------------|---------------|
| Structure | Separate plugin package, `npx medusa plugin:add` | In-app module under `apps/backend/src/modules/wishlist` |
| Storefront | Next.js starter | React Router v7, Cloudflare Workers, `medusaFetch` |
| Plugin lifecycle | `medusa plugin:develop`, `plugin:db:generate` | Normal app: `npm run migrate`, migrations in module folder |
| Admin widgets | Plugin admin widget for “wishlist count” | Optional later; not required for parity with current UX |

---

## 2. Architecture Overview

We implement the **same API surface and behavior** as the guide, but inside the monorepo:

1. **Backend:** Wishlist **module** (data models, service, migrations) + **links** (Wishlist↔Customer, Wishlist↔SalesChannel, WishlistItem↔ProductVariant) + **workflows** + **store API routes** under `/store/customers/me/wishlists...`.
2. **Storefront:**  
   - **Logged-in:** Use backend wishlist APIs; sync/mirror in React state for UI.  
   - **Guest:** Keep current localStorage-only behaviour so “Save” still works without login. **Guest wishlists never persist to the database** (no API calls) and are lost if the browser storage is cleared. Optionally prompt “Sign in to sync your wishlist across devices”.
   - **Guest → customer conversion:** When a guest **signs in or signs up**, any items in their localStorage wishlist are **automatically transferred** to their logged-in profile (i.e. written to the backend via the wishlist API). After a successful transfer, the local list is cleared so the account wishlist is the single source of truth.

Data model (align with guide):

- **Wishlist:** `id`, `customer_id`, `sales_channel_id`, relation to items.
- **WishlistItem:** `id`, `product_variant_id`, `wishlist_id` (via relation).

Unique constraints:

- One wishlist per (`customer_id`, `sales_channel_id`).
- One item per (`product_variant_id`, `wishlist_id`).

---

## 3. Backend Implementation Plan

### 3.1 Wishlist module (Step 4 in the guide)

**Location:** `apps/backend/src/modules/wishlist/`

| Task | Path | Description |
|------|------|-------------|
| Models | `models/wishlist.ts` | `Wishlist`: id, customer_id, sales_channel_id, `hasMany` WishlistItem. Unique index on `[customer_id, sales_channel_id]`. |
| Models | `models/wishlist-item.ts` | `WishlistItem`: id, product_variant_id, `belongsTo` Wishlist. Unique index on `[product_variant_id, wishlist_id]`. |
| Service | `service.ts` | `WishlistModuleService` extending `MedusaService({ Wishlist, WishlistItem })`. |
| Module def | `index.ts` | `Module("wishlist", { service: WishlistModuleService })`, export `WISHLIST_MODULE`. |

Use `model` from `@medusajs/framework/utils` and follow existing patterns in `apps/backend/src/modules/review/`.

### 3.2 Module links (Step 5 in the guide)

**Location:** `apps/backend/src/links/` (existing links folder; same pattern as `reservation-line-item.ts`)

| File | Link | Purpose |
|------|------|---------|
| `wishlist-customer.ts` | Wishlist `customer_id` → Customer | Resolve customer for a wishlist (read-only per guide). |
| `wishlist-sales-channel.ts` | Wishlist `sales_channel_id` → SalesChannel | Resolve sales channel (read-only). |
| `wishlist-item-product.ts` | WishlistItem `product_variant_id` → ProductVariant | Resolve variant for an item (read-only). |

Use `defineLink` from `@medusajs/framework/utils`. Reference the local wishlist module (e.g. `import WishlistModule from "../modules/wishlist"` or the resolved path your app uses). Core modules: `@medusajs/medusa/customer`, `@medusajs/medusa/sales-channel`, `@medusajs/medusa/product` — confirm exact export names in [Medusa v2 module docs](https://docs.medusajs.com/learn/fundamentals/module-links).

Links in `src/links/` are loaded by Medusa by convention (see `reservation-line-item.ts`). If your setup uses a different mechanism, register the new link files there.

### 3.3 Migrations

- **Generate:** From backend root, run the Medusa CLI that generates migrations for custom modules (e.g. `npx medusa db:generate` or module-specific command; see [Medusa v2 docs](https://docs.medusajs.com/v2) and existing `review` migrations under `src/modules/review/migrations/`).
- **Run:** `cd apps/backend && npm run migrate` so wishlist tables exist before testing.

### 3.4 Register module

In `medusa-config.ts`:

```ts
{
  resolve: "./src/modules/wishlist",
},
```

Same pattern as `resolve: "./src/modules/review"`.

### 3.5 Workflows (Steps 6, 9, 10 in the guide)

Implement workflows and steps under `apps/backend/src/workflows/` (and `workflows/steps/` if you use a steps folder). Use **product/variant** terminology consistent with the codebase (guide uses “variant”).

| Workflow | Steps | Purpose |
|----------|--------|---------|
| **create-wishlist** | validateCustomerCreateWishlistStep, createWishlistStep | Ensure at most one wishlist per (customer, sales_channel); create it. |
| **create-wishlist-item** | useQueryGraphStep (wishlist by customer_id), validateWishlistExists, validateWishlistSalesChannel, validateVariantWishlist, createWishlistItemStep, refetch wishlist | Add variant to wishlist; enforce sales channel and “variant not already in list”. |
| **delete-wishlist-item** | useQueryGraphStep, validateWishlistExists, validateItemInWishlist, deleteWishlistItemStep, refetch wishlist | Remove item by id. |

- Reuse **useQueryGraphStep** from `@medusajs/medusa/core-flows` where the guide does.
- **Query entity names:** Use the same names the Query API expects for wishlist/wishlist_item (e.g. `entity: "wishlist"`, `entity: "variant"` or `entity: "product_variant"` per Medusa v2).
- **Compensation:** In create/delete steps, use `StepResponse` and compensation to delete/restore as in the guide.

### 3.6 Store API routes (Steps 7, 8, 9, 10)

All under `apps/backend/src/api/store/`, with **customer auth** and **publishable key** checks.

| Method | Path | Handler | Behaviour |
|--------|------|---------|-----------|
| POST | `/store/customers/me/wishlists` | Create wishlist | Require `req.publishable_key_context?.sales_channel_ids?.length`; run createWishlistWorkflow with `customer_id: req.auth_context.actor_id`, `sales_channel_id: sales_channel_ids[0]`. Return `{ wishlist }`. |
| GET | `/store/customers/me/wishlists` | Get my wishlist | Use Query `entity: "wishlist"`, `filters: { customer_id: req.auth_context.actor_id }`, fields including items and `items.product_variant.*`. 404 if none. Return `{ wishlist }`. |
| POST | `/store/customers/me/wishlists/items` | Add item | Require publishable key + body `variant_id`. Run createWishlistItemWorkflow; return `{ wishlist }`. Add Zod schema and body validation (e.g. in validators + middleware) as in the guide. |
| DELETE | `/store/customers/me/wishlists/items/[id]` | Remove item | Run deleteWishlistItemWorkflow with `wishlist_item_id: req.params.id`, `customer_id: req.auth_context.actor_id`. Return `{ wishlist }`. |

- Use **`AuthenticatedMedusaRequest`** so only logged-in customers hit these routes.
- Use **MedusaError** with correct types (e.g. NOT_FOUND, INVALID_DATA) and consistent JSON responses.

### 3.7 Middlewares (Step 9 – body validation)

- **Validator:** e.g. `apps/backend/src/api/store/customers/me/wishlists/items/validators.ts` with Zod schema `PostStoreCreateWishlistItem = z.object({ variant_id: z.string() })`.
- **Middleware:** Apply `validateAndTransformBody(PostStoreCreateWishlistItem)` to `POST /store/customers/me/wishlists/items` via `defineMiddlewares` in the project’s middlewares file (see Medusa v2 “[API Routes – Middlewares](https://docs.medusajs.com/learn/fundamentals/api-routes/middlewares)” and where this app defines middlewares).

---

## 4. Storefront Implementation Plan (React Router v7, no Next.js)

### 4.1 Design choices

- **Guest users:** Keep current behaviour: wishlist is localStorage-only; `WishlistContext` and `/wishlist` work as today. **No backend calls and no DB persistence** for guests.
- **Logged-in users:** Use backend as source of truth. When logged in, wishlist comes from the API; localStorage is only used for **guest items before** they are transferred (see below).
- **Guest → customer transfer:** When a guest signs in or signs up, their localStorage wishlist is **merged** into the logged-in profile, then local storage is cleared so the server is the single source of truth from that moment on.

### 4.2 Guest → customer wishlist transfer (merge on login/sign-up)

When a guest who has items in their **localStorage** wishlist signs in or signs up, those items must be transferred to their backend wishlist so nothing is lost.

**Trigger:** The moment the user becomes authenticated — i.e. when `isAuthenticated` becomes true and we have a valid token (e.g. right after successful `login`, `loginWithGoogle`, or `register` in `CustomerContext`).

**Where it runs:** Either (a) in **WishlistContext** when it first sees “we now have a token” (e.g. it subscribes to `CustomerContext.isAuthenticated` or `getAuthToken()`), or (b) in **CustomerContext** after a successful login/register, by calling a WishlistContext helper like `transferGuestWishlistToServer()`. Option (a) keeps auth unaware of wishlist; Option (b) keeps the “do this once after auth” logic in one place. Prefer **(a)** so WishlistContext owns all wishlist behaviour: when it detects “guest → logged-in” (token appears, localStorage has items), it runs the transfer once.

**Steps:**

1. **Detect** “user just became logged-in and has guest items”: e.g. `isAuthenticated === true`, `getAuthToken()` is set, and `localStorage[WISHLIST_STORAGE_KEY]` exists and parses to a non-empty array.
2. **Ensure backend wishlist exists:** `GET /store/customers/me/wishlists`. If 404, call `POST /store/customers/me/wishlists`, then continue.
3. **Upload each guest item:** For each item in the parsed local list, call `POST /store/customers/me/wishlists/items` with body `{ variant_id: item.id }` (guest items use variant id as `id`). **Idempotency:** If the backend returns 4xx for “variant already in wishlist”, ignore and continue — the item is already on the server.
4. **Clear local:** After all requests complete (or after a short debounce), clear `localStorage[WISHLIST_STORAGE_KEY]` and update WishlistContext state so the UI no longer shows duplicate or stale local items.
5. **Refresh from server:** Fetch `GET /store/customers/me/wishlists` and set WishlistContext state from the response so the UI shows the merged list.

**Edge cases:**

- **Empty guest list:** If localStorage has no items or parse fails, skip transfer and only fetch server wishlist.
- **Partial failure:** If some `POST .../items` calls fail (e.g. network or “variant not in sales channel”), still clear local for items that succeeded and refetch; optionally log or surface a non-blocking message like “Some items could not be added to your wishlist.”
- **No double-transfer:** Run transfer only when transitioning guest → logged-in (e.g. token just appeared and local had items). Once local is cleared, the next “logged-in” mount will only fetch from the API.

### 4.3 API client for wishlist

- Use **`medusaFetch`** for all wishlist requests (it already adds `x-publishable-api-key`).
- For **authenticated** calls, add `Authorization: Bearer ${getAuthToken()}` (and only call when `getAuthToken()` is non-null).
- Base path: `MEDUSA_BACKEND_URL` (or whatever `medusaFetch` uses) +:
  - `GET /store/customers/me/wishlists`
  - `POST /store/customers/me/wishlists`
  - `POST /store/customers/me/wishlists/items` with body `{ variant_id }`
  - `DELETE /store/customers/me/wishlists/items/:id`

Create a small **wishlist API** helper (e.g. under `apps/storefront/app/services/` or `lib/`) that wraps `medusaFetch` and injects the auth header when a token is present. Keep it edge-safe (no Node-only APIs). The transfer flow (4.2) will use this helper.

### 4.4 `WishlistContext` behaviour

- **When guest:** Unchanged: read/write localStorage; `items` = current list; `addItem` / `removeItem` / `toggleItem` / `clearWishlist` only touch local state.
- **When logged in:**  
  - On mount (and when `isAuthenticated` turns true), **first run the guest→customer transfer** if applicable (4.2), then fetch `GET /store/customers/me/wishlists`. If 404, call `POST /store/customers/me/wishlists` to create, then fetch again.  
  - Hold “server wishlist” in state. `items` derived from server response (map `items[].product_variant` to `{ id, handle, title, price, image, addedAt }` using Medusa product/variant shape).  
  - `addItem(product)` → `POST .../items` with `variant_id: product.id`; on success, refetch or merge response into state.  
  - `removeItem(id)` → `DELETE .../items/:id` (id = wishlist_item id). Backend returns updated wishlist; use it to update state. If the UI currently uses variant id for “remove”, keep a map variant_id → wishlist_item id or derive from `wishlist.items`.  
  - `toggleItem(product)` → if in list, remove (by wishlist item id); else add (by variant id).  
  - `clearWishlist` → delete each item via API or add a “clear” endpoint later; for now, loop DELETE or add backend “clear” as an extra task.

Ensure **no direct `localStorage`** for wishlist when logged in, so the backend is the single source of truth for signed-in users. The only time localStorage is written during “logged-in” is clearing it after a successful guest→customer transfer.

### 4.5 Mapping backend → current UI shape

Backend returns structures like:

- `wishlist.items[].id` (wishlist item id)
- `wishlist.items[].product_variant_id`
- `wishlist.items[].product_variant` (if expanded)

Current UI uses `WishlistItem { id, handle, title, price, image, addedAt }` where `id` is **variant id** in the existing code. For “Remove” and “Add to cart” you need either:

- **Option A:** In context, store both variant id and wishlist_item id (e.g. `{ variantId, wishlistItemId, ... }`) and use `wishlistItemId` for DELETE.  
- **Option B:** Keep `id` as variant id in the UI and resolve wishlist_item id from the last fetched wishlist when calling DELETE.

Choose one and implement consistently in `removeItem` / `toggleItem` and in the wishlist page (e.g. “Remove” uses the same id the context expects).

### 4.6 `WishlistButton` and product prop

- **WishlistButton** today receives `product: Omit<WishlistItem, "addedAt">` with `id` = variant id. Keep that. When logged in, `toggleItem(product)` will trigger the wrapper that calls POST or DELETE; the context must translate that into the correct variant_id / wishlist_item_id for the API.

### 4.7 Loading and error states

- While fetching or mutating, expose a loading flag (e.g. `isLoading`, `isMutating`) from context so the wishlist page and button can show spinners or disabled state. During **guest→customer transfer**, show a short “Syncing your wishlist…” state so the user understands why the list might update.
- On API errors, use the project’s logging/error pattern (e.g. `createLogger`) and optionally surface a brief toast or inline error so the user knows sync failed.

### 4.8 Edge and env

- All storefront code must run on Cloudflare Workers: no Node APIs, no `fs`/`path`. Use `medusaFetch` and `getAuthToken()` only; no server-only imports in the wishlist UI path.

---

## 5. Testing Plan

### 5.1 Backend

- **Unit tests for workflows/steps** (e.g. under `apps/backend/src/workflows/__tests__/` or next to each step):
  - validateCustomerCreateWishlist: no existing wishlist → continues; existing wishlist → throws.
  - createWishlist: creates and returns wishlist; compensation deletes it.
  - validateWishlistExists / validateWishlistSalesChannel / validateVariantWishlist / validateItemInWishlist: behaviour on valid/invalid inputs.
  - createWishlistItem / deleteWishlistItem: success and compensation.
- **Integration tests for store routes** (e.g. under `apps/backend/integration-tests/` or existing HTTP test layout):
  - POST/GET `/store/customers/me/wishlists`: with valid customer auth + publishable key → 200 and expected body; without auth → 401; without publishable key → 400/401 as configured.
  - POST `/store/customers/me/wishlists/items`: with `{ variant_id }` → 200 and wishlist includes item; duplicate variant_id → 4xx; invalid variant_id → 4xx.
  - DELETE `/store/customers/me/wishlists/items/:id`: existing item → 200 and item removed; wrong customer or wrong id → 4xx.
- Use the same patterns as `integration-tests/http/reviews.spec.ts` (or similar) for seeding customer, token, publishable key, and products/variants.

### 5.2 Storefront

- **WishlistContext (guest):** Existing behaviour remains: load/save localStorage; add/remove/toggle/clear only affect local state. No new tests strictly required unless you refactor shared logic.
- **WishlistContext (logged-in):** Mock `medusaFetch` and `getAuthToken`; assert that when token exists, GET is called on mount, and add/remove/toggle call the correct endpoints with correct headers and body. Assert mapping from API response to `items` and to DELETE id.
- **Guest → customer transfer:** Mock `medusaFetch`, `getAuthToken`, and localStorage. Set up “guest” state (localStorage has 2 items, no token), then simulate “user just logged in” (token set, `isAuthenticated` true). Assert: GET wishlist (or POST create then GET), then POST .../items for each variant_id from local, then localStorage is cleared, then GET wishlist again. Assert “already in list” 4xx does not cause duplicate POSTs or leave local uncleared. Assert that after transfer, context `items` reflect server data.
- **WishlistButton / wishlist page:** Prefer testing through context; ensure “Save”/“Remove” and “Add to cart” still work when backend is mocked (e.g. guest mode or mock “logged-in” responses).

### 5.3 E2E (optional but recommended)

- **Guest:** Add product to wishlist from PDP or listing → go to `/wishlist` → see item → add to cart → remove from wishlist. No login.
- **Logged-in:** Login → add to wishlist → reload page → wishlist still has item (from API). Same on another device/browser after logging in.
- **Guest → customer transfer:** As guest, add 1–2 products to wishlist → go to `/wishlist` → sign in (or sign up) → after redirect, wishlist page shows the same items (now from API); reload and/or open in new tab while logged in → items still present. Verifies local list was transferred and cleared.
- Use Playwright and existing `apps/e2e` patterns; run against local backend + storefront or a stable environment.

### 5.4 Manual checks

- Create wishlist (POST) and GET with Postman/curl using customer token + `x-publishable-api-key`.
- Add/remove items, then GET again and confirm list contents.
- In the UI: log in, add/remove items, refresh, switch tabs; confirm list persists and matches API.

---

## 6. Implementation Order

1. **Backend module and links**
   - Add `apps/backend/src/modules/wishlist/` (models, service, index).
   - Add link files under `apps/backend/src/links/` and ensure they are loaded.
   - Register module in `medusa-config.ts`.
   - Generate and run migrations.

2. **Backend workflows and routes**
   - Implement create-wishlist workflow and POST/GET `/store/customers/me/wishlists`.
   - Implement create-wishlist-item workflow and POST `/store/customers/me/wishlists/items` + body validation/middleware.
   - Implement delete-wishlist-item workflow and DELETE `/store/customers/me/wishlists/items/[id]`.

3. **Backend tests**
   - Unit tests for steps/workflows; integration tests for the four endpoints.

4. **Storefront API and context**
   - Wishlist API helper using `medusaFetch` + auth header.
   - Extend `WishlistContext`: when `isAuthenticated` and token present, use API; otherwise keep localStorage. Implement add/remove/toggle/clear and mapping for logged-in branch.
   - **Guest → customer transfer:** In WishlistContext, when transition guest→logged-in is detected (token + non-empty local wishlist), run transfer (4.2): ensure backend wishlist, POST each local variant_id, clear local, refetch. Add “Syncing your wishlist…” state during transfer.

5. **Storefront UI**
   - Ensure `WishlistButton` and `/wishlist` work for both guest and logged-in; use `wishlist_item_id` for remove where needed.
   - Add loading/error handling and edge-safe code. Surface transfer state if desired (e.g. brief “Wishlist synced” or non-blocking message).

6. **Storefront tests**
   - Context and, if needed, button/page tests with mocked API and auth. Include **guest→customer transfer** tests (5.2).

7. **E2E and manual**
   - Run E2E wishlist flows including **guest→customer transfer** (5.3); do a short manual pass with real login/sign-up and sync.

---

## 7. Optional follow-ups (not in initial scope)

- **Share wishlist (Step 11–12):** Token-based share URL and GET `/store/wishlists/[token]` for unauthenticated viewing. Can be added later.
- **Admin widget (Step 13):** “Wishlist count” per product in Medusa Admin. Can be added later if product team needs it.

**In scope for this plan:** Guest→customer wishlist transfer (merge on login/sign-up) is included; see §4.2 and implementation order step 4.

---

## 8. References

- [Medusa Wishlist Plugin Guide](https://docs.medusajs.com/resources/plugins/guides/wishlist)
- [Medusa v2 – Modules](https://docs.medusajs.com/learn/fundamentals/modules)
- [Medusa v2 – Module Links](https://docs.medusajs.com/learn/fundamentals/module-links)
- [Medusa v2 – Workflows](https://docs.medusajs.com/learn/fundamentals/workflows)
- [Medusa v2 – API Routes](https://docs.medusajs.com/learn/fundamentals/api-routes)
- Project: `apps/backend/AGENTS.md`, `apps/storefront/AGENTS.md`, `docs/project_context.md`
