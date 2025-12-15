# Storefront Architecture

## Overview
The storefront is a **React Router v7** application located in `apps/storefront`. It is designed to be performant, SEO-friendly, and responsive.

## Core Capabilities

### Routing & Pages
The application uses file-system based routing:
- **Product Experience**:
    - `/products/$handle`: Product Detail Page (PDP).
    - `/collections/$handle`: Collection/Category pages.
    - `/search`: Search results page.
    - `/towels`: Specialized landing/category page.
- **Checkout Flow**:
    - `/cart`: Shopping cart view.
    - `/checkout`: Main checkout process.
    - `/checkout/success`: Order confirmation.
- **User Account**:
    - `/account`: Dashboard.
    - `/account/login`: Authentication.
    - `/account/register`: Registration.
- **Content**:
    - `/blog`, `/blog/$id`: Blog section.
    - `/about`: About page.
    - `/wishlist`: User wishlist.

### API Proxying & BFF pattern
The storefront includes server-side resource routes (loaders/actions) that act as a Backend-for-Frontend (BFF) to securely interact with third-party services or abstract complex backend calls:
- `api.checkout-session.ts`: Manages Stripe checkout sessions.
- `api.payment-intent.ts`: Manages Stripe PaymentIntent lifecycle (create OR update).
  - Accepts optional `paymentIntentId` for updates (reuse existing intent)
  - Returns both `clientSecret` and `paymentIntentId`
  - Uses deterministic idempotency keys for creates (based on cart hash)
  - **Updated 2025-12-12**: Implements Stripe best practice "create once, update on changes"
- `api.shipping-rates.ts`: Fetches shipping options.
- `api.health.ts`: Health check endpoint.

### Logging & Observability
- **Structured Logging**: `lib/logger.ts` provides JSON-structured logging with trace IDs
- **Trace Propagation**: `x-trace-id` header passed from frontend to backend
- **Error References**: Error responses include `traceId` for support escalation

### State Management & Styling
- **State**: React Server Components / Loaders are used for data fetching. Local state is managed via React hooks.
- **Styling**: Tailwind CSS v4 is used for all styling requirements.

### Integrations
- **Medusa SDK**: Used for cart management, product retrieval, and customer auth.
- **PostHog**: Integrated via `utils/posthog.ts` for client-side event tracking.
- **Stripe**: Integrated via `@stripe/react-stripe-js` for payment element rendering.
