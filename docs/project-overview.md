# Project Overview

## Executive Summary

**Grace Stowel** is a modern e-commerce platform built on a Headless Commerce architecture. It combines a robust, extensible backend engine (Medusa v2) with a high-performance, edge-rendered storefront (React Router v7). The system is designed for scalability, flexibility, and a premium user experience.

## Repository Structure

This project is a **Monorepo** containing:

- **Backend**: `apps/backend` (Medusa v2)
- **Storefront**: `apps/storefront` (React Router v7)

## Technology Stack

| Component | Technology | Description |
| :--- | :--- | :--- |
| **Backend** | Medusa v2 | Headless Commerce Engine |
| **Database** | PostgreSQL | Relational Database |
| **Queue** | Redis | Event Bus & Cache |
| **Storefront** | React Router v7 | Edge-rendered Web App |
| **Styling** | TailwindCSS | Utility-first CSS |
| **Deployment** | Railway / Cloudflare | Infrastructure |

## Architecture Type

**Headless Commerce / Modular Monolith**

The backend serves as the central source of truth for data and business logic, exposing APIs consumed by the decoupled storefront.

## Documentation Index

- [Architecture - Backend](./architecture-backend.md)
- [Architecture - Storefront](./architecture-storefront.md)
- [Source Tree Analysis](./source-tree-analysis.md)
- [Integration Architecture](./integration-architecture.md)
- [Deployment Guide](./deployment-guide.md)
