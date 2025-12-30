# Grace Stowel - System Architecture

## Overview

Grace Stowel is an e-commerce platform for premium Turkish cotton towels, built on a modern headless architecture with:

- **Backend**: Medusa v2 (Node.js headless commerce engine)
- **Storefront**: React Router v7 + Cloudflare Workers
- **Infrastructure**: Railway (databases, backend hosting) + Cloudflare (frontend CDN, Hyperdrive)
- **Payments**: Stripe (checkout, payment intents, shipping rates)
- **Database Acceleration**: Cloudflare Hyperdrive (connection pooling for edge)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      HYBRID PRODUCTION ARCHITECTURE                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│    ┌──────────────────────┐                                                 │
│    │   Cloudflare Workers │                                                 │
│    │   (Edge Network)     │                                                 │
│    ├──────────────────────┤           ┌──────────────────────┐             │
│    │                      │   REST    │                      │             │
│    │   READ-WRITE OPS     │ ───────▶  │   Medusa Backend     │             │
│    │   (cart, checkout,   │           │   (Railway)          │             │
│    │    orders, reviews)  │           │                      │             │
│    │                      │           └──────────────────────┘             │
│    ├──────────────────────┤                                                 │
│    │                      │           ┌──────────────────────┐             │
│    │   READ-ONLY OPS      │ ───────▶  │   Hyperdrive         │──────┐      │
│    │   (products, search) │           │   (Connection Pool)  │      │      │
│    │                      │           └──────────────────────┘      │      │
│    └──────────────────────┘                                         │      │
│             │                                                       │      │
│             │                         ┌──────────────────────┐      │      │
│    ┌────────▼──────────────┐         │     PostgreSQL       │◀─────┘      │
│    │       Stripe          │         │   + Redis (Cache)    │              │
│    │   (Payments API)      │         │   (Railway)          │              │
│    └───────────────────────┘         └──────────────────────┘              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Hybrid Architecture Rationale

The storefront uses a **hybrid data access pattern**:

1. **Hyperdrive (Direct PostgreSQL)** - For read-only, high-frequency operations:
   - Product listings and detail pages
   - Product search
   - Category browsing
   - Benefits: Eliminates Medusa cold starts, edge connection pooling, ~50-100ms faster

2. **Medusa REST API** - For operations requiring business logic:
   - Cart management
   - Checkout flow
   - Order processing
   - Customer authentication
   - Reviews (writes)
   - Benefits: Maintains business logic, data integrity, proper validation

## Repository Structure

```
gracestowel/
├── apps/
│   ├── backend/                # Medusa v2 Backend
│   │   ├── src/
│   │   │   ├── api/            # Custom API routes
│   │   │   ├── modules/        # Custom Medusa modules
│   │   │   ├── workflows/      # Business logic workflows
│   │   │   ├── subscribers/    # Event subscribers
│   │   │   ├── jobs/           # Scheduled jobs
│   │   │   ├── links/          # Entity relationships
│   │   │   └── scripts/        # CLI scripts (seeding)
│   │   ├── medusa-config.ts    # Medusa configuration
│   │   ├── Dockerfile          # Production build
│   │   └── package.json
│   │
│   └── storefront/             # React Router v7 Storefront
│       ├── app/
│       │   ├── components/     # React components
│       │   ├── context/        # React contexts (Cart, Locale)
│       │   ├── hooks/          # Custom hooks
│       │   ├── routes/         # Page routes + API endpoints
│       │   ├── data/           # Static product data
│       │   ├── lib/            # Utilities (Stripe, DB)
│       │   └── config/         # Site configuration
│       ├── wrangler.toml       # Cloudflare Workers config
│       └── package.json
│
├── railway.toml                # Railway deployment config
├── ENVIRONMENT_SETUP.md        # Environment variables guide
├── RAILWAY_INFRASTRUCTURE.md   # Infrastructure documentation
└── package.json                # Root workspace config
```

## Technology Stack

### Backend (apps/backend)

| Technology | Purpose | Version |
|------------|---------|---------|
| Medusa v2 | Headless commerce engine | 2.11.3 |
| PostgreSQL | Primary database | 15+ |
| Redis | Caching, sessions, job queues | 7+ |
| Node.js | Runtime | 20+ |
| TypeScript | Type safety | 5.6+ |

### Storefront (apps/storefront)

| Technology | Purpose | Version |
|------------|---------|---------|
| React | UI framework | 19.x |
| React Router v7 | SSR routing | 7.x |
| Cloudflare Workers | Edge deployment | - |
| TailwindCSS | Styling | 4.x |
| Stripe.js | Payment UI | 8.x |

### Infrastructure

| Service | Purpose | Provider |
|---------|---------|----------|
| PostgreSQL | Database | Railway |
| Redis | Cache | Railway |
| Backend hosting | API server | Railway |
| CDN + Edge | Storefront | Cloudflare |
| Hyperdrive | DB connection pooling | Cloudflare |
| Payments | Transactions | Stripe |

## Data Flow

### 1. Product Display Flow (Hyperdrive - Fast Path)
```
User → Cloudflare Edge → React Storefront → Hyperdrive → PostgreSQL
                                   ↓
                            Products rendered (~50-100ms faster)
```

**Fallback Path** (if Hyperdrive unavailable):
```
User → Cloudflare Edge → React Storefront → Medusa API → PostgreSQL
```

### 2. Checkout Flow
```
User adds to cart → Cart Context (localStorage)
                              ↓
User proceeds to checkout → /api/payment-intent (server action)
                              ↓
                        Stripe PaymentIntent created
                              ↓
                        Stripe Elements UI rendered
                              ↓
User submits payment → Stripe confirms payment
                              ↓
                        Redirect to /checkout/success
```

### 3. Shipping Rate Flow
```
User enters address → AddressElement onChange
                              ↓
                    /api/shipping-rates (server action)
                              ↓
                    Fetch Stripe Shipping Rates
                              ↓
                    Apply free shipping logic ($99+ threshold)
                              ↓
                    Display shipping options
```

## Key Configuration Files

| File | Purpose |
|------|---------|
| `apps/backend/medusa-config.ts` | Medusa core configuration |
| `apps/storefront/wrangler.toml` | Cloudflare Workers config |
| `railway.toml` | Railway deployment settings |
| `apps/backend/.env` | Local development secrets |
| `apps/storefront/.dev.vars` | Cloudflare local secrets |

## Related Documentation

### Setup & Infrastructure
- [Environment Setup](./docs/ENVIRONMENT_SETUP.md) - How to configure environment variables
- [Railway Infrastructure](./docs/RAILWAY_INFRASTRUCTURE.md) - Database and hosting setup
- [Development Workflow](./docs/DEV_WORKFLOW.md) - Local development guide

### API & Backend
- [Backend API Reference](./docs/BACKEND_API.md) - Medusa API endpoints documentation
- [Storefront API Reference](./docs/STOREFRONT_API.md) - Cloudflare Workers API routes

### Frontend
- [Storefront Components](./docs/STOREFRONT_COMPONENTS.md) - React component library
- [Data Layer](./docs/DATA_LAYER.md) - Product data, cart state, and configuration

### Integrations
- [Integrations Guide](./docs/INTEGRATIONS.md) - Stripe, Medusa, and Cloudflare integrations

### Troubleshooting
- [Medusa Auth Module Issue](./docs/MEDUSA_AUTH_MODULE_ISSUE.md) - Known v2.11 bug and workarounds

