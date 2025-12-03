# Integration Architecture

## Overview

The project follows a **Headless Commerce** architecture where the Storefront (Frontend) is decoupled from the Backend (Commerce Engine).

## Communication Channels

### 1. Storefront → Backend (REST API)

The Storefront consumes the Backend's **Store API** over HTTP/HTTPS.

- **Protocol**: HTTPS
- **Format**: JSON
- **Authentication**:
    - **Public**: Most store endpoints (products, cart) are public.
    - **Customer**: Authenticated via JWT (Bearer Token) for profile/order management.
    - **Publishable Key**: `x-publishable-api-key` header used to scope requests to sales channels.

**Key Integration Points:**
- **Products**: Storefront fetches product data from `/store/products`.
- **Cart**: Storefront manages cart state via `/store/carts`.
- **Checkout**: Storefront initializes payment sessions via `/store/carts/:id/payment-sessions`.
- **Orders**: Storefront creates orders via `/store/orders` (or specialized workflows).

### 2. Stripe → Backend (Webhooks)

Stripe communicates asynchronously with the Backend via Webhooks.

- **Endpoint**: `/webhooks/stripe`
- **Events**: `payment_intent.succeeded`, `charge.refunded`, etc.
- **Security**: Signature verification using Stripe CLI secret (dev) or Dashboard secret (prod).

### 3. Backend → Database (PostgreSQL)

The Backend persists data to a PostgreSQL database.

- **ORM**: MikroORM / DML
- **Connection**: Connection string via `DATABASE_URL`.

### 4. Backend → Redis (Pub/Sub & Cache)

The Backend uses Redis for:
- **Event Bus**: BullMQ for background jobs (e.g., email sending).
- **Cache**: Caching API responses (optional).

## Data Flow Diagram

```mermaid
graph TD
    Client[Browser / User] -->|HTTPS| Storefront[Storefront (Cloudflare Workers)]
    Storefront -->|REST API| Backend[Backend (Railway)]
    
    subgraph Backend Services
        Backend -->|Persist| DB[(PostgreSQL)]
        Backend -->|Queue| Redis[(Redis)]
        Redis -->|Job| Worker[Background Worker]
    end
    
    subgraph External Services
        Stripe[Stripe] -->|Webhook| Backend
        Backend -->|API| Stripe
    end
```
