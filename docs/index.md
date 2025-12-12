# Grace Stowel - Project Documentation

## Project Documentation Index

### Project Overview

- **Type:** Monorepo with 2 parts
- **Primary Language:** TypeScript
- **Architecture:** Headless Commerce (Medusa v2 + React Router v7)

### Quick Reference

#### Backend (backend)

- **Type:** Backend API
- **Tech Stack:** Medusa v2, Node.js, PostgreSQL
- **Root:** `apps/backend`

#### Storefront (storefront)

- **Type:** Storefront Web App
- **Tech Stack:** React Router v7, Cloudflare Workers
- **Root:** `apps/storefront`

### Generated Documentation

- [Project Overview](./project-overview.md)
- [Source Tree Analysis](./source-tree-analysis.md)
- [Integration Architecture](./integration-architecture.md)
- [Deployment Guide](./deployment-guide.md)

#### Backend
- [Architecture](./architecture-backend.md)
- [API Contracts](./api-contracts-backend.md)
- [Data Models](./data-models-backend.md)

#### Storefront
- [Architecture](./architecture-storefront.md)
- [Component Inventory](./component-inventory-storefront.md)

### Existing Documentation

- [Development Guide](./development-guide.md)
- [Environment Registry](./env-registry.md)
- [Epics](./epics.md)
- [UX Design Specification](./ux-design-specification.md)
- [PRD - Cookie Policy](./cookie-policy-prd.md)
- [PRD - PostHog Integration](./posthog-analytics-integration-prd.md)

### Getting Started

To get the project running locally:

1.  **Clone the repository.**
2.  **Setup Environment:** Follow the [Development Guide](./development-guide.md).
3.  **Install Dependencies:** `pnpm install` in root.
4.  **Start Backend:** `cd apps/backend && pnpm run dev`
5.  **Start Storefront:** `cd apps/storefront && pnpm run dev`
