# Medusa v2 Audit — Grace's Towel (2026-01-21)

**Goal:** Verify Medusa v2 implementation completeness/correctness across backend and storefront, covering modules, workflows, containers, API surfaces, services, providers, jobs, and integration points.

**Scope reviewed (code):**
- Backend config: `apps/backend/medusa-config.ts`
- Backend layers: `apps/backend/src/api`, `apps/backend/src/workflows`, `apps/backend/src/subscribers`, `apps/backend/src/jobs`, `apps/backend/src/loaders`, `apps/backend/src/modules`, `apps/backend/src/services`, `apps/backend/src/links`, `apps/backend/src/repositories`, `apps/backend/src/utils`
- Storefront Medusa integration: `apps/storefront/app/lib/medusa.ts`, `apps/storefront/app/lib/medusa-fetch.ts`, `apps/storefront/app/services/medusa-cart.ts`, `apps/storefront/app/context/CustomerContext.tsx`, `apps/storefront/app/routes/api.*`, `apps/storefront/app/hooks/*`

**Primary reference:** Medusa MCP docs + core commerce modules list. Core modules are included by default in Medusa v2; this audit focuses on configuration/customization and correctness of the integration.

---

## 1) Medusa Architecture Layers (HTTP → Workflows → Modules → DB)

**Status:** Implemented and aligned with Medusa v2 patterns.

**Evidence:**
- HTTP/API routes: custom endpoints in `apps/backend/src/api`.
- Workflows: `apps/backend/src/workflows/*.ts` using `createWorkflow` and `@medusajs/core-flows`.
- Modules: core modules via Medusa app + custom modules in `apps/backend/src/modules`.
- DB: PostgreSQL configured in `apps/backend/medusa-config.ts`.

**Notes:**
- Workflows correctly use container and core flows for order creation, cancellation, reservations, etc.
- API routes do not appear to override core Medusa endpoints; custom routes are additive.

---

## 2) Containers (Medusa Container / Module Container)

**Status:** Correct usage in workflows/subscribers; module container used implicitly by custom modules.

**Evidence:**
- Medusa container resolution in workflows/subscribers: `container.resolve("query")`, `container.resolve("logger")`, `container.resolve(Modules.PAYMENT)` (e.g. `apps/backend/src/workflows/create-order-from-stripe.ts`).
- Module services built with `MedusaService` in custom modules: `apps/backend/src/modules/review/service.ts`.

**Potential issue:** None identified.

---

## 3) Commerce Modules (Comprehensive)

**Legend:**
- **Core** = provided by Medusa v2, not customized here.
- **Configured** = explicitly configured in `medusa-config.ts`.
- **Used** = referenced in app workflows/routes/storefront.
- **Gap** = missing provider/config or unverified behavior.

| Module | Status | Evidence | Gaps / Notes |
|---|---|---|---|
| API Key | Used | Storefront expects `MEDUSA_PUBLISHABLE_KEY` (`apps/storefront/app/lib/medusa.ts`, `medusa-fetch.ts`); scripts exist (`apps/backend/src/scripts/get-publishable-key.ts`) | Confirm publishable key exists in DB and is provisioned in envs. |
| Auth | Used | Storefront uses `/auth/customer/emailpass*` (`apps/storefront/app/context/CustomerContext.tsx`) | Ensure Auth module configured for emailpass provider (defaults in Medusa). |
| Cart | Used | Storefront cart service (`apps/storefront/app/services/medusa-cart.ts`), custom APIs `app/routes/api.carts*` | None found. |
| Currency | Core | Implicit in pricing/regions | None. |
| Customer | Used | Storefront `/store/customers*` and backend subscriber syncs customer (`apps/backend/src/subscribers/order-placed.ts`) | None found. |
| Fulfillment | **Gap** | Storefront calls shipping options (`medusa-cart.ts`) | No fulfillment provider configured in `medusa-config.ts`. Shipping options may be empty unless provider is set. |
| Inventory | Used | Reservations + location resolver (`createReservationsStep`, `InventoryLocationResolver`, `apps/backend/src/links/reservation-line-item.ts`) | Requires stock locations and inventory items seeded; scripts suggest manual checks (`apps/backend/src/scripts/check-locations.ts`). |
| Order | Used | Custom order workflows + API routes (`apps/backend/src/workflows/*`, `apps/backend/src/api/store/orders/*`) | None found. |
| Payment | Configured + Used | Stripe provider configured in `medusa-config.ts`; payment collection logic in workflows; storefront payment collection routes | Ensure `STRIPE_SECRET_KEY` and webhook configured; verify PaymentCollection creation succeeds in all flows. |
| Pricing | Core + Used | Used via Store API; rules referenced in comments | None. |
| Product | Used | Storefront products fetched via Medusa Store API | None. |
| Promotion | Used | Cart fields include promotions; hooks `usePromoCode`, `useAutomaticPromotions` | Confirm promotion rules are configured in Medusa Admin. |
| Region | Used | `getDefaultRegion`, `useRegions` | Ensure regions exist + correct currency (CAD/others). |
| Sales Channel | Used | Order creation uses `sales_channel_id` from cart | Ensure at least one sales channel exists and is assigned to products. |
| Stock Location | Used | Inventory resolver uses location IDs in shipping method data | Ensure stock locations exist and are linked to fulfillment providers. |
| Store | Core | Used implicitly by Store APIs | None. |
| Tax | **Gap** | No tax provider configured | Without a provider, tax calculation may be zero or incorrect. |
| Translation | Configured | `@medusajs/translation` enabled in `medusa-config.ts` | Verify locales and translation data setup (if required). |
| User | Core | Used by Admin API; no custom logic | None. |

