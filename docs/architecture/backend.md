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

### Custom Modules
- **Review**: Located in `src/modules/review`. likely handles product reviews.
- **Resend**: Located in `src/modules/resend`. Provider for the notification module.

### API Structure
The backend exposes API endpoints in `src/api`:
- **`store/`**: Public endpoints for the storefront (products, cart, checkout).
- **`admin/`**: Secured endpoints for the dashboard.
- **`webhooks/`**: Handlers for external webhooks (e.g., Stripe events).
- **`health/`**: Health check endpoints.

## Database
- Migrations are managed via Medusa's CLI.
- No custom models found in `src/models` (likely using module-specific models inside `src/modules`).

## Payment Processing Architecture
(Updated Post-Audit 2025-12-22)

We implement a **Delayed Capture** pattern with a strict adherence to Medusa's Payment Module to ensure data integrity and reconciliation.

- **Provider**: Stripe (via `@medusajs/payment-stripe`).
- **Data Model**:
  - **Payment Collection**: Created during checkout initialization. Tracks the total amount and links to Payment Sessions.
  - **Payment Session**: Represents the intent with Stripe. Linked to the Stripe PaymentIntent ID.
  - **Payment**: Created upon successful authorization. Status tracked as `authorized` -> `captured`.
  - **Transaction**: Recorded for every financial movement (auth, capture, refund).

### Checkout Flow (Canonical)
1. **Initialization**: Storefront calls `cart.createPaymentSessions()`. Backend creates Stripe PaymentIntent via Medusa logic.
2. **Pricing**: **Server-Side Only**. The PaymentIntent amount is derived strictly from `cart.total` (including tax/shipping). Client-provided prices are ignored.
3. **Completion**: Storefront calls `cart.complete()` after Stripe confirmation. Backend validates the payment status and creates the Order.

### Grace Period & Capture
- **Mechanism**: Redis keys (`capture_intent:{order_id}`) with 1-hour TTL.
- **Trigger**: Redis Keyspace Notification (`Ex`) triggers the `payment-capture-worker`.
- **Capture Logic**: Worker retrieves the **Order**, verifies the **Payment** status, and calls `paymentModuleService.capturePayment()`. It does *not* rely on metadata for status.

## Order Management & Modifications

### Order Edits
- **Mechanism**: Standard Medusa Order Edits (or `orderService.update` with line items).
- **Metadata usage**: Strictly for UI hints or non-functional data. **Never** for line items or prices.
- **Inventory**: Atomic reservations using `inventoryService` during any addition/removal of items.

### Pricing & Taxes
- **Source of Truth**: Medusa Tax Module.
- **Updates**: Any modification (add item, quantity) triggers a tax re-calculation sequence to ensure `order.tax_total` is correct.

## Security & Data Integrity
- **Pricing**: All prices derived from server-side `PriceList` or `ProductVariant`.
- **PII**: Read-only endpoints (e.g., `orders/by-payment-intent`) are distinct and return strict subsets of data (no PII).
- **Idempotency**: Webhook handlers and critical mutation endpoints use deterministic keys (e.g., `hash(cartId + amount)`) to prevent duplication.
