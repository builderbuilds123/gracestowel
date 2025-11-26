# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Core commands

### Backend (apps/backend – Medusa v2)

- Install dependencies
  - `cd apps/backend && npm install`
- Run dev server (Medusa develop)
  - `cd apps/backend && npm run dev`
  - Exposes Medusa Store + Admin API on `http://localhost:9000` (Admin dashboard at `/app`).
- Build and run in production mode
  - `cd apps/backend && npm run build`
  - `cd apps/backend && npm run start`
  - Railway uses `apps/backend/Dockerfile` + `railway.toml` to build and run `npm run start` with health check on `/health`.
- Database migrations
  - `cd apps/backend && npx medusa migrations run`
- Seed data
  - `cd apps/backend && npm run seed`
- Tests (Jest)
  - All HTTP integration tests: `cd apps/backend && npm run test:integration:http`
  - All module integration tests: `cd apps/backend && npm run test:integration:modules`
  - All unit tests: `cd apps/backend && npm run test:unit`
  - Example: run a single integration test file
    - `cd apps/backend && npm run test:integration:http -- integration-tests/http/health.spec.ts`

### Storefront (apps/storefront – React Router v7 on Cloudflare Workers)

- Install dependencies
  - `cd apps/storefront && npm install`
- Run dev server
  - `cd apps/storefront && npm run dev`
  - Default dev URL: `http://localhost:5173`.
- Typecheck
  - `cd apps/storefront && npm run typecheck`
- Build and preview
  - `cd apps/storefront && npm run build`
  - `cd apps/storefront && npm run preview`
- Deploy to Cloudflare Workers
  - `cd apps/storefront && npm run deploy`
  - Uses Wrangler; production env vars/secrets are configured via `wrangler.toml` + `wrangler secret` as described in `docs/ENVIRONMENT_SETUP.md`.

### Local full-stack development loop

- Ensure environment files are set up (see `docs/ENVIRONMENT_SETUP.md` and `docs/DEV_WORKFLOW.md`).
- In one terminal: run `cd apps/backend && npm run dev`.
- In another terminal: run `cd apps/storefront && npm run dev`.
- The storefront will talk to Medusa at `http://localhost:9000` via the configured `MEDUSA_BACKEND_URL`.

> Note: There is no dedicated lint script defined at the time of writing; if you add one (for ESLint, etc.), prefer wiring it through each app’s `package.json` and then optionally a root-level script.

## Repository structure and high-level architecture

### Monorepo layout

- Root `package.json` defines an npm workspace with `apps/*`.
- `apps/backend`: Medusa v2 backend (Node.js, TypeScript) deployed on Railway via Docker.
- `apps/storefront`: React Router v7 storefront built with Vite and deployed to Cloudflare Workers.
- `docs/`: System-level documentation (`ARCHITECTURE.md`, `DEV_WORKFLOW.md`, `ENVIRONMENT_SETUP.md`, `RAILWAY_INFRASTRUCTURE.md`, `BACKEND_API.md`, `STOREFRONT_API.md`, `DATA_LAYER.md`, `STOREFRONT_COMPONENTS.md`, etc.).
- Root infra/config files
  - `railway.toml`: Railway build/deploy config pointing at `apps/backend/Dockerfile` and `/health` endpoint.
  - `nixpacks.toml` (if present) and other infra files for deployment.
- AI/assistant-related config
  - `.claude/agents` and `.claude/skills`: Claude-specific agents and skills (backend/frontend guidelines, error tracking, route testing, etc.).
  - `.gemini/custom_rules.md` and `.gemini/design_doc.md`: Gemini-specific rules and architecture design doc.

### System architecture (big picture)

Grace Stowel is a headless e‑commerce system:

- **Backend (Medusa v2)** provides products, orders, customers, inventory, and notifications.
- **Storefront (React Router v7 on Cloudflare Workers)** handles the customer-facing experience, cart, checkout, and Stripe payment UI.
- **Infrastructure**
  - Medusa backend runs on Railway (PostgreSQL + Redis + containerized Node service).
  - Storefront runs on Cloudflare Workers; connects directly to the database for some read workloads and to Medusa for commerce APIs.
  - Stripe is the payment processor; Resend is used for transactional emails.

The canonical diagram and more details are in `ARCHITECTURE.md` and `docs/RAILWAY_INFRASTRUCTURE.md`.

## Backend (apps/backend) architecture

### Configuration and modules

