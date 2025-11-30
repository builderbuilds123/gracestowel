# Development Guide

## Prerequisites

- **Node.js**: >=20
- **Package Manager**: npm (or pnpm/yarn)
- **Database**: PostgreSQL (v15+)
- **Cache**: Redis (v7+)
- **Cloudflare Wrangler**: (for Storefront)

## Environment Setup

### Backend (`apps/backend`)

1.  Copy `.env.template` to `.env`:
    ```bash
    cp apps/backend/.env.template apps/backend/.env
    ```
2.  Update `DATABASE_URL` and `REDIS_URL` with your local or dev database credentials.

### Storefront (`apps/storefront`)

1.  Copy `.dev.vars.example` (if exists) or create `.dev.vars`:
    ```bash
    # apps/storefront/.dev.vars
    MEDUSA_BACKEND_URL="http://localhost:9000"
    ```

## Running Locally

### Backend

```bash
cd apps/backend
npm install
npm run seed   # Seed database with initial data
npm run dev    # Start Medusa server on port 9000
```

### Storefront

```bash
cd apps/storefront
npm install
npm run dev    # Start React Router dev server on port 5173
```

## Testing

### Backend

```bash
cd apps/backend
npm run test              # Run all tests
npm run test:unit         # Run unit tests
npm run test:integration  # Run integration tests
```

### Storefront

```bash
cd apps/storefront
npm run test              # Run Vitest
npm run test:coverage     # Run tests with coverage
```

## Deployment

### Backend (Railway)

The backend is configured for deployment on Railway using the `railway.toml` file.
- **Build Command**: `medusa build`
- **Start Command**: `medusa start`

### Storefront (Cloudflare Workers)

The storefront is deployed to Cloudflare Workers.
- **Build**: `npm run build`
- **Deploy**: `npm run deploy`
