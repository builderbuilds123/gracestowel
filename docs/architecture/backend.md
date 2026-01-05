# Backend Architecture

## Overview
The backend is a **Medusa v2** application located in `apps/backend`. It adopts a modular architecture, leveraging Medusa's module system for isolation and scalability.

## Configuration
- **Entry Point**: `medusa-config.ts`
- **Database**: PostgreSQL (configured via `DATABASE_URL` with SSL options).
- **Cache**: Redis (configured via `REDIS_URL`).
- **HTTP**: CORS settings for store, admin, and auth.

## Modules & Plugins

### Core Modules
- **File Storage**: `@medusajs/file-s3` configured for Cloudflare R2 (S3-compatible).
- **Notification**: `@medusajs/notification` using a local provider `src/modules/resend` for email delivery.
- **Locking**: `@medusajs/core-flows` provides `acquireLockStep` and `releaseLockStep` for workflow-level locking.

### Custom Modules
- **Review**: Located in `src/modules/review`. Handles product reviews.
- **Resend**: Located in `src/modules/resend`. Provider for the notification module.

### Custom Services
- **InventoryDecrementService**: Located in `src/services/inventory-decrement-logic.ts`. Handles atomic inventory decrements with backorder support.

### API Structure
The backend exposes API endpoints in `src/api`:
- **`store/`**: Public endpoints for the storefront (products, cart, checkout).
- **`admin/`**: Secured endpoints for the dashboard.
- **`webhooks/`**: Handlers for external webhooks (e.g., Stripe events).
- **`health/`**: Health check endpoints.

## Database
- Migrations are managed via Medusa's CLI.
- Custom migrations in `src/migrations/` (e.g., `Migration20260104_AddAllowBackorder.ts` for inventory backorder support).

## Payment Processing Architecture
(Updated 2026-01-04)

We implement a **Delayed Capture** pattern with strict adherence to Medusa's Payment Module to ensure data integrity and reconciliation.

- **Provider**: Stripe (via `@medusajs/payment-stripe`).
- **Data Model**:
  - **Payment Collection**: Created during order creation. Tracks the total amount and links to Payment Sessions.
  - **Payment Session**: Represents the intent with Stripe. Linked to the Stripe PaymentIntent ID.
  - **Payment**: Created upon successful authorization. Status tracked as `authorized` -> `captured`.
  - **Order Transaction**: Recorded for every financial movement (auth, capture, refund).

### Source of Truth Hierarchy
1. **Order.total**: Canonical source for order amounts
2. **PaymentCollection.amount**: Medusa's payment record (must match Order.total)
3. **Stripe PaymentIntent**: Payment provider mirror (updated to match Order.total)

### Checkout Flow (Canonical)
1. **Initialization**: Storefront calls `cart.createPaymentSessions()`. Backend creates Stripe PaymentIntent via Medusa logic.
2. **Pricing**: **Server-Side Only**. The PaymentIntent amount is derived strictly from `cart.total` (including tax/shipping). Client-provided prices are ignored.
3. **Completion**: Stripe webhook triggers `create-order-from-stripe.ts` workflow which creates Order + PaymentCollection + Payment.

### Grace Period & Capture
- **Mechanism**: Redis keys (`capture_intent:{order_id}`) with 1-hour TTL.
- **Trigger**: Redis Keyspace Notification (`Ex`) triggers the `payment-capture-worker`.
- **Capture Logic**: Worker retrieves the **Order**, verifies the **PaymentCollection** status, and calls `paymentModuleService.capturePayment()`. Creates **OrderTransaction** record on capture.
- **Currency Units**: Medusa uses major units (dollars), Stripe uses minor units (cents). Conversion handled by `@medusajs/payment-stripe`.

### Order Modifications During Grace Period
- **Add Items**: `add-item-to-order.ts` workflow creates real line items, reserves inventory, and syncs PaymentCollection amount.
- **Update Quantity**: `update-line-item-quantity.ts` workflow supports incremental authorization for amount increases.
- **Graceful Failure**: If Stripe declines increment (insufficient funds), workflow throws `CardDeclinedError` and rolls back.

## Inventory Management
(Updated 2026-01-04)

### Atomic Inventory Decrement
- **Service**: `InventoryDecrementService` in `src/services/inventory-decrement-logic.ts`
- **Pattern**: Uses Medusa's `updateInventoryLevelsStep` for atomic decrements with built-in compensation.
- **Location Selection**: Prefers shipping method `data.stock_location_id`, then sales-channel stock locations. Fails if no mapped location found (no arbitrary fallback).

### Workflow-Level Locking
- **Mechanism**: Uses `acquireLockStep` and `releaseLockStep` from `@medusajs/core-flows`.
- **Lock Key**: PaymentIntent ID (unique per payment) prevents concurrent order creation from duplicate webhooks.
- **Configuration**: 30s timeout, 120s TTL.

### Backorder Support (INV-02)
- **Flag**: `allow_backorder` boolean on `inventory_level` table (default: false).
- **Behavior**: When `allow_backorder=true`, inventory can go negative for JIT replenishment.
- **Event**: `inventory.backordered` event emitted when stock goes negative.
- **Storefront**: `clampAvailability()` helper ensures negative stock displays as 0.

## Order Management & Modifications

### Order Edits
- **Mechanism**: Real Medusa line items via `orderService.createLineItems()`.
- **Inventory**: Atomic reservations using `updateInventoryLevelsStep` during any addition/removal of items.
- **Payment Sync**: PaymentCollection amount updated to match Order.total after modifications.

### Pricing & Taxes
- **Source of Truth**: Medusa Tax Module.
- **Updates**: Any modification (add item, quantity) triggers tax re-calculation. Tax stored in line item metadata (`tax_amount`) and order metadata (`updated_tax_total`).

## Security & Data Integrity
- **Pricing**: All prices derived from server-side `PriceList` or `ProductVariant`.
- **PII**: Read-only endpoints (e.g., `orders/by-payment-intent`) return strict subsets of data (no PII).
- **Idempotency**: Webhook handlers and critical mutation endpoints use deterministic keys (e.g., `hash(cartId + amount)`) to prevent duplication.
- **Locking**: Workflow-level locks prevent race conditions in concurrent order creation.
