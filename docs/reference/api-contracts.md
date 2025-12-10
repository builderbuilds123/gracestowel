# API Contracts

## Storefront Proxy Routes (`apps/storefront/app/routes/api*`)
The storefront implements a Backend-for-Frontend (BFF) pattern using React Router resource routes. These handle secure server-side communications.

### Checkout & Payments
- **`POST /api/payment-intent`** (`api.payment-intent.ts`)
    - **Purpose**: Creates or updates a Stripe PaymentIntent for the current cart.
    - **Body**: `{ cartId: string, email: string }`
    - **Response**: `{ clientSecret: string }`

- **`POST /api/checkout-session`** (`api.checkout-session.ts`)
    - **Purpose**: Initializes a checkout session, potentially handling redirects to payment gateways.

- **`GET /api/shipping-rates`** (`api.shipping-rates.ts`)
    - **Purpose**: Retrieves available shipping options for the cart context.

### Infrastructure
- **`GET /api/health`** (`api.health.ts`)
    - **Purpose**: Health check endpoint for monitoring uptime.

### Testing
- **`GET /api/test-hyperdrive`** (`api.test-hyperdrive.ts`)
    - **Purpose**: Verifies Cloudflare Hyperdrive database connectivity.

## Backend APIs (`apps/backend/src/api`)
The backend exposes the standard Medusa Admin and Store APIs, plus custom endpoints.

### Webhooks
- **`POST /webhooks/stripe`**: Handles Stripe webhooks (payment success, failed, etc.).

### Store
- (Custom endpoints to be documented as implemented in `apps/backend/src/api/store`)
