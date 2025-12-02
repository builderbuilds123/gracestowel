---
stepsCompleted: [1, 2, 3]
inputDocuments:
  - docs/posthog-analytics-integration-prd.md
  - docs/cookie-policy-prd.md
  - docs/prd/transparent-impact.md
  - docs/prd/2025-11-25_ecommerce_v1_prd.md
  - docs/epics.md
  - docs/price-transparancy-epics.md
  - docs/cookie-policy-epics.md
  - docs/ux-design-specification.md
  - docs/project-overview.md
  - docs/development-guide.md
  - docs/index.md
  - repomix-output.xml (comprehensive codebase analysis)
workflowType: 'architecture'
lastStep: 3
project_name: 'gracestowel'
user_name: 'Big Dick'
date: '2025-12-01'
hasProjectContext: false
systemContext: 'Complete repository analysis completed via Explore agent - full understanding of Medusa v2 backend, React Router v7 storefront, modules, workflows, deployment infrastructure'
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Three Feature Integration Scope:**

This architecture addresses three distinct features being integrated into the existing gracestowel headless commerce platform:

1. **PostHog Analytics Integration (4 Epics, 16+ Stories)**
   - Foundational event tracking (client-side SDK initialization, key events)
   - Comprehensive data capture with user identification (server-side tracking, logged-in user association)
   - Admin analytics dashboarding (metrics visualization, filtering/segmentation, dashboard access)
   - Production monitoring & observability (error tracking, Web Vitals, API latency, health checks)

2. **Cookie Policy Popup (1 Epic, 3 Stories)**
   - Legal compliance notification (first-visit display, humorous tone)
   - Non-intrusive UI design (dismissible, no content blocking)
   - Persistent state management (localStorage-based)

3. **Transparent Pricing & Impact (6 Epics, Complex)**
   - Core pricing engine with admin configuration (product cost data modeling)
   - Dynamic cost integration service (Cloudflare/Railway, Meta/Google/TikTok APIs, payment fees)
   - Real-time price calculation with session locking
   - Storefront transparency experience (interactive breakdown UI, cost tooltips, impact visualization)
   - Charity integration (Tree Nation, CanadaHelps APIs with fail-open)
   - Price lock guarantee system (monitoring, automated credits, notifications)

**Functional Requirements Summary:**

- **PostHog Integration (7 FRs):** Event capture, user identification, client/server-side tracking, dashboard access, filtering
- **Cookie Policy (6 FRs):** First-visit display, informative content, non-intrusive design, dismissal, persistence, legal compliance
- **Transparent Pricing (14 FRs):** Cost configuration, dynamic fetching, price calculation, session locking, breakdown UI, charity triggers, price monitoring

**Non-Functional Requirements:**

- **Performance:**
  - Analytics data available within 2 hours (PostHog)
  - No noticeable degradation from integrations
  - PDP load time impact <100ms (Transparent Pricing)
  - Price calculation latency <50ms
  - Cookie popup fast load, no page delay

- **Security:**
  - User data pseudonymization/anonymization (PostHog)
  - HTTPS for all external data transmission
  - Role-based access to sensitive analytics
  - No sensitive data storage in cookie popup

- **Scalability:**
  - PostHog integration handles traffic increases seamlessly
  - Cookie popup: browser-compatible, responsive
  - Transparent Pricing: API caching (15-60 min TTL) to prevent rate limits

