# Product Overview

## Executive Summary

**Grace's Towel** is a premium e-commerce platform for Turkish cotton towels, built on a Headless Commerce architecture. It combines a robust, extensible backend engine (Medusa v2) with a high-performance, edge-rendered storefront (React Router v7). The system is designed for scalability, flexibility, and a premium user experience.

## Repository Structure

This project is a **Monorepo** containing:

- **Backend**: `apps/backend` (Medusa v2)
- **Storefront**: `apps/storefront` (React Router v7)
- **E2E Tests**: `apps/e2e` (Playwright)

## Technology Stack

| Component | Technology | Description |
| :--- | :--- | :--- |
| **Backend** | Medusa v2 | Headless Commerce Engine |
| **Database** | PostgreSQL | Relational Database |
| **Queue** | Redis + BullMQ | Event Bus, Cache & Job Queue |
| **Storefront** | React Router v7 | Edge-rendered Web App |
| **Styling** | TailwindCSS v4 | Utility-first CSS |
| **Deployment** | Railway / Cloudflare | Infrastructure |

## Architecture Type

**Headless Commerce / Modular Monolith**

The backend serves as the central source of truth for data and business logic, exposing APIs consumed by the decoupled storefront.

## Key Features

- **Hybrid Data Access**: Hyperdrive for fast reads, Medusa API for writes
- **1-Hour Grace Period**: Customers can modify orders within 1 hour of placement
- **Guest Checkout**: Magic link access for guest order modifications
- **Transactional Email**: BullMQ-powered async email delivery via Resend
- **Analytics**: PostHog integration for user tracking and monitoring

## Documentation Index

### Architecture
- [System Overview](../architecture/overview.md)
- [Backend Architecture](../architecture/backend.md)
- [Storefront Architecture](../architecture/storefront.md)
- [Data Models](../architecture/data-models.md)
- [Integrations](../architecture/integrations.md)

### Product
- [Epics Overview](./epics/overview.md)
- [PRDs](../prd/)

### Guides
- [Development Guide](../guides/development.md)
- [Deployment Guide](../guides/deployment.md)
- [Testing Guide](../guides/testing.md)

### Reference
- [Backend API](../reference/backend-api.md)
- [Storefront API](../reference/storefront-api.md)
- [Component Inventory](../reference/component-inventory.md)
