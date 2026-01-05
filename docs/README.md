# Grace's Towel - Documentation

## Project Overview

- **Name:** Grace's Towel
- **Type:** Monorepo (Storefront + Backend + E2E)
- **Primary Language:** TypeScript
- **Architecture:** Headless Commerce (Medusa v2 + React Router v7)

## Quick Reference

### Backend (`apps/backend`)
- **Type:** Backend API
- **Tech Stack:** Medusa v2, Node.js, PostgreSQL, Redis, BullMQ
- **Root:** `apps/backend`

### Storefront (`apps/storefront`)
- **Type:** Storefront Web App
- **Tech Stack:** React Router v7, Cloudflare Workers, Hyperdrive
- **Root:** `apps/storefront`

### E2E Tests (`apps/e2e`)
- **Type:** End-to-End Tests
- **Tech Stack:** Playwright
- **Root:** `apps/e2e`

---

## Documentation Structure

### Architecture
System design and technical architecture documentation.

- [Overview](architecture/overview.md) - High-level system design
- [Backend](architecture/backend.md) - Medusa modules and API structure
- [Storefront](architecture/storefront.md) - Routing and frontend patterns
- [Data Models](architecture/data-models.md) - Database schema and entities
- [Data Layer](architecture/data-layer.md) - Product data, cart state, configuration
- [Integrations](architecture/integrations.md) - Stripe, Medusa, Cloudflare, Hyperdrive

### Guides
Developer guides and setup instructions.

- [Development](guides/development.md) - Local setup and running
- [Deployment](guides/deployment.md) - Railway and Cloudflare deployment
- [Environment Setup](guides/environment-setup.md) - Environment variables
- [Testing](guides/testing.md) - Testing strategy and commands
- [Railway Infrastructure](guides/railway-infrastructure.md) - Database and hosting

### Reference
API documentation and component catalogs.

- [Backend API](reference/backend-api.md) - Medusa API endpoints
- [Storefront API](reference/storefront-api.md) - Cloudflare Workers API routes
- [Storefront Components](reference/storefront-components.md) - React component library
- [API Contracts](reference/api-contracts.md) - API schemas
- [Environment Registry](reference/env-registry.md) - Environment variables

### Product
Product requirements and feature specifications.

- [Overview](product/overview.md) - Executive summary and feature roadmap
- [Epics](product/epics/overview.md) - Detailed feature specifications
- [PRDs](prd/) - Product Requirement Documents

### Sprint
Sprint management and active development.

- [Sprint Status](sprint/sprint-artifacts/sprint-status.yaml) - Active sprint tracking
- [Sprint Artifacts](sprint/sprint-artifacts/) - Story implementations
- [Proposals](sprint/proposals/) - Sprint change proposals

### Analysis
Research and analysis documents.

- [Inventory Analysis](analysis/inventory/) - Inventory system analysis
- [Research](analysis/research/) - Technical research

### Troubleshooting
Debugging guides and known issues.

- [Medusa Auth Module](troubleshooting/medusa-auth-module.md) - Known v2.11 bug
- [Stripe Errors](troubleshooting/stripe-errors.md) - Stripe error troubleshooting
- [Payment Debugging](troubleshooting/payment-debugging.md) - Payment flow debugging
- [PostHog Debugging](troubleshooting/posthog-frontend-debugging.md) - Frontend analytics

---

## Getting Started

1. **Setup Environment**: Follow the [Development Guide](guides/development.md)
2. **Understand the System**: Read the [Architecture Overview](architecture/overview.md)
3. **Explore Features**: Check [Product Overview](product/overview.md)

## Key Commands

```bash
# Development
pnpm dev                    # Start all services
pnpm dev:api               # Backend only
pnpm dev:storefront        # Storefront only

# Testing
pnpm test                  # All tests
pnpm typecheck             # Type checking
pnpm lint                  # Linting

# Deployment
pnpm deploy:storefront     # Deploy to Cloudflare
pnpm deploy:api            # Deploy to Railway
```

## External Resources

- [Medusa v2 Docs](https://docs.medusajs.com/v2) - Backend framework
- [React Router v7 Docs](https://reactrouter.com/dev/guides) - Frontend routing
- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/) - Edge deployment
- [Stripe API Reference](https://docs.stripe.com/api) - Payments
