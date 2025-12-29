# Integration Architecture

## Overview
The system relies on several external services for critical functionality. This document maps these integrations and their interaction points.

## External Services

### 1. Stripe (Payments)
- **Purpose**: Payment processing.
- **Integration Points**:
    - **Backend**: `stripe` dependency in `apps/backend`. Webhooks likely handled in `src/api/webhooks`.
    - **Storefront**: `@stripe/react-stripe-js` for Element rendering. **Crucial**: PaymentIntent creation/updates are proxied via `api.payment-intent.ts` which enforces server-side pricing verification using the Medusa Cart. Client-side amounts are ignored.

### 2. Resend (Notifications)
- **Purpose**: Transactional email delivery.
- **Components**:
    - **Backend**: Custom provider `src/modules/resend` registered in `medusa-config.ts`.
    - **Events**: Triggered by Medusa events (e.g., `order.placed`).

### 3. Cloudflare R2 (Storage)
- **Purpose**: Object storage for images and assets.
- **Components**:
    - **Backend**: `@medusajs/file-s3` module configured with R2 endpoint in `medusa-config.ts`.

### 4. PostHog (Analytics)
- **Purpose**: Product analytics and event tracking.
- **Components**:
    - **Storefront**: `utils/posthog.ts` for client-side events.
    - **Backend**: `posthog-node` dependency (likely for server-side event capture).

### 5. Redis (Infrastructure)
- **Purpose**: Message broker for Medusa events and session caching.
- **Components**: Used by Medusa core.
