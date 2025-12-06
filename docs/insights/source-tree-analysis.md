# Source Tree Analysis

## Project Structure
`gracestowel` is a monorepo containing the storefront and backend applications.

```
gracestowel/
├── apps/
│   ├── backend/             # Medusa v2 Backend (Node.js)
│   │   ├── medusa-config.ts # Core Configuration
│   │   ├── src/
│   │   │   ├── api/         # Custom API Endpoints (admin/store)
│   │   │   ├── modules/     # Custom Medusa Modules (review, resend)
│   │   │   ├── scripts/     # Utility scripts (seed, test-storage)
│   │   │   └── subscribers/ # Event Subscribers
│   │   └── package.json     # Backend dependencies
│   │
│   └── storefront/          # React Router v7 Storefront
│       ├── app/
│       │   ├── routes/      # File-system routing (PDP, Cart, Checkout)
│       │   ├── components/  # Reusable UI Components
│       │   ├── modules/     # Feature-based modules (Account, Cart, etc.)
│       │   ├── lib/         # Utilities and helpers
│       │   └── styles/      # Tailwind CSS
│       ├── public/          # Static assets
│       └── package.json     # Storefront dependencies
│
├── docs/                    # Project Documentation
│   ├── architecture/        # System design & models
│   ├── product/             # Epics & PRDs
│   ├── guides/              # Developer guides
│   ├── reference/           # API & Components
│   ├── insights/            # Analysis reports (this file)
│   └── sprint/              # Sprint artifacts
│
├── .bmad/                   # Agent & Workflow configs
└── package.json             # Root monorepo config
```

## Critical Directories

### Backend (`apps/backend`)
- **`src/api`**: Contains custom endpoints. This is the integration layer for the storefront to access specific business logic not covered by standard Medusa APIs.
- **`src/modules`**: Contains isolated business logic modules (e.g., `resend` for emails). This follows Medusa's modular architecture.

### Storefront (`apps/storefront`)
- **`app/routes`**: The core of the frontend application. Defines the mapping between URLs and React components.
- **`app/modules`**: Encapsulates feature-specific logic and components, promoting modularity within the frontend.

## Entry Points
- **Backend**: `medusa start` (via `apps/backend/package.json`)
- **Storefront**: `react-router dev` (via `apps/storefront/package.json`)
