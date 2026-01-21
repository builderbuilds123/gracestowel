# Deployment Guide

## CI/CD Pipeline

The project uses GitHub Actions for Continuous Integration and Deployment. The pipeline is defined in `.github/workflows/ci.yml`.

### Stages

1.  **Validation**:
    *   Secrets Scanning (Gitleaks)
    *   Dependency & Config Scanning (Trivy)
    *   Linting & Type Checking
    *   Security Audit

2.  **Unit Tests**:
    *   Backend: Jest (with coverage)
    *   Storefront: Vitest (with coverage)

3.  **E2E Tests**:
    *   Runs Playwright tests in a Dockerized environment.
    *   Spins up Postgres, Redis, Backend, and Storefront containers.
    *   Seeds test data and verifies full system flow.

4.  **Artifact Build**:
    *   Builds Backend Docker image and pushes to GHCR.

5.  **Deployment**:
    *   **Staging**: Deploys to Railway (Backend) and Cloudflare Workers (Storefront) on push to `staging`.
    *   **Production**: Deploys to Railway (Backend) and Cloudflare Workers (Storefront) on push to `main`.

## Environments

| Environment | Branch | Backend Host | Storefront Host |
| :--- | :--- | :--- | :--- |
| **Staging** | `staging` | Railway | Cloudflare Workers (Staging) |
| **Production** | `main` | Railway | Cloudflare Workers (Production) |

## Backend Deployment (Railway)

- **Tool**: Railway CLI
- **Config**: `railway.toml`, `apps/backend/Dockerfile`
- **Process**:
    1.  Install Railway CLI.
    2.  Deploy using `railway up`.
    3.  Service name and environment are dynamic based on branch.

### Docker Build Architecture

The backend uses a multi-stage Dockerfile with `pnpm deploy --legacy` to create a self-contained production image:

1. **deps stage**: Installs all dependencies in the monorepo
2. **builder stage**: Builds the Medusa app and runs `pnpm deploy --prod --legacy` to create an isolated deployment with resolved symlinks
3. **runner stage**: Copies the deployment artifacts into a minimal production image

### Key Files Copied to Production

| Source | Destination | Purpose |
|--------|-------------|---------|
| `/deploy/node_modules` | `/app/node_modules` | Self-contained dependencies (no symlinks) |
| `/deploy/package.json` | `/app/package.json` | Package manifest |
| `.medusa/server/medusa-config.js` | `/app/medusa-config.js` | Compiled configuration |
| `.medusa/server/src` | `/app/src` | Compiled custom modules (JS, not TS) |
| `.medusa/server/public` | `/app/public` | Admin dashboard assets |
| `.medusa` | `/app/.medusa` | Full build output |

### Dependency Management for Production

When using `pnpm deploy --prod`, only `dependencies` (not `devDependencies`) are included. Ensure all runtime dependencies are in `dependencies`:

| Package | Why It's Required |
|---------|-------------------|
| `@medusajs/notification` | Referenced in `medusa-config.ts` modules |
| `@medusajs/file` | File module wrapper for S3 provider |
| `@medusajs/event-bus-redis` | Redis-backed event bus |
| `@medusajs/file-s3` | S3/R2 file storage provider |
| `react`, `react-dom` | Required by `@react-email/components` for email templates |

**Common Pitfall**: If a module is configured in `medusa-config.ts` but not listed in `package.json` dependencies, it won't be included in the production image and will cause `MODULE_NOT_FOUND` errors at runtime.

### Troubleshooting Deployment Failures

| Error | Cause | Fix |
|-------|-------|-----|
| `Cannot find module '@medusajs/cli/cli.js'` | pnpm symlinks broken in Docker | Use `pnpm deploy --legacy` to resolve symlinks |
| `Cannot find module '/app/medusa-config'` | Config not copied or not compiled | Copy from `.medusa/server/medusa-config.js` |
| `Cannot find module '/app/src/modules/...'` | Raw TypeScript copied instead of compiled JS | Copy from `.medusa/server/src` |
| `Cannot find module 'react/jsx-runtime'` | React in devDependencies | Move `react`/`react-dom` to dependencies |
| `Cannot find module '@medusajs/notification'` | Module not in package.json | Add to dependencies explicitly |

## Storefront Deployment (Cloudflare Workers)

- **Tool**: Wrangler (Cloudflare CLI)
- **Config**: `wrangler.jsonc` (patched dynamically during CI)
- **Process**:
    1.  Build app: `npm run build`.
    2.  Patch `wrangler.json` with environment-specific name and bindings.
    3.  Deploy: `wrangler deploy`.

## Secrets Management

- **GitHub Secrets**: Used for CI/CD credentials (`RAILWAY_TOKEN`, `CLOUDFLARE_API_TOKEN`).
- **Railway Variables**: Managed in Railway dashboard.
- **Cloudflare Secrets**: Managed via `wrangler secret put` or Cloudflare dashboard.
