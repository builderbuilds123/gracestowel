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