**Summary:** Commerce modules are mostly core/used, but **Fulfillment** and **Tax** providers are not configured. Inventory/Sales Channel/Stock Location require data seeding and admin configuration to be effective.

---

## 4) Infrastructure Modules / Providers

| Module / Provider | Status | Evidence | Gaps / Notes |
|---|---|---|---|
| Event Bus | Configured | `@medusajs/event-bus-redis` in `medusa-config.ts` | Ensure `REDIS_URL` exists in all envs. |
| Analytics | Configured | PostHog in prod / local in dev (`medusa-config.ts`) | OK. |
| File | Configured | S3/R2 + local fallback | OK. Verify `S3_*` envs for prod. |
| Notification | Configured | Resend + local feed (`medusa-config.ts`) | OK. Ensure async send uses BullMQ (it does). |
| Search | **Not configured** | N/A | Storefront uses Medusa Store API search. No Medusa search provider in backend. |
| Cache | Not explicit | Redis used by event bus & queues | OK if relying on Redis only. |

---

## 5) Workflows (Custom + Core)

**Custom Workflows:**
- `create-order-from-stripe` (`apps/backend/src/workflows/create-order-from-stripe.ts`)
- `cancel-order-with-refund` (`apps/backend/src/workflows/cancel-order-with-refund.ts`)
- `send-order-confirmation` (`apps/backend/src/workflows/send-order-confirmation.ts`)
- `add-item-to-order`, `update-line-item-quantity` (custom order edit flows)

**Core Workflows used:**
- `createOrdersWorkflow` (order creation)
- `cancelOrderWorkflow` (cancellation)
- `createReservationsStep` (inventory reservations)
- `useRemoteQueryStep` (workflow data fetching)

**Correctness notes:**
- Uses Medusa workflows correctly with compensation steps and locking.
- Event emission uses event bus with fallback to multiple service keys.

**Gaps:**
- Ensure cart completion uses the core `completeCartWorkflow` via `/store/carts/{id}/complete` (storefront appears to do this in `apps/storefront/app/routes/checkout.success.tsx`).

---

## 6) API Routes (Store/Admin/Webhooks)

**Custom Store API:**
- Reviews, order edit/cancel, order guest view, line items, shipping options, payment collection endpoints, health, debug (see `apps/backend/src/api/store/*`).

**Custom Admin API:**
- Reviews management, Stripe queue status, custom routes (`apps/backend/src/api/admin/*`).

**Webhooks:**
- Stripe webhook: `apps/backend/src/api/webhooks/stripe/route.ts` with raw body config in `apps/backend/src/api/middlewares.ts`.

**Correctness notes:**
- Middleware normalizes country codes and injects modification token header.
- Global error handler exists.

**Gaps:**
- No overrides to core Medusa APIs observed. If you intend to customize standard flows (e.g., `completeCart`), you must override explicitly.

---

## 7) Subscribers & Events

**Subscribers:**
- `order-placed`, `order-canceled`, `fulfillment-created`, `inventory-backordered`, `customer-created`, `customer-password-reset` (`apps/backend/src/subscribers/*`).

**Correctness notes:**
- Order placed subscriber triggers payment capture scheduling and email queue.
- Subscriber registration is done manually in middleware (`apps/backend/src/api/middlewares.ts`).

**Gaps:**
- Ensure subscriber registration is invoked in non-HTTP contexts (jobs/workers/CLI) if needed. Current registration is via API middleware only.

---

## 8) Jobs / Scheduled Tasks

**Jobs:**
- `fallback-capture` cron (`apps/backend/src/jobs/fallback-capture.ts`).

