# Integrations & Data Flow

## Overview

Grace's Towel integrates with external services for payments, commerce, and infrastructure. This document details each integration and how data flows through the system.

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

---

## Medusa Integration

### Overview

Medusa v2 provides the headless commerce backend:
- Product catalog management
- Order processing
- Customer management
- Inventory tracking

### API Communication

```typescript
// hooks/useMedusaProducts.ts
const MEDUSA_API_URL = process.env.MEDUSA_BACKEND_URL || "http://localhost:9000";

const response = await fetch(`${MEDUSA_API_URL}/store/products`, {
  headers: { "Content-Type": "application/json" },
  credentials: "include",
});
```

### Implementation Status

| Feature | Status |
|---------|--------|
| Products API | ✅ Ready |
| Admin Dashboard | ✅ Ready |
| Checkout via Medusa | ✅ Ready |
| Order Management | ✅ Ready |
| Customer Auth | ✅ Ready |

---

## Railway Integration

### Services

| Service | Purpose | Connection |
|---------|---------|------------|
| PostgreSQL | Primary database | Internal/External URL |
| Redis | Caching, sessions, BullMQ | Internal/External URL |
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
  "hyperdrive": [
    {
      "binding": "HYPERDRIVE",
      "id": "<YOUR_HYPERDRIVE_ID>"
    }
  ]
}
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

---

## Data Flow Diagrams

### Product Data Flow (Hyperdrive - Fast Path)

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐     ┌──────────┐
│  Customer   │────▶│  Storefront  │────▶│  Hyperdrive │────▶│ PostgreSQL│
│   Browser   │     │  (CF Worker) │     │  (CF Edge)  │     │ (Railway) │
└─────────────┘     └──────────────┘     └─────────────┘     └──────────┘
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
```
