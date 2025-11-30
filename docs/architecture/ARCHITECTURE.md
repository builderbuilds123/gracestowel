# Grace Stowel - System Architecture

## Overview

Grace Stowel is a headless e-commerce platform designed for performance and scalability. It leverages **Medusa v2** for backend commerce logic and **React Router v7** on **Cloudflare Workers** for a globally distributed, edge-rendered storefront.

## Technology Stack

| Component | Technology | Purpose |
| :--- | :--- | :--- |
| **Backend** | Medusa v2.11.3 | Headless Commerce Engine |
| | PostgreSQL | Primary Relational Database |
| | Redis | Caching & Event Queue (BullMQ) |
| | Node.js | Server Runtime |
| **Storefront** | React Router v7 | Full-stack Framework (SSR) |
| | Cloudflare Workers | Edge Hosting Platform |
| | TailwindCSS v4 | Styling System |
| **Integrations** | Stripe | Payment Processing |
| | Resend | Transactional Emails |
| | PostHog | Product Analytics (Planned) |

## Architecture Patterns

### Headless Commerce
The frontend (Storefront) and backend (Medusa) are completely decoupled, communicating strictly via **REST APIs**. This allows independent scaling and deployment of each layer.

### Edge Rendering
The storefront uses **Server-Side Rendering (SSR)** at the edge (Cloudflare Workers). This ensures low latency for users worldwide by rendering HTML close to the user location.

### Event-Driven Architecture
The backend utilizes **Medusa's Event Bus** (backed by Redis/BullMQ) to handle asynchronous tasks such as:
- Order confirmation emails
- Search index updates
- Analytics tracking

## Data Flow

1.  **Storefront Request**: User visits site → Cloudflare Worker intercepts.
2.  **Data Fetching**: Worker calls Medusa API (backend) to fetch products/cart.
3.  **Rendering**: Worker renders React components to HTML string.
4.  **Response**: HTML sent to user.
5.  **Interactions**: Client-side React hydrates for interactivity (Add to Cart, Checkout).

## Deployment Architecture

- **Backend**: Hosted on **Railway** (Containerized Node.js app).
- **Database/Redis**: Managed services on **Railway**.
- **Storefront**: Serverless functions on **Cloudflare Workers**.
