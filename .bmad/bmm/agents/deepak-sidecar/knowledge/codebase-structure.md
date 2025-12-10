# Codebase Structure

<!--
INSTRUCTIONS FOR USER:
Populate this file with your codebase's structure and organization.
Deepak will use this to trace errors across module boundaries and understand data flow.

Suggested sections:
-->

## Repository Structure

<!-- High-level folder structure -->
<!-- Example:
```
gracestowel/
├── apps/
│   ├── storefront/     # Next.js/Remix frontend (Cloudflare Workers)
│   ├── backend/        # Medusa.js backend (Railway)
│   └── e2e/            # Playwright E2E tests
├── packages/           # Shared packages (if any)
├── docs/               # Documentation
└── .bmad/              # BMAD configuration
```
-->

## Module Boundaries

<!-- Define clear boundaries between modules -->
<!-- Example:
### apps/storefront
- **Responsibility:** User-facing e-commerce UI
- **Communicates with:** Backend API via REST/GraphQL
- **Does NOT:** Direct database access

### apps/backend
- **Responsibility:** Business logic, API, database
- **Communicates with:** PostgreSQL, Redis, external payment providers
- **Does NOT:** Render UI
-->

## API Contracts

<!-- Document key APIs between modules -->
<!-- Example:
### Store API (apps/backend → apps/storefront)
- Base URL: `/store`
- Auth: Publishable key in header
- Key endpoints:
  - `GET /store/products` - List products
  - `POST /store/carts` - Create cart
  - `POST /store/orders` - Place order
-->

## Data Flow Patterns

<!-- How does data flow for key operations? -->
<!-- Example:
### Checkout Flow
1. User clicks "Checkout" in storefront
2. Storefront calls `POST /store/carts/{id}/complete`
3. Backend validates cart, creates order
4. Backend calls Stripe for payment
5. Backend updates order status
6. Response sent to storefront
7. Storefront redirects to confirmation page
-->

## State Management

<!-- Where is state managed? -->
<!-- Example:
### Frontend State
- **Server State:** React Query / SWR for API data
- **Client State:** React Context for cart, auth
- **URL State:** Search params for filters

### Backend State
- **Persistent:** PostgreSQL
- **Cache:** Redis
- **Session:** JWT tokens
-->

## Error Boundaries

<!-- Where are errors caught and handled? -->
<!-- Example:
### Frontend
- React Error Boundaries for component crashes
- Try/catch in API calls
- Toast notifications for user feedback

### Backend
- Express error middleware
- Medusa error handlers
- Structured logging
-->

## Key Files to Know

<!-- Important files that often need investigation -->
<!-- Example:
- `apps/storefront/src/app/layout.tsx` - Root layout, providers
- `apps/backend/src/api/index.ts` - API routes registration
- `apps/backend/medusa-config.ts` - Medusa configuration
- `.github/workflows/` - CI/CD pipelines
-->
