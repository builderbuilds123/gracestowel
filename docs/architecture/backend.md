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
We implement a **Delayed Capture** pattern for payments to allow for a 1-hour customer "grace period" for order edits.

- **Provider**: Stripe (via `@medusajs/payment-stripe`).
- **Authorization**: All payments are authorized (`capture_method: manual`) at checkout.
- **Grace Period Management**:
  - Redis keys (`capture_intent:{order_id}`) set with 1-hour TTL on purchase.
  - Redis Keyspace Notifications (`notify-keyspace-events Ex`) trigger the capture workflow.
- **Capture Trigger**:
  - **Primary**: Redis expiration event listener triggers the capture of the standard Medusa order.
  - **Fallback**: Cron job runs periodically to capture any orders authorized > 65 minutes ago.
- **Order Edits**: Modifications during the grace period update the order total. If the total increases, we trigger `increment_authorization` on Stripe.

### Webhook Idempotency (Updated 2025-12-12)
- **Order Creation**: Webhook handler checks for existing order with same `stripe_payment_intent_id` before creating
- **Duplicate Prevention**: If order already exists, handler returns early without error
- **Structured Logging**: All webhook operations logged with trace IDs for debugging
- **Error Recovery**: Errors are re-thrown to trigger Stripe webhook retry mechanism
