# Source Tree Analysis

## Project Structure

This is a **Monorepo** containing 2 distinct parts:

1.  **apps/backend**: Headless Commerce Engine (Medusa v2)
2.  **apps/storefront**: Edge-rendered Web App (React Router v7)

## Directory Tree

```
gracestowel/
├── apps/
│   ├── backend/                 # Medusa v2 Backend
│   │   ├── src/
│   │   │   ├── api/             # API Routes (Store, Admin, Webhooks)
│   │   │   │   ├── store/       # Customer-facing endpoints
│   │   │   │   ├── admin/       # Admin-facing endpoints
│   │   │   │   └── webhooks/    # External integrations (Stripe)
│   │   │   ├── modules/         # Custom Medusa Modules
│   │   │   │   └── review/      # Product Reviews Module (DML models)
│   │   │   ├── workflows/       # Business Logic Workflows
│   │   │   │   └── create-order-from-stripe.ts # Key order flow
│   │   │   ├── subscribers/     # Event Listeners
│   │   │   └── jobs/            # Scheduled Tasks
│   │   ├── medusa-config.ts     # Medusa Configuration
│   │   └── package.json         # Backend Dependencies
│   │
│   └── storefront/              # React Router Storefront
│       ├── app/
│       │   ├── components/      # Reusable UI Components
│       │   ├── routes/          # Page Routes (File-system routing)
│       │   ├── root.tsx         # App Entry Point
│       │   └── entry.server.tsx # Server-side Entry
│       ├── public/              # Static Assets
│       ├── workers/             # Cloudflare Worker Scripts
│       ├── wrangler.jsonc       # Cloudflare Configuration
│       └── package.json         # Storefront Dependencies
│
├── docs/                        # Project Documentation
├── .github/                     # CI/CD Workflows
└── package.json                 # Root Dependencies (Workspaces)
```

## Critical Directories

### Backend (`apps/backend`)
- **`src/api`**: Defines the HTTP interface. Custom endpoints for Store and Admin API live here.
- **`src/workflows`**: Contains the core business logic, orchestrated as steps. This is where complex flows like "Create Order" are defined.
- **`src/modules`**: Encapsulates domain logic and data models (e.g., Reviews). This promotes modularity.
- **`src/subscribers`**: Handles async events (e.g., sending emails after order placement).

### Storefront (`apps/storefront`)
- **`app/routes`**: Defines the URL structure of the website. React Router v7 uses file-system routing.
- **`app/components`**: Contains the building blocks of the UI. Organized by function (Layout, Product, Cart, etc.).
- **`workers`**: Contains Cloudflare Worker specific code for edge deployment.

## Integration Points

- **Storefront → Backend**: The storefront communicates with the backend via the REST API (`/store/*`).
- **Stripe → Backend**: Stripe sends webhooks to `apps/backend/src/api/webhooks/stripe`.
- **Backend → Database**: The backend connects to PostgreSQL.
- **Backend → Redis**: The backend uses Redis for event queues (BullMQ).