- Entry configuration: `apps/backend/medusa-config.ts`.
  - Loads `DATABASE_URL`, `REDIS_URL`, `STORE_CORS`, `ADMIN_CORS`, `AUTH_CORS`, `JWT_SECRET`, and `COOKIE_SECRET` from environment.
  - Enables the Medusa Admin dashboard (`admin.disable = false`) and sets `backendUrl` for the admin UI.
  - Registers a custom **Resend notification module** via the Medusa notification module. This uses `RESEND_API_KEY` and `RESEND_FROM_EMAIL` to send order emails.
- Environment layout is documented in `docs/ENVIRONMENT_SETUP.md` and `apps/backend/README.md` (local vs Railway envs, public vs private DB/Redis URLs).

### HTTP API surface

- File-based routing under `apps/backend/src/api/` (see `docs/BACKEND_API.md`):
  - `src/api/health/route.ts` → `GET /health` for Railway health checks.
  - `src/api/webhooks/stripe/route.ts` → `POST /webhooks/stripe` webhook entrypoint.
  - `src/api/store/custom/route.ts`, `src/api/admin/custom/route.ts` as stubs for future store/admin-specific APIs.
- All standard Medusa Store and Admin APIs are available (products, carts, customers, etc.); see `docs/BACKEND_API.md` for the mapping to Medusa’s documentation.

### Stripe → Medusa order workflow

The most important backend flow is the Stripe webhook → order creation path:

1. **Stripe Webhook Handler** – `src/api/webhooks/stripe/route.ts`
   - Verifies the incoming event using `STRIPE_WEBHOOK_SECRET` and the `stripe-signature` header.
   - Handles:
     - `payment_intent.succeeded` → creates an order in Medusa.
     - `payment_intent.payment_failed` → logs failure.
     - `checkout.session.completed` → reserved for future checkout-session handling.
   - On `payment_intent.succeeded`, it parses metadata (cart data, customer email, shipping address) and invokes the `createOrderFromStripeWorkflow`.

2. **Order creation workflow** – `src/workflows/create-order-from-stripe.ts`
   - Uses Medusa’s workflow SDK and core flows.
   - Steps:
     - **prepare-order-data-from-stripe**
       - Resolves the correct Medusa **region** based on the Stripe currency.
       - Transforms cart metadata from Stripe into Medusa order items, converting dollar prices to cents and attaching SKU/color metadata.
       - Optionally maps the shipping address into Medusa’s address schema.
     - **createOrderWorkflow (Medusa core flow)**
       - Runs as an embedded step to actually create the order.
     - **prepare-inventory-adjustments**
       - Uses the Medusa query API to find inventory items for each variant and corresponding locations.
       - Prepares bulk inventory adjustments (negative quantities to decrement stock).
     - **adjustInventoryLevelsStep**
       - Applies inventory adjustments in bulk if there are any.
     - **log-order-created**
       - Logs order creation + whether inventory was updated.
     - **emitEventStep**
       - Emits an `order.placed` event with the new order ID for downstream subscribers.

3. **Order placed subscriber and email notification**
   - Subscriber: `src/subscribers/order-placed.ts` listens to `order.placed`.
   - Kicks off `sendOrderConfirmationWorkflow` (`src/workflows/send-order-confirmation.ts`):
     - Reads detailed order data via `useQueryGraphStep` (items, variants, products, shipping address, totals).
     - Shapes the data for email templates.
     - Calls `sendNotificationStep` (`src/workflows/steps/send-notification.ts`), which uses the notification module to send an email via Resend.
   - Email templates live under `src/modules/resend/emails/` (see `apps/backend/README.md`).

This chain (Stripe webhook → workflow → event → email workflow) is the core backend business flow; keep it in sync if you change how the frontend collects cart data or how inventory is modeled.

### Data and modules

- Medusa’s modules (products, orders, inventory, notification, etc.) are pulled in via `@medusajs/framework` and `@medusajs/medusa`.
- Custom modules live under `src/modules/` (notably the Resend notification integration).
- Workflows live under `src/workflows/`, and subscribers under `src/subscribers/`.
- Health checks and integration tests
  - Health endpoint: `src/api/health/route.ts` returns a JSON payload with status, timestamp, and service name.
  - HTTP integration tests are under `apps/backend/integration-tests/http/` and use Jest with Medusa test utilities.

## Storefront (apps/storefront) architecture

### React Router app structure

The storefront is a full-stack React Router v7 application deployed to Cloudflare Workers. Key directories under `apps/storefront/app/`:

- `routes/` – page routes and API endpoints.
  - Page routes: `home.tsx`, `towels.tsx`, `products.$handle.tsx`, `collections.$handle.tsx`, `checkout.tsx`, `checkout.success.tsx`, `blog.tsx`, `blog.$id.tsx`, etc.
  - Server-only API routes prefixed with `api.`: `api.payment-intent.ts`, `api.shipping-rates.ts`, `api.checkout-session.ts` (see `docs/STOREFRONT_API.md`).
- `components/` – UI and e‑commerce components like `ProductCard`, `OrderSummary`, `CheckoutForm`, `CartDrawer`, `AnnouncementBar`, `EmbroideryCustomizer`, etc. (documented in `docs/STOREFRONT_COMPONENTS.md`).
- `context/` – React Contexts for app-level state:
  - `CartContext` – cart state + free gift logic.
  - `LocaleContext` – currency/locale.
  - `CustomerContext` – authenticated Medusa customer/session state.
- `lib/` – integration utilities:
  - `medusa.server.ts` – server-side Medusa Store API client + price/stock helpers.
  - `db.server.ts` – PostgreSQL client for server-side routes running on Workers (currently uses `DATABASE_URL` directly; future-proofed for Hyperdrive).
  - `stripe.ts` – Stripe.js singleton loader for the client.
- `data/` – static product and blog data; see `docs/DATA_LAYER.md`.
- `config/site.ts` – central site configuration (branding, contact info, free gift/shipping thresholds, social URLs).
- `root.tsx` – root layout wiring providers and shell.
  - Wraps `<Outlet />` with `LocaleProvider`, `CustomerProvider`, `CartProvider`, header/footer, and `CartDrawer`.
  - Implements a basic `ErrorBoundary` for route errors.

### Hybrid data model: static products + Medusa

- Static products live in `app/data/products.ts` and are documented in `docs/DATA_LAYER.md`.
- Dynamic Medusa products are fetched via:
  - `lib/medusa.server.ts` server-side client (`getMedusaClient`, `getProducts`, `getProductByHandle`, `getProductById`).
  - `hooks/useMedusaProducts.ts` (documented in `docs/DATA_LAYER.md` and `docs/STOREFRONT_COMPONENTS.md`) for client-side hooks.
- Helpers in `medusa.server.ts` (`formatPrice`, `getProductPrice`, `getStockStatus`, `getStockStatusDisplay`) centralize currency formatting and stock messaging.
- The architecture is intentionally hybrid today, with a migration path toward Medusa as the single source of truth, as described in `docs/DATA_LAYER.md`.

### Cart, gifts, and free shipping

- `CartContext` (`app/context/CartContext.tsx`) manages the shopping cart:
  - Persists items in `localStorage`.
  - Supports embroidery metadata, color/variant, and SKU for inventory tracking.
  - Applies **Free Gift** logic: automatically adds/removes "The Wool Dryer Ball" based on a cart subtotal threshold.
- `SITE_CONFIG` (`app/config/site.ts`) defines:
  - Free gift threshold (cart total at which the free wool dryer balls are added).
  - Free shipping threshold used by shipping logic.
- `CartProgressBar` visualizes progress toward free shipping and gift thresholds.

### Checkout & Stripe interaction (frontend side)

- Checkout page: `app/routes/checkout.tsx` is the central orchestrator of checkout UX.
  - Reads cart state from `CartContext` and currency from `LocaleContext`.
  - Uses `CustomerContext` for authenticated customer data (email, address, phone).
  - On load:
    - Calls `POST /api/payment-intent` with
      - Cart subtotal
      - Currency
      - Cart line items (ID, variantId, SKU, title, quantity, color)
      - Optional customer ID/email
    - Receives a Stripe `clientSecret` and mounts Stripe Elements via `getStripe()`.
  - On shipping address selection/change:
    - Calls `POST /api/shipping-rates` with `subtotal`.
    - Updates `shippingOptions` and `selectedShipping`.
    - Re-issues a `POST /api/payment-intent` including the selected shipping amount so the PaymentIntent total stays in sync.
  - Uses `CheckoutForm` and `OrderSummary` to render the form and sidebar summary.