- **Reliability:**
  - Charity API fail-open (don't block checkout)
  - Price stability (dampened updates, session locking)
  - Graceful PostHog degradation (no API key = no crash)

- **Accessibility:**
  - Cookie popup: keyboard navigation, screen reader support, color contrast (WCAG compliance)

**Scale & Complexity:**

- **Primary domain:** Full-Stack E-commerce (Headless Architecture)
- **Complexity level:** High
- **Estimated architectural components:**
  - 3 new backend modules/services (Analytics Events, Pricing Engine, Charity Integration)
  - 5+ new API endpoints (reviews, impact data, price calculation)
  - 8+ new storefront components (CookieConsent, PriceBreakdown, ImpactBadge, etc.)
  - 4+ external API integrations (PostHog, Tree Nation, CanadaHelps, Infrastructure/Marketing APIs)
  - 2+ background jobs (price monitoring cron, async donation processing)

### Technical Constraints & Dependencies

**Existing System Constraints:**

- **Backend:** Medusa v2.12.0 on Railway (PostgreSQL 16, Redis 7, Node.js 24)
- **Storefront:** React Router v7 on Cloudflare Workers (edge runtime, serverless constraints)
- **Current Integrations:** Stripe (payments), Resend (emails), PostHog (partial setup)
- **Module Pattern:** Custom Medusa modules (Review module exists as reference pattern)
- **Workflow System:** Event-driven workflows for business logic
- **State Management:** React Context API (Cart, Customer, Wishlist, Locale)

**Dependencies:**

- PostHog SDKs: `posthog-node@5.14.1` (backend), `posthog-js` (storefront) - already installed
- External APIs: Cloudflare API, Railway API, Meta Marketing API, Google Ads API, TikTok Ads API, Tree Nation API, CanadaHelps API
- Redis: Required for caching external API responses
- TypeScript: Full type safety across stack (v5.6.2 backend, v5.9.2 storefront)

**Deployment Constraints:**

- Edge deployment limits: No long-running processes on Cloudflare Workers (use async jobs on backend)
- Serverless considerations: PostHog immediate flushing required for Railway
- CORS configuration: Frontend on Cloudflare, backend on Railway (already configured)

### Cross-Cutting Concerns Identified

**1. Privacy & Consent Management**
- Cookie policy must gate analytics initialization
- User consent state affects PostHog tracking
- GDPR/compliance considerations for all tracking
- Decision: Cookie consent check before any analytics capture

**2. Caching Strategy**
- External API data must be cached to prevent rate limits and latency
- TTL requirements: 15 min (ad spend), 60 min (infrastructure costs)
- Storage: Redis cache layer (already available)
- Cache invalidation: Time-based, no manual invalidation needed

**3. Error Handling & Graceful Degradation**
- PostHog failures: Continue operation, log errors
- Charity API failures: Complete checkout, retry async
- External cost API failures: Fall back to static estimates or previous values
- Pattern: Fail-open for non-critical integrations

**4. Performance Monitoring**
- Web Vitals tracking (LCP, FID, CLS) - PostHog integration
- API latency monitoring - custom events
- Error rate tracking - exception capture
- Health check monitoring - automated pings

**5. Type Safety & Code Consistency**
- TypeScript strict mode across frontend/backend
- Shared type definitions for API contracts
- Module-based architecture for separation of concerns
- Workflow pattern for complex business logic

**6. Session & State Management**
- Price locking requires session persistence
- Cart state coordination with locked prices
- User authentication state for analytics identification
- localStorage + backend coordination pattern

**7. External Integration Resilience**
- Multiple third-party APIs (infrastructure, marketing, charity)
- Circuit breaker pattern consideration
- Retry logic for transient failures
- Monitoring integration health

## Base Architecture Foundation

### Existing System Overview

This project is a **brownfield integration** - we are extending an existing, production-ready headless commerce platform rather than starting from scratch. The base architecture is already established and operational.

**Architecture Pattern:** Headless Commerce (Decoupled Frontend/Backend)

### Backend Architecture (Medusa v2)

**Core Framework:**
- **Platform:** Medusa v2.12.0 (headless commerce framework)
- **Runtime:** Node.js 24+
- **Language:** TypeScript v5.6.2 (strict mode)
- **Deployment:** Railway (containerized)

**Data Layer:**
- **Primary Database:** PostgreSQL 16 with SSL
- **Cache:** Redis 7 (BullMQ for job queues)
- **ORM:** Medusa internal ORM with TypeScript models

**Architectural Patterns:**
- **Module System:** Custom business logic in Medusa modules (example: Review module)
- **Workflow System:** Event-driven workflows for complex operations
- **Event Subscribers:** Async handlers for domain events (order-placed, customer-created, etc.)
- **API Routes:** File-based routing (`/api/[store|admin|webhooks]/{resource}/route.ts`)

**Existing Custom Modules:**
- `Review Module`: Product reviews with verified purchase tracking, auto-approval logic
- `Resend Module`: Email notification provider with React Email templating

**Current Integrations:**
- Stripe (payment processing with webhooks)
- Resend (transactional emails)
- PostHog (server-side tracking - partially implemented)

### Storefront Architecture (React Router v7)

**Core Framework:**
- **Platform:** React Router v7.9.2 with SSR
- **React Version:** v19.1.1
- **Language:** TypeScript v5.9.2
- **Build Tool:** Vite v7.1.7
- **Deployment:** Cloudflare Workers (edge deployment)

**Styling:**
- **Framework:** TailwindCSS v4.1.13
- **Approach:** Utility-first with custom design tokens
- **Theme:** Earthy palette (Alegreya serif, Sigmar One display fonts)

**State Management:**
- **Pattern:** React Context API
- **Contexts:** CartContext, CustomerContext, LocaleContext, WishlistContext
- **Persistence:** localStorage for cart/wishlist, backend for customer auth

**Component Architecture:**
- Feature-based organization (`app/components/`)
- Reusable UI components (ProductCard, CheckoutForm, ReviewSection)
- Route-based code splitting (React Router file-based routing)

**API Client Pattern:**
- Server-side: `createMedusaClient()` in loaders (type-safe)
- Client-side: Fetch via `/api/$` proxy route
- Type definitions: Shared types in `app/lib/medusa.ts`

**Current Integrations:**
- PostHog (client-side tracking - partially implemented with Web Vitals)
- Stripe Elements (checkout payment form)

### Infrastructure & Deployment

**Backend (Railway):**
- PostgreSQL 16 service (managed)
- Redis 7 service (managed)
- Docker multi-stage build
- Auto-migration on deployment
- Environment variables via Railway dashboard

**Storefront (Cloudflare Workers):**
- Edge SSR globally distributed
- Hyperdrive for database access from edge
- Wrangler configuration for staging/production environments
- Node.js compatibility mode enabled

**Local Development:**
- Docker Compose for full stack (PostgreSQL, Redis, backend, storefront)
- Hot reload on both apps
- Shared network: `gracestowel-network`

### Testing Infrastructure

**Backend Testing:**
- **Framework:** Jest with SWC transpiler
- **Types:** Unit tests (`*.unit.spec.ts`), Integration tests (`integration-tests/http/`)
- **Database:** Separate test database with Docker Compose

**Storefront Testing:**
- **Framework:** Vitest v3.2.4
- **Libraries:** @testing-library/react, happy-dom
- **Mocking:** MSW (Mock Service Worker)

**E2E Testing:**
- **Framework:** Playwright v1.49.0
- **Location:** Separate `apps/e2e` workspace
- **Execution:** Docker-based for CI consistency

### Architectural Patterns & Conventions

**Backend Patterns:**
- Custom modules for domain logic (`src/modules/{module-name}/`)
- Workflows for complex operations (`src/workflows/`)
- Event subscribers for async operations (`src/subscribers/`)
- Migration-based schema evolution
- Fail-open for non-critical integrations

**Storefront Patterns:**
- Server-side rendering with streaming
- Route-based code splitting
- Context providers for global state
- Type-safe API clients
- Error boundaries with PostHog capture

**Code Quality:**
- TypeScript strict mode across stack
- ESLint + Prettier configured
- Git hooks for pre-commit validation
- Type-safe API contracts

### Integration Points for New Features

**PostHog Analytics Enhancement:**
- Backend: `src/utils/posthog.ts` already configured with immediate flushing
- Storefront: `app/utils/posthog.ts` with autocapture enabled
- Pattern: Use existing subscribers for backend events, enhance storefront tracking

**Cookie Policy Implementation:**
- Location: `app/components/CookieConsent.tsx` (new)
- Insertion: `root.tsx` before provider stack
- Integration: Gate PostHog initialization based on consent state

**Transparent Pricing Module:**
- Pattern: Follow Review module architecture
- Location: `apps/backend/src/modules/pricing/` (new)
- API: New routes in `apps/backend/src/api/store/pricing/` (new)
- Storefront: New components in `app/components/` (PriceBreakdown, ImpactBadge)
- Caching: Leverage existing Redis layer

### Key Architectural Constraints

**Must Preserve:**
1. Existing module pattern (don't break Review module)
2. Workflow-based business logic approach
3. Type safety across frontend/backend
4. Edge deployment compatibility (no long-running processes on Workers)
5. Existing CORS configuration (Railway ↔ Cloudflare)

**Must Consider:**
1. Serverless constraints on Cloudflare Workers
2. Redis caching for external API calls
3. Graceful degradation for non-critical features
4. Session management for price locking
5. Event-driven architecture for async operations

---

**This base architecture provides the foundation for our three feature integrations. All new architectural decisions will build upon these established patterns.**
