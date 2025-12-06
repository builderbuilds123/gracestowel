# Project Documentation Index

## Project Overview

- **Name:** Grace's Towel
- **Type:** Monorepo (Storefront + Backend)
- **Primary Language:** TypeScript
- **Architecture:** Headless Commerce (Medusa v2 + React Router v7)

## Quick Reference

#### Grace's Towel Storefront (storefront)
- **Type:** web
- **Tech Stack:** React Router v7, Vite, Tailwind CSS
- **Root:** `apps/storefront`

#### Medusa Backend (backend)
- **Type:** backend
- **Tech Stack:** Medusa v2, Node.js, PostgreSQL, Redis
- **Root:** `apps/backend`

## Documentation

### Product & Requirements
- [**Product Overview**](product/overview.md): Executive summary and feature roadmap.
- [**Epics**](product/epics/overview.md): Detailed feature specifications.
- [**PRDs**](product/prds/): Product Requirement Documents.

### Architecture
- [**System Overview**](architecture/overview.md): High-level system design.
- [**Storefront Architecture**](architecture/storefront.md): Routing and frontend patterns.
- [**Backend Architecture**](architecture/backend.md): Modules and API structure.
- [**Integration Architecture**](architecture/integration.md): External services (Stripe, Resend, etc.).
- [**Data Models**](architecture/data-models.md): Database schema and entities.

### Developer Guides
- [**Development Guide**](guides/development.md): Setup, running locally, and testing.
- [**Deployment Guide**](guides/deployment.md): Railway and Cloudflare deployment.

### Reference
- [**Component Inventory**](reference/component-inventory.md): UI component catalog.
- [**API Contracts**](reference/api-contracts.md): API endpoints and schemas.

### Insights
- [**Source Tree Analysis**](insights/source-tree-analysis.md): Annotated project structure.
- [**Project Parts**](insights/project-parts.json): Machine-readable project metadata.

### Sprint
- [**Sprint Status**](sprint/sprint-artifacts/sprint-status.yaml): Active sprint tracking.

## Getting Started

1. **Setup Environment**: Follow the [Development Guide](guides/development.md).
2. **Understand the System**: Read the [Architecture Overview](architecture/overview.md).
3. **Explore Features**: Check [Product Overview](product/overview.md).