- `api.payment-intent.ts`:
  - Validates that `STRIPE_SECRET_KEY` is set.
  - Optionally validates inventory via the Medusa backend (fetching products and variant inventory quantities) before creating the PaymentIntent.
  - Computes `totalAmount = amount + shipping` and sends Stripe’s `/v1/payment_intents` request.
  - Encodes cart line items, customer info, and shipping address as JSON in `metadata` (e.g. `metadata[cart_data]`, `metadata[shipping_address]`).

- `api.shipping-rates.ts`:
  - Calls Stripe’s `/v1/shipping_rates/{id}` for a configured set of rate IDs.
  - Applies **business logic**:
    - Ground shipping becomes free when subtotal ≥ the configured free shipping threshold.
    - Returns both current amount and original amount so the UI can show struck-through prices when shipping is free.

- `api.checkout-session.ts` (if used):
  - Provides an alternative Stripe Embedded Checkout session flow (documented in `docs/STOREFRONT_API.md`).

### End-to-end order flow (front to back)

1. User adds items to cart via `CartContext` (optionally with embroidery/customization).
2. At checkout, the frontend creates/updates a Stripe PaymentIntent via `/api/payment-intent`, including cart + shipping metadata.
3. User completes payment in Stripe Elements; Stripe finalizes the PaymentIntent.
4. Stripe sends a webhook to `POST /webhooks/stripe` on the Medusa backend.
5. Backend verifies the event, then `createOrderFromStripeWorkflow` creates a Medusa order, decrements inventory, and emits `order.placed`.
6. Subscriber `order-placed.ts` runs `sendOrderConfirmationWorkflow`, which uses the Resend notification module to send the order confirmation email.

Keep these touchpoints (cart metadata, PaymentIntent metadata, webhook payload expectations, and workflow input types) aligned whenever you evolve checkout or product data structures.

## Infrastructure and environments

- **Railway (backend)**
  - `railway.toml` configures Dockerfile-based builds from `apps/backend/Dockerfile`, with `npm run start` and `/health` health check.
  - `docs/RAILWAY_INFRASTRUCTURE.md` documents production vs staging environments, database/Redis URLs, deployment flow, and cost estimates.
  - `apps/backend/README.md` explains how `.env` and `.env.railway` are used for local vs production, and how to configure CORS and secrets.

- **Cloudflare Workers (storefront)**
  - `apps/storefront/wrangler.toml` is the primary config (entry worker, routes, env vars).
  - `docs/ENVIRONMENT_SETUP.md` shows how to configure `DATABASE_URL`, `MEDUSA_BACKEND_URL`, and `STRIPE_SECRET_KEY` via `.dev.vars` (dev) and `wrangler secret` (production).

- **Development workflow**
  - `docs/DEV_WORKFLOW.md` is the main onboarding doc: cloning, environment creation in Railway, `.env` and `.dev.vars` setup, and running the two services locally against shared dev databases.

## Assistant/AI-specific configuration and rules

Even though this file is for Warp, there are other AI-specific configs that encode project intent and are useful context when modifying the repo.

- **Claude skills and agents (`.claude/`)**
  - `.claude/agents/README.md` lists specialized agents (architecture reviewer, refactor planner, documentation architect, frontend error fixer, auth route tester/debugger, auto error resolver, etc.).
  - `.claude/skills/README.md` documents auto-activating skills based on file paths and intents.
    - `backend-dev-guidelines` – layered backend architecture patterns (routes → controllers → services → repositories), Prisma, Zod validation, Sentry, unified configuration.
    - `frontend-dev-guidelines` – modern React/TypeScript/MUI patterns, Suspense + `useSuspenseQuery`, feature-based file organization.
    - `error-tracking` – Sentry patterns; `route-tester` – JWT cookie-based API testing.
  - If you change backend/frontend directory layouts substantially, you may also need to update `.claude/skills/skill-rules.json` path patterns.

- **Gemini rules (`.gemini/`)**
  - `.gemini/custom_rules.md` notes that assistants should reference `.gemini/design_doc.md` for architecture/system design.
  - It also contains branding guidance (the site name is referred to as "Grace's Towel" there); the storefront config uses "Grace Stowel" – confirm the preferred branding with product/design before making large-scale text changes.

When making non-trivial architectural changes, prefer to:

- Update the relevant docs under `docs/` (especially `ARCHITECTURE.md`, `BACKEND_API.md`, `STOREFRONT_API.md`, `DATA_LAYER.md`).
- Keep the Medusa workflows (`src/workflows/*`) and storefront checkout flow (`app/routes/checkout.tsx` + `app/routes/api.*.ts`) consistent with each other and with Stripe/Webhook configuration.
