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
- **Config**: `railway.toml`
- **Process**:
    1.  Install Railway CLI.
    2.  Deploy using `railway up`.
    3.  Service name and environment are dynamic based on branch.

## Storefront Deployment (Cloudflare Workers)

- **Tool**: Wrangler (Cloudflare CLI)
- **Config**: `wrangler.jsonc` (patched dynamically during CI)
- **Process**:
    1.  Build app: `npm run build`.
    2.  Patch `wrangler.json` with environment-specific name and bindings (Hyperdrive).
    3.  Deploy: `wrangler deploy`.

## Secrets Management

- **GitHub Secrets**: Used for CI/CD credentials (`RAILWAY_TOKEN`, `CLOUDFLARE_API_TOKEN`, `HYPERDRIVE_ID`).
- **Railway Variables**: Managed in Railway dashboard.
- **Cloudflare Secrets**: Managed via `wrangler secret put` or Cloudflare dashboard.