**Correctness notes:**
- Uses Medusa scheduled job pattern with `config.schedule`.

**Gaps / Issues:**
- Uses `console.log` inside job; should use structured `logger` per project rules.

---

## 9) Custom Modules / Data Models / Migrations

**Custom modules:**
- Reviews (`apps/backend/src/modules/review/*`) with migrations.
- Feedback handled via PostHog surveys in the storefront (no Medusa module).
- Resend notification provider (`apps/backend/src/modules/resend/*`).

**Correctness notes:**
- Modules implemented using `MedusaService` and DML models.

**Gaps:**
- Confirm module registration in `medusa-config.ts` (review + resend is used as notification provider).

---

## 10) Links / Remote Link

**Links:**
- Inventory reservation → order line item link (`apps/backend/src/links/reservation-line-item.ts`).

**Remote link usage:**
- PaymentCollection linked to Order via `remoteLink.create` in `create-order-from-stripe` workflow.

**Correctness notes:**
- Link usage matches Medusa v2 patterns.

---

## 11) Storefront ↔ Backend Integration

**Storefront uses Medusa SDK + Store API correctly:**
- Client creation: `apps/storefront/app/lib/medusa.ts`.
- Store API fetch wrapper: `apps/storefront/app/lib/medusa-fetch.ts` injecting `x-publishable-api-key`.
- Cart orchestration: `apps/storefront/app/services/medusa-cart.ts`.
- Payment collections: `apps/storefront/app/routes/api.payment-collections*`.
- Checkout completion: `apps/storefront/app/routes/checkout.success.tsx`.

**Auth integration:**
- Customer auth uses `/auth/customer/emailpass*` + `/store/customers*` endpoints (`CustomerContext.tsx`).

**Gaps / Risks:**
- Storefront logs use `console.log`/`console.error` (violates structured logging rule). Examples: `CustomerContext.tsx`, `medusa.ts`, `medusa-cart.ts`.

---

## 12) Admin UI Integration

**Status:** Configured in `medusa-config.ts`.
- Admin disabled on workers.
- `admin.backendUrl` configured via `RAILWAY_PUBLIC_DOMAIN` or `MEDUSA_BACKEND_URL`.

**Gaps:** None identified.

---

## 13) Security / Compliance Checks (Project Rules)

**Findings:**
- **Logging policy violations:**
  - `console.log` and `console.error` used in storefront code (e.g., `apps/storefront/app/context/CustomerContext.tsx`, `apps/storefront/app/lib/medusa.ts`, `apps/storefront/app/services/medusa-cart.ts`).
  - `apps/backend/src/jobs/fallback-capture.ts` uses `console.log`.
- **PII masking:** Some logs are masked (modification tokens), but PostHog `identify` in frontend logs email and name to console. If console logs are exposed in prod, this violates masking requirement.

---

# Overall Completion Summary

**Mostly complete for core commerce flows**, with custom workflows for payment capture, order cancellation, and notifications. The major functional gaps are:

1) **Fulfillment provider not configured** → shipping options may be missing or incorrect.
2) **Tax provider not configured** → tax calculation likely missing or incorrect.
3) **Search provider not configured** → uses Medusa Store API search; no dedicated search provider.
4) **Logging policy violations** in storefront and job code.
5) **Data prerequisites** (regions, sales channels, stock locations, inventory items) must be seeded and verified for inventory/fulfillment correctness.

---

# Recommended Next Actions (If You Want Fixes)

1) Decide fulfillment provider (e.g., manual, Shippo, ShipStation) and add to `medusa-config.ts`.
2) Configure tax provider (e.g., taxjar, custom) and verify tax region setup.
3) Add Medusa search provider if you need advanced search capabilities.
4) Replace `console.*` with structured logger utilities in storefront and backend job.
5) Verify seed data for regions, sales channels, stock locations, inventory.

---

# Appendix: Key Files by Concept

- **Medusa config:** `apps/backend/medusa-config.ts`
- **Custom modules:** `apps/backend/src/modules/*`
- **Workflows:** `apps/backend/src/workflows/*`
- **Subscribers:** `apps/backend/src/subscribers/*`
- **Jobs:** `apps/backend/src/jobs/*`
- **Links:** `apps/backend/src/links/*`
- **Storefront client:** `apps/storefront/app/lib/medusa.ts`, `apps/storefront/app/lib/medusa-fetch.ts`
- **Cart/Checkout:** `apps/storefront/app/services/medusa-cart.ts`, `apps/storefront/app/routes/api.carts*`, `apps/storefront/app/routes/checkout.success.tsx`
- **Auth:** `apps/storefront/app/context/CustomerContext.tsx`
