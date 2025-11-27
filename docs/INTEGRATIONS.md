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

```jsonc
// wrangler.jsonc
{
  "name": "gracestowelstorefront",
  "compatibility_date": "2025-04-04",
  "compatibility_flags": ["nodejs_compat"],
  "main": "./workers/app.ts",
  "hyperdrive": [
    {
      "binding": "HYPERDRIVE",
      "id": "<YOUR_HYPERDRIVE_ID>"
    }
  ]
}
```

### Environment Variables

Set via Cloudflare Dashboard or `wrangler secret`:
```bash
wrangler secret put STRIPE_SECRET_KEY
wrangler secret put MEDUSA_BACKEND_URL
```

For local development, create `.dev.vars`:
```bash
DATABASE_URL=postgresql://user:pass@host:port/db
MEDUSA_BACKEND_URL=http://localhost:9000
STRIPE_SECRET_KEY=sk_test_...
```

---

## Hyperdrive Integration

### Overview

Hyperdrive provides connection pooling for PostgreSQL at Cloudflare's edge, enabling direct database access without the latency of going through the Medusa backend.

**Benefits:**
- Eliminates Medusa cold start time (~500-2000ms saved)
- Connection pooling at regional edge locations
- Optional query caching at the edge
- Automatic failover to Medusa API if Hyperdrive fails

### Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     HYPERDRIVE DATA FLOW                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────┐     ┌──────────────┐     ┌─────────────────────────┐  │
│  │  Customer   │────▶│  Storefront  │────▶│      Hyperdrive         │  │
│  │   Browser   │     │  (CF Worker) │     │  (Edge Connection Pool) │  │
│  └─────────────┘     └──────────────┘     └───────────┬─────────────┘  │
│                                                        │                 │
│                                            ┌───────────▼─────────────┐  │
│                                            │      PostgreSQL         │  │
│                                            │       (Railway)         │  │
│                                            └─────────────────────────┘  │
│                                                                          │
│  Typical latency: 50-150ms (vs 200-500ms+ through Medusa)               │
└─────────────────────────────────────────────────────────────────────────┘
```

### Setup Instructions

#### 1. Create Hyperdrive Configuration

```bash
# In Cloudflare Dashboard or via Wrangler CLI
wrangler hyperdrive create gracestowel-db \
  --connection-string="postgresql://user:pass@host:port/railway"
```

#### 2. Update wrangler.jsonc

```jsonc
{
  "hyperdrive": [
    {
      "binding": "HYPERDRIVE",
      "id": "your-hyperdrive-config-id"
    }
  ]
}
```

#### 3. Deploy

```bash
cd apps/storefront
pnpm run deploy
```

### Usage in Code

```typescript
// lib/products.server.ts
import { getProductByHandleFromDB, isHyperdriveAvailable } from "../lib/products.server";

// In route loader
export async function loader({ context, params }) {
  // Check if Hyperdrive is available
  if (isHyperdriveAvailable(context)) {
    try {
      const product = await getProductByHandleFromDB(context, params.handle);
      if (product) return { product };
    } catch (error) {
      console.warn("Hyperdrive failed, falling back to Medusa");
    }
  }

  // Fallback to Medusa API
  const medusa = getMedusaClient(context);
  const product = await medusa.getProductByHandle(params.handle);
  return { product };
}
```

### Operations via Hyperdrive

| Operation | Via Hyperdrive | Via Medusa API |
|-----------|----------------|----------------|
| Product listing | ✅ | Fallback |
| Product detail | ✅ | Fallback |
| Product search | ✅ | Fallback |
| Category browsing | ✅ | Fallback |
| Cart operations | ❌ | ✅ Required |
| Checkout | ❌ | ✅ Required |
| Order management | ❌ | ✅ Required |
| Customer auth | ❌ | ✅ Required |
| Review submission | ❌ | ✅ Required |

### Security Considerations

1. **Read-only access**: Hyperdrive connection should use a read-only PostgreSQL user
2. **Query safety**: All queries use parameterized statements to prevent SQL injection
3. **Fallback**: If Hyperdrive fails, system gracefully falls back to Medusa API

### Local Development

For local development without Hyperdrive:

1. Set `DATABASE_URL` in `.dev.vars` pointing to your development database
2. The code automatically detects and uses direct connection instead of Hyperdrive

```bash
# .dev.vars
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/medusa
```

---

## Data Flow Diagrams

### Product Data Flow (Hyperdrive - Fast Path)

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐     ┌──────────┐
│  Customer   │────▶│  Storefront  │────▶│  Hyperdrive │────▶│ PostgreSQL│
│   Browser   │     │  (CF Worker) │     │  (CF Edge)  │     │ (Railway) │
└─────────────┘     └──────────────┘     └─────────────┘     └──────────┘
      │                    │                    │                  │
      │  Request page      │                    │                  │
      │ ─────────────────▶ │                    │                  │
      │                    │  SQL via pooled    │                  │
      │                    │  connection        │                  │
      │                    │ ──────────────────▶│                  │
      │                    │                    │  Query products  │
      │                    │                    │ ────────────────▶│
      │                    │                    │                  │
      │                    │                    │  Product data    │
      │                    │                    │ ◀────────────────│
      │                    │  Result set        │                  │
      │                    │ ◀──────────────────│                  │
      │  Rendered page     │                    │                  │
      │ ◀───────────────── │  (~50-150ms total) │                  │
```

### Product Data Flow (Medusa Fallback)

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐     ┌──────────┐
│  Customer   │────▶│  Storefront  │────▶│   Medusa    │────▶│ PostgreSQL│
│   Browser   │     │  (CF Worker) │     │   Backend   │     │ (Railway) │
└─────────────┘     └──────────────┘     └─────────────┘     └──────────┘
      │                    │                    │                  │
      │  Request page      │                    │                  │
      │ ─────────────────▶ │                    │                  │
      │                    │  REST API call     │                  │
      │                    │ ──────────────────▶│                  │
      │                    │                    │  Query products  │
      │                    │                    │ ────────────────▶│
      │                    │                    │                  │
      │                    │                    │  Product data    │
      │                    │                    │ ◀────────────────│
      │                    │  JSON response     │                  │
      │                    │ ◀──────────────────│                  │
      │  Rendered page     │                    │                  │
      │ ◀───────────────── │ (~200-500ms total) │                  │
```

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

