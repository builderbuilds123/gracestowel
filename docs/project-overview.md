# Project Overview

## Executive Summary

Grace Stowel is a modern e-commerce platform specializing in premium Turkish cotton towels. The system is built on a **headless architecture** separating the frontend storefront from the backend commerce engine.

- **Storefront:** A high-performance **React Router v7** application deployed to **Cloudflare Workers** for edge delivery.
- **Backend:** A **Medusa v2** headless commerce engine hosted on **Railway**, handling products, orders, and business logic.
- **Infrastructure:** Utilizes **PostgreSQL** and **Redis** for data persistence and caching, with **Stripe** for payments.

## Technology Stack Summary

| Component | Technology | Version | Description |
| :--- | :--- | :--- | :--- |
| **Storefront** | React Router | v7.9.2 | SSR framework for edge deployment |
| | React | v19.1.1 | UI library |
| | TailwindCSS | v4.1.13 | Utility-first styling |
| | Cloudflare Workers | - | Edge runtime environment |
| **Backend** | Medusa | v2.11.3 | Headless commerce framework |
| | Node.js | >=20 | Server runtime |
| | PostgreSQL | - | Primary database |
| | Redis | - | Cache and event queue |
| **Integrations** | Stripe | v20 | Payment processing |
| | Resend | - | Email notifications |

## Architecture Classification

- **Type:** **Monorepo** (Multi-part)
- **Pattern:** **Headless Commerce** (Decoupled Frontend/Backend)
- **Repository Structure:**
    - `apps/storefront`: Frontend application
    - `apps/backend`: Backend API and Admin

## Documentation Status

This documentation was generated via a **Quick Scan** of the repository.

- [Source Tree Analysis](./source-tree-analysis.md)
- [Architecture](./architecture.md) _(To be generated)_
- [Development Guide](./development-guide.md) _(To be generated)_
