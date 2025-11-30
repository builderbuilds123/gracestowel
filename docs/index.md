# Grace Stowel - Project Documentation

## Project Overview

- **Type:** Monorepo with 2 parts
- **Primary Language:** TypeScript
- **Architecture:** Headless Commerce (Medusa v2 + React Router v7)

## Quick Reference

### Backend (`apps/backend`)
- **Type:** Headless Commerce Engine
- **Tech Stack:** Medusa v2, Node.js, PostgreSQL, Redis
- **Root:** `apps/backend`

### Storefront (`apps/storefront`)
- **Type:** Edge-rendered Web App
- **Tech Stack:** React Router v7, Cloudflare Workers, TailwindCSS
- **Root:** `apps/storefront`

## Generated Documentation

- [Project Overview](./project-overview.md)
- [Architecture](./architecture/architecture.md)
- [Source Tree Analysis](./source-tree-analysis.md)
- [Development Guide](./development-guide.md)

## Existing Documentation

- [Backend API Reference](./api/BACKEND_API.md)
- [Storefront API Reference](./api/STOREFRONT_API.md)
- [Storefront Components](./components/STOREFRONT_COMPONENTS.md)
- [Environment Setup](./development/ENVIRONMENT_SETUP.md)
- [Product Requirements](./prd/2025-11-25_ecommerce_v1_prd.md)

## Getting Started

To get the project running locally:

1.  **Clone the repository.**
2.  **Setup Environment:** Follow the [Development Guide](./development-guide.md).
3.  **Install Dependencies:** `npm install` in root.
4.  **Start Backend:** `cd apps/backend && npm run dev`
5.  **Start Storefront:** `cd apps/storefront && npm run dev`
