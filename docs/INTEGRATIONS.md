# Integrations & Data Flow

## Overview

Grace Stowel integrates with external services for payments, commerce, and infrastructure. This document details each integration and how data flows through the system.

---

## Stripe Integration

### Overview

Stripe handles all payment processing, including:
- Payment Intents (card, ACH, Apple Pay, Google Pay)
- Shipping rate management
- Checkout sessions

### Configuration

**Environment Variables**:
```bash
STRIPE_SECRET_KEY=sk_live_...   # Server-side API key
STRIPE_PUBLISHABLE_KEY=pk_live_...  # Client-side key (embedded in code)
```

### API Endpoints

#### Payment Intent (`/api/payment-intent`)

Creates a Stripe PaymentIntent for checkout.

**Request**:
```json
{
  "amount": 75.00,
  "currency": "usd",
  "shipping": 8.99
}
```

**Response**:
```json
{
  "clientSecret": "pi_xxx_secret_xxx"
}
```

**Flow**:
```
Checkout page loads
        ↓
POST /api/payment-intent
        ↓
Stripe PaymentIntent created
        ↓
Client secret returned
        ↓
Stripe Elements initialized
        ↓
User completes payment
        ↓
Stripe confirms payment
        ↓
Redirect to /checkout/success
```

#### Shipping Rates (`/api/shipping-rates`)

Fetches available shipping options from Stripe.

**Request**:
```json
{
  "subtotal": 75.00
}
```

**Response**:
```json
{
  "shippingOptions": [
    {
      "id": "shr_xxx",
      "displayName": "Standard Shipping",
      "amount": 8.99,
      "originalAmount": 8.99,
      "deliveryEstimate": "5-7 days",
      "isFree": false
    },
    {
      "id": "shr_yyy",
      "displayName": "Ground Shipping",
      "amount": 0,
      "originalAmount": 5.99,
      "deliveryEstimate": "7-10 days",
      "isFree": true
    }
  ]
}
```

**Free Shipping Logic**:
- Threshold: $99
- Applied to: Ground Shipping only
- Dynamically recalculates when cart changes

### Stripe Elements Used

| Element | Purpose |
|---------|---------|
| `PaymentElement` | Card, bank, and wallet payments |
| `AddressElement` | Shipping address collection |
| `LinkAuthenticationElement` | Email + Stripe Link |
| `ExpressCheckoutElement` | Apple Pay, Google Pay, PayPal |

### Stripe Dashboard Setup

1. **Shipping Rates**: Create in Stripe Dashboard → Products → Shipping Rates
2. **Payment Methods**: Enable desired methods in Payment Settings
3. **Webhooks**: (Future) Configure for order processing

---

## Medusa Integration

### Overview

Medusa v2 provides the headless commerce backend:
- Product catalog management
- Order processing (future)
- Customer management (future)
- Inventory tracking (future)

### API Communication

**Storefront → Medusa**:
```typescript
// hooks/useMedusaProducts.ts
const MEDUSA_API_URL = process.env.MEDUSA_BACKEND_URL || "http://localhost:9000";

const response = await fetch(`${MEDUSA_API_URL}/store/products`, {
  headers: { "Content-Type": "application/json" },
  credentials: "include",
});
```

### Current Implementation Status

| Feature | Status | Notes |
|---------|--------|-------|
| Products API | ✅ Ready | `useMedusaProducts` hook |
| Admin Dashboard | ✅ Ready | Built-in Medusa admin |
| Checkout via Medusa | 🔄 Pending | Currently using Stripe directly |
| Order Management | 🔄 Pending | To be implemented |
| Customer Auth | 🔄 Pending | To be implemented |

### Data Model

```typescript
interface MedusaProduct {
  id: string;
  handle: string;
  title: string;
  description: string | null;
  thumbnail: string | null;
  images: Array<{ id: string; url: string }>;
  variants: Array<{
    id: string;
    title: string;
    prices: Array<{
      amount: number;        // In cents
      currency_code: string;
    }>;
  }>;
  options: Array<{
    id: string;
    title: string;
    values: Array<{ id: string; value: string }>;
  }>;
}
```

---

## Railway Integration

### Services

| Service | Purpose | Connection |
|---------|---------|------------|
| PostgreSQL | Primary database | Internal/External URL |
| Redis | Caching, sessions | Internal/External URL |
| Medusa Container | API server | HTTP |

### Connection Patterns

**Production (Internal Network)**:
```
Medusa Container → postgres.railway.internal:5432
                 → redis.railway.internal:6379
```

**Local Development (External Proxy)**:
```
Local Machine → shuttle.proxy.rlwy.net:48905 (PostgreSQL)
              → shortline.proxy.rlwy.net:34142 (Redis)
```

### Health Monitoring

Railway monitors the `/health` endpoint:
```toml
# railway.toml
[deploy]
healthcheckPath = "/health"
healthcheckTimeout = 100
```

---

## Cloudflare Integration

### Cloudflare Workers

The storefront runs on Cloudflare's edge network:

```toml
# wrangler.toml
name = "gracestowel-storefront"
compatibility_date = "2024-01-01"

[vars]
MEDUSA_BACKEND_URL = "https://medusa-backend.up.railway.app"
```

### Environment Variables

Set via Cloudflare Dashboard or `wrangler secret`:
```bash
wrangler secret put STRIPE_SECRET_KEY
wrangler secret put DATABASE_URL
```

### Future: Hyperdrive

For direct database access from Workers:
```typescript
// lib/db.server.ts (future)
const client = new Client({
  connectionString: context.env.HYPERDRIVE?.connectionString || process.env.DATABASE_URL
});
```

---

## Data Flow Diagrams

### Complete Checkout Flow

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  Customer   │────▶│  Storefront  │────▶│   Stripe    │
│   Browser   │     │  (CF Worker) │     │    API      │
└─────────────┘     └──────────────┘     └─────────────┘
      │                    │                    │
      │  1. Add to cart    │                    │
      │ ─────────────────▶ │                    │
      │                    │                    │
      │  2. Checkout       │  3. Create Intent  │
      │ ─────────────────▶ │ ──────────────────▶│
      │                    │                    │
      │                    │  4. Client Secret  │
      │                    │ ◀──────────────────│
      │                    │                    │
      │  5. Payment Form   │                    │
      │ ◀───────────────── │                    │
      │                    │                    │
      │  6. Submit Payment │  7. Confirm        │
      │ ─────────────────▶ │ ──────────────────▶│
      │                    │                    │
      │  8. Success        │  9. Confirmation   │
      │ ◀───────────────── │ ◀──────────────────│
      │                    │                    │
```

### Product Data Flow

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐     ┌──────────┐
│  Customer   │────▶│  Storefront  │────▶│   Medusa    │────▶│ PostgreSQL│
│   Browser   │     │  (CF Worker) │     │   Backend   │     │          │
└─────────────┘     └──────────────┘     └─────────────┘     └──────────┘
      │                    │                    │                  │
      │  Request page      │                    │                  │
      │ ─────────────────▶ │                    │                  │
      │                    │  Fetch products    │                  │
      │                    │ ──────────────────▶│                  │
      │                    │                    │  Query products  │
      │                    │                    │ ────────────────▶│
      │                    │                    │                  │
      │                    │                    │  Product data    │
      │                    │                    │ ◀────────────────│
      │                    │  JSON response     │                  │
      │                    │ ◀──────────────────│                  │
      │  Rendered page     │                    │                  │
      │ ◀───────────────── │                    │                  │
```

