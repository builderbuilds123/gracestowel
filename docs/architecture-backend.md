# Backend Architecture

## Executive Summary

The Backend is a **Headless Commerce Engine** built on **Medusa v2**. It provides the core business logic, data persistence, and API layer for the e-commerce platform. It is designed to be modular, extensible, and scalable.

## Technology Stack

- **Framework**: Medusa v2 (Node.js)
- **Language**: TypeScript
- **Database**: PostgreSQL
- **Queue/Event Bus**: Redis (BullMQ)
- **Payment Provider**: Stripe
- **Email Provider**: Resend

## Architecture Pattern

The backend follows a **Modular Monolith** architecture.
- **Modules**: Domain logic is encapsulated in modules (e.g., Product, Order, Review).
- **Workflows**: Complex business processes are defined as workflows (steps).
- **Subscribers**: Event-driven side effects (e.g., sending emails) are handled by subscribers.
- **API Layer**: Exposes REST endpoints for Storefront and Admin clients.

## Data Architecture

Data is managed using Medusa's DML (Data Modeling Language) and MikroORM.
- **Core Entities**: Product, Order, Customer, Cart (managed by Medusa core).
- **Custom Entities**: Review (defined in `apps/backend/src/modules/review`).
- **Migrations**: Database schema changes are managed via migrations.

## API Design

The API is divided into:
- **Store API**: Public/Customer endpoints.
- **Admin API**: Protected management endpoints.
- **Webhooks**: External integration endpoints.

See [Backend API Contracts](../api-contracts-backend.md) for details.

## Development Workflow

- **Local Dev**: `npm run dev` starts the Medusa server.
- **Testing**: Jest is used for unit and integration tests.
- **Seeding**: `npm run seed` populates the database with initial data.

## Deployment

Deployed to **Railway** as a Docker container.
See [Deployment Guide](../deployment-guide.md) for details.
