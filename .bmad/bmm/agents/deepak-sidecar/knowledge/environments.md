# Environment Configuration Guide

This document describes the systematic approach to configuring environments across GitHub, Railway, and Cloudflare.

## Environment Overview

| Environment | Git Branch | Railway Service | Cloudflare Worker | Database |
|-------------|------------|-----------------|-------------------|----------|
| Production  | `main`     | `production`    | `gracestowelstorefront` | Railway PostgreSQL (prod) |
| Staging     | `staging`  | `staging`       | `gracestowelstorefront-staging` | Railway PostgreSQL (staging) |
| Local Dev   | any        | N/A             | `wrangler dev`    | Local PostgreSQL |

## GitHub Configuration

### Repository Secrets (Settings > Secrets and variables > Actions)

#### Shared Secrets (used by all environments)
| Secret | Description |
|--------|-------------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token with Workers permissions |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID |
| `MEDUSA_PUBLISHABLE_KEY` | Medusa Store API publishable key (for E2E tests) |
| `CODECOV_TOKEN` | Codecov upload token |

### Environment-Specific Secrets

Configure these in **Settings > Environments > [environment] > Environment secrets**:

#### `staging` Environment
| Secret | Description | Example |
|--------|-------------|---------|
| `HYPERDRIVE_ID` | Cloudflare Hyperdrive ID for staging DB | `abc123...` |
| `MEDUSA_BACKEND_URL` | Railway staging backend URL | `https://gracestowel-staging.up.railway.app` |

#### `production` Environment
| Secret | Description | Example |
|--------|-------------|---------|
| `HYPERDRIVE_ID` | Cloudflare Hyperdrive ID for production DB | `def456...` |
| `MEDUSA_BACKEND_URL` | Railway production backend URL | `https://gracestowel-backend.up.railway.app` |

## Railway Configuration

### Service Structure
```
Railway Project
├── production (environment)
│   ├── backend (Medusa service)
│   ├── postgres (database)
│   └── redis (cache)
└── staging (environment)
    ├── backend (Medusa service)
    ├── postgres (database)
    └── redis (cache)
```

### Environment Variables per Service

#### Backend Service (both environments)
| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string (auto-set by Railway) |
| `REDIS_URL` | Redis connection string (auto-set by Railway) |
| `JWT_SECRET` | JWT signing secret |
| `COOKIE_SECRET` | Cookie encryption secret |
| `STORE_CORS` | Allowed origins for Store API |
| `ADMIN_CORS` | Allowed origins for Admin API |
| `AUTH_CORS` | Allowed origins for Auth API |

## Cloudflare Configuration

### Hyperdrive Setup

Create two Hyperdrive configurations in Cloudflare Dashboard:

1. **Production Hyperdrive** (`HYPERDRIVE_ID` for production)
   - Name: `gracestowel-hyperdrive-production`
   - Database: Railway production PostgreSQL

2. **Staging Hyperdrive** (`HYPERDRIVE_ID` for staging)
   - Name: `gracestowel-hyperdrive-staging`
   - Database: Railway staging PostgreSQL

### Worker Secrets (per environment)

Set these via Cloudflare Dashboard or `wrangler secret put`:

```bash
# For production worker
wrangler secret put MEDUSA_BACKEND_URL --env production
# Enter: https://gracestowel-backend.up.railway.app

wrangler secret put MEDUSA_PUBLISHABLE_KEY --env production
# Enter: pk_xxx...

# For staging worker
wrangler secret put MEDUSA_BACKEND_URL --env staging
# Enter: https://gracestowel-staging.up.railway.app

wrangler secret put MEDUSA_PUBLISHABLE_KEY --env staging
# Enter: pk_xxx...
```

## Local Development

### Required Files

1. **`apps/storefront/.dev.vars`** (gitignored)
```env
DATABASE_URL="postgresql://user:pass@localhost:5432/medusa"
MEDUSA_BACKEND_URL="http://localhost:9000"
MEDUSA_PUBLISHABLE_KEY="pk_xxx..."
```

2. **`apps/backend/.env`** (gitignored)
```env
DATABASE_URL="postgresql://user:pass@localhost:5432/medusa"
REDIS_URL="redis://localhost:6379"
JWT_SECRET="local-dev-secret"
COOKIE_SECRET="local-dev-secret"
```

## CI/CD Flow

```
┌─────────────────┐
│  Push to main   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│    Validate     │ ← Lint, TypeCheck, Security
└────────┬────────┘
         │
    ┌────┴────┬─────────────┐
    ▼         ▼             ▼
┌───────┐ ┌───────┐ ┌───────────┐
│Backend│ │Store- │ │   E2E     │
│ Tests │ │front  │ │  Tests    │
└───┬───┘ │Tests  │ └─────┬─────┘
    │     └───┬───┘       │
    └─────────┴───────────┘
              │
              ▼
    ┌─────────────────┐
    │  Build Backend  │
    │     Image       │
    └────────┬────────┘
             │
             ▼
    ┌─────────────────┐
    │ Deploy to       │ ← Uses environment-specific
    │ Production/     │   secrets from GitHub
    │ Staging         │
    └─────────────────┘
```

## Troubleshooting

### Hyperdrive Connection Issues
1. Verify the Hyperdrive ID matches the GitHub secret
2. Check that the Hyperdrive config points to the correct Railway database
3. Ensure the database allows connections from Cloudflare IPs

### Railway Deployment Issues
1. Check that the correct branch is connected to the correct environment
2. Verify environment variables are set in Railway dashboard
3. Check deployment logs for database migration errors

### Cloudflare Deployment Issues
1. Verify `CLOUDFLARE_API_TOKEN` has Workers permissions
2. Check that environment secrets are set in both GitHub and Cloudflare
3. Verify the worker name matches the wrangler.jsonc configuration
