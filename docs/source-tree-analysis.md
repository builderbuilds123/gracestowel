# Source Tree Analysis

## Directory Structure

```
gracestowel/
├── apps/
│   ├── backend/                # Medusa v2 Backend (Part: Backend)
│   │   ├── src/
│   │   │   ├── api/            # Custom API routes
│   │   │   ├── modules/        # Custom Medusa modules (e.g., Review)
│   │   │   ├── workflows/      # Business logic workflows
│   │   │   └── scripts/        # Utility scripts (seeding)
│   │   ├── medusa-config.ts    # Medusa configuration
│   │   ├── Dockerfile          # Production build definition
│   │   └── package.json        # Backend dependencies
│   │
│   └── storefront/             # React Router v7 Storefront (Part: Storefront)
│       ├── app/
│       │   ├── components/     # React UI components
│       │   ├── routes/         # Application routes & API endpoints
│       │   ├── context/        # React Contexts (Cart, Locale)
│       │   ├── lib/            # Utilities (Stripe, Medusa client)
│       │   └── root.tsx        # App entry point
│       ├── workers/            # Cloudflare Worker entry point
│       ├── wrangler.toml       # Cloudflare configuration
│       └── package.json        # Storefront dependencies
│
├── docs/                       # Project Documentation
│   ├── architecture/           # Architecture decisions and diagrams
│   ├── prd/                    # Product Requirements Documents
│   └── testing/                # Testing strategies and guides
│
├── scripts/                    # Devops and setup scripts
├── railway.toml                # Railway deployment configuration
└── package.json                # Root workspace configuration
```

## Critical Folders

### Backend (`apps/backend`)
- **`src/modules/`**: Contains custom domain logic extending Medusa's core capabilities.
- **`src/workflows/`**: Defines complex business processes (e.g., order completion) using Medusa's workflow engine.
- **`medusa-config.ts`**: Central configuration for database, redis, and plugins.

### Storefront (`apps/storefront`)
- **`app/routes/`**: Defines the URL structure and page logic using React Router's file-system routing.
- **`app/components/`**: Reusable UI elements implementing the design system.
- **`workers/app.ts`**: The entry point for the Cloudflare Worker, handling request dispatching.

## Integration Points

- **Storefront → Backend**: The storefront communicates with the backend via REST API calls defined in `app/lib/medusa.ts` and `app/hooks/useMedusaProducts.ts`.
- **Backend → Database**: Connects to PostgreSQL defined in `medusa-config.ts`.
- **Backend → Redis**: Connects to Redis for event publishing and caching.
