# AGENTS.md - AI Agent Guidelines for Grace's Towel

> **Read this file completely before executing any tasks on this codebase.**

This document provides essential context, rules, and patterns for AI agents working on the Grace's Towel e-commerce platform.

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture Summary](#architecture-summary)
3. [Critical Rules](#critical-rules)
4. [Medusa v2 Development](#medusa-v2-development)
5. [Codebase Structure](#codebase-structure)
6. [Development Patterns](#development-patterns)
7. [Environment & Configuration](#environment--configuration)
8. [Testing Requirements](#testing-requirements)
9. [Deployment Pipeline](#deployment-pipeline)
10. [Common Tasks](#common-tasks)
11. [Anti-Patterns](#anti-patterns)

---

## Project Overview

**Grace's Towel** is an e-commerce platform for premium Turkish cotton towels.

| Component | Technology | Location |
|-----------|------------|----------|
| Monorepo | pnpm workspaces + Turbo | Root |
| Backend | Medusa v2 (Node.js) | `apps/backend/` |
| Storefront | React Router v7 + Cloudflare Workers | `apps/storefront/` |
| E2E Tests | Playwright | `apps/e2e/` |
| Database | PostgreSQL 16+ | Railway |
| Cache | Redis 7+ | Railway |
| Edge Runtime | Cloudflare Workers | Cloudflare |

**Node Version Requirement:** `>=24`

---

## Architecture Summary

### Hybrid Data Access Pattern

The storefront uses a **dual data access strategy**:

```
┌─────────────────────────────────────────────────────────────┐
│                      STOREFRONT (Edge)                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   READ Operations ───► Hyperdrive (Direct DB) ───► PostgreSQL│
│   (Products, Search, Categories)                             │
│   ~50-100ms faster                                           │
│                                                              │
│   WRITE Operations ──► Medusa REST API ──► Backend ──► DB   │
│   (Cart, Checkout, Orders, Auth, Reviews)                    │
│   Data integrity guaranteed                                  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Backend Architecture (Medusa v2)

```
src/
├── api/              # File-based routing (REST endpoints)
├── modules/          # Custom Medusa modules (review, resend)
├── workflows/        # Multi-step business logic with rollback
├── subscribers/      # Domain event listeners
├── jobs/             # Scheduled/async background jobs
├── lib/              # Shared utilities (queues, redis)
└── workers/          # BullMQ background workers
```

### Storefront Architecture (React Router v7)

```
app/
├── routes/           # File-based pages (React Router v7)
├── components/       # React UI components
├── context/          # React Context providers
├── hooks/            # Custom React hooks
├── lib/              # Utilities (medusa SDK, db, stripe)
├── services/         # API service calls
└── config/           # Site configuration
```

---

## Critical Rules

### MUST Follow

1. **Edge Compatibility (Storefront)**
   - NEVER use Node.js APIs (`fs`, `path`, `child_process`) in storefront code
   - ALWAYS use Cloudflare-compatible APIs
   - Database access MUST go through Hyperdrive binding

2. **Type Safety**
   - ALL code must be strongly typed TypeScript
   - NEVER use `any` types
   - Define interfaces for all data structures

3. **Error Handling**
   - ALWAYS use try/catch with meaningful error messages
   - NEVER ignore errors in catch blocks
   - Use proper HTTP status codes in API responses

4. **Security**
   - NEVER commit `.env` files or secrets
   - ALWAYS validate and sanitize user inputs
   - Use parameterized queries (no SQL injection)
   - MASK PII (especially email addresses) in logs

5. **Email Processing**
   - ALWAYS use BullMQ for async email sending
   - NEVER block the main thread with synchronous email
   - Emails go through `src/modules/resend/service.ts`

6. **Medusa v2 Patterns (CRITICAL)**
   - **ALWAYS consult official Medusa v2 documentation first**: https://docs.medusajs.com/v2
   - Use Medusa v2 patterns when available - DO NOT invent custom patterns
   - Business logic belongs in **services**, not routes
   - Use **workflows** for multi-step operations with rollback
   - Use **subscribers** for event-driven side effects
   - Don't make cross-module database calls
   - When unsure, search the official docs before implementing

### SHOULD Follow

7. **Prefer async/await** over Promise chains
8. **Keep components focused** and reusable
9. **Use React Router loaders/actions** for server state
10. **Avoid N+1 queries** - use eager loading
11. **Use Redis caching** for frequently accessed data

---

## Medusa v2 Development

> **MANDATORY: Always refer to official Medusa v2 documentation before implementing backend features.**
>
> Documentation: https://docs.medusajs.com/v2

### Documentation-First Approach

When working on backend code, follow this process:

1. **Search official docs first** - Before writing any Medusa-related code
2. **Use existing patterns** - Check if Medusa provides a built-in solution
3. **Follow v2 conventions** - Medusa v2 has specific patterns; don't use v1 approaches
4. **Verify with examples** - Reference the official examples in documentation

### Key Documentation Sections

| Task | Documentation URL |
|------|-------------------|
| API Routes | https://docs.medusajs.com/v2/learn/fundamentals/api-routes |
| Modules | https://docs.medusajs.com/v2/learn/fundamentals/modules |
| Services | https://docs.medusajs.com/v2/learn/fundamentals/modules/service-factory |
| Workflows | https://docs.medusajs.com/v2/learn/fundamentals/workflows |
| Subscribers | https://docs.medusajs.com/v2/learn/fundamentals/events-and-subscribers |
| Scheduled Jobs | https://docs.medusajs.com/v2/learn/fundamentals/scheduled-jobs |
| Data Models | https://docs.medusajs.com/v2/learn/fundamentals/modules/data-models |
| Links | https://docs.medusajs.com/v2/learn/fundamentals/modules/links |
| Loaders | https://docs.medusajs.com/v2/learn/fundamentals/modules/loaders |
| Module Options | https://docs.medusajs.com/v2/learn/fundamentals/modules/module-options |

### Medusa v2 Core Concepts

#### 1. Modules (Encapsulated Business Domains)

```typescript
// src/modules/review/index.ts
import { Module } from "@medusajs/framework/utils"
import ReviewService from "./service"

export const REVIEW_MODULE = "reviewModuleService"

export default Module(REVIEW_MODULE, {
  service: ReviewService,
})
```

**Documentation:** https://docs.medusajs.com/v2/learn/fundamentals/modules

#### 2. Services (Business Logic Layer)

```typescript
// src/modules/review/service.ts
import { MedusaService } from "@medusajs/framework/utils"
import { Review } from "./models/review"

class ReviewService extends MedusaService({ Review }) {
  // Extend with custom methods
  async getAverageRating(productId: string): Promise<number> {
    const reviews = await this.listReviews({ product_id: productId })
    // Calculate average...
  }
}

export default ReviewService
```

**Documentation:** https://docs.medusajs.com/v2/learn/fundamentals/modules/service-factory

#### 3. Workflows (Multi-Step Operations with Rollback)

```typescript
// src/workflows/create-order-from-stripe.ts
import {
  createWorkflow,
  createStep,
  StepResponse,
  WorkflowResponse
} from "@medusajs/framework/workflows-sdk"

const validatePaymentStep = createStep(
  "validate-payment",
  async (input: { paymentIntentId: string }, { container }) => {
    const stripeService = container.resolve("stripeService")
    const payment = await stripeService.retrieve(input.paymentIntentId)

    if (payment.status !== "succeeded") {
      throw new Error("Payment not successful")
    }

    return new StepResponse({ payment })
  }
)

const createOrderStep = createStep(
  "create-order",
  async (input, { container }) => {
    const orderService = container.resolve("orderModuleService")
    const order = await orderService.createOrders(input)
    return new StepResponse({ order }, { orderId: order.id })
  },
  // Compensation function (rollback)
  async ({ orderId }, { container }) => {
    const orderService = container.resolve("orderModuleService")
    await orderService.deleteOrders([orderId])
  }
)

export const createOrderFromStripeWorkflow = createWorkflow(
  "create-order-from-stripe",
  (input) => {
    const { payment } = validatePaymentStep(input)
    const { order } = createOrderStep({ payment })
    return new WorkflowResponse({ order })
  }
)
```

**Documentation:** https://docs.medusajs.com/v2/learn/fundamentals/workflows

#### 4. Subscribers (Event-Driven Side Effects)

```typescript
// src/subscribers/order-placed.ts
import type { SubscriberConfig, SubscriberArgs } from "@medusajs/framework"

export default async function orderPlacedHandler({
  event,
  container,
}: SubscriberArgs<{ id: string }>) {
  const orderId = event.data.id
  const logger = container.resolve("logger")

  logger.info(`Order placed: ${orderId}`)

  // Trigger async workflows
  const { result } = await sendOrderConfirmationWorkflow(container).run({
    input: { orderId },
  })
}

export const config: SubscriberConfig = {
  event: "order.placed",
}
```

**Documentation:** https://docs.medusajs.com/v2/learn/fundamentals/events-and-subscribers

#### 5. API Routes (File-Based Routing)

```typescript
// src/api/store/custom/route.ts
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"

const CreateReviewSchema = z.object({
  product_id: z.string(),
  rating: z.number().min(1).max(5),
  content: z.string().min(10).max(1000),
})

export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  // Validate input
  const validated = CreateReviewSchema.parse(req.body)

  // Resolve service from container
  const reviewService = req.scope.resolve("reviewModuleService")

  // Execute business logic
  const review = await reviewService.createReviews(validated)

  res.status(201).json({ review })
}
```

**Documentation:** https://docs.medusajs.com/v2/learn/fundamentals/api-routes

#### 6. Scheduled Jobs

```typescript
// src/jobs/cleanup-expired-carts.ts
import type { ScheduledJobConfig, ScheduledJobArgs } from "@medusajs/framework"

export default async function cleanupExpiredCarts({
  container,
}: ScheduledJobArgs) {
  const cartService = container.resolve("cartModuleService")
  const logger = container.resolve("logger")

  const expiredCarts = await cartService.listCarts({
    updated_at: { $lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
  })

  await cartService.deleteCarts(expiredCarts.map((c) => c.id))
  logger.info(`Cleaned up ${expiredCarts.length} expired carts`)
}

export const config: ScheduledJobConfig = {
  name: "cleanup-expired-carts",
  schedule: "0 0 * * *", // Daily at midnight
}
```

**Documentation:** https://docs.medusajs.com/v2/learn/fundamentals/scheduled-jobs

### When to Use Each Pattern

| Scenario | Use This | NOT This |
|----------|----------|----------|
| Reusable business logic | Service methods | Route handlers |
| Multi-step with rollback | Workflow | Service with try/catch |
| React to domain events | Subscriber | Inline calls in routes |
| Periodic background tasks | Scheduled Job | setInterval/cron |
| Cross-module data | Links | Direct DB queries |
| Request handling | API Route | Custom Express middleware |

### Common Mistakes to Avoid

```typescript
// BAD: Business logic in route
export async function POST(req, res) {
  const db = req.scope.resolve("db")
  await db.query("INSERT INTO reviews...") // Direct DB access
  await sendEmail(...)  // Sync email
  res.json({ success: true })
}

// GOOD: Delegate to service and workflow
export async function POST(req, res) {
  const reviewService = req.scope.resolve("reviewModuleService")
  const review = await reviewService.createReviews(req.body)

  await createReviewWorkflow(req.scope).run({
    input: { reviewId: review.id },
  })

  res.status(201).json({ review })
}
```

### Medusa v2 vs v1 Differences

> **WARNING:** This project uses Medusa v2. Do NOT use v1 patterns.

| Aspect | v1 (OLD - Don't Use) | v2 (Current - Use This) |
|--------|----------------------|-------------------------|
| Services | `class extends TransactionBaseService` | `MedusaService({ Model })` |
| Modules | N/A | `Module("name", { service })` |
| Workflows | N/A | `createWorkflow()` |
| Events | `eventBusService.emit()` | Built-in with subscribers |
| DI | `constructor(@Inject)` | `container.resolve()` |
| Config | `medusa-config.js` | `medusa-config.ts` |

---

## Codebase Structure

### Root Directory

```
gracestowel/
├── apps/
│   ├── backend/           # Medusa v2 backend service
│   ├── storefront/        # React Router v7 + Cloudflare Workers
│   └── e2e/               # Playwright E2E tests
├── docs/                  # Project documentation
├── .github/workflows/     # CI/CD pipelines
├── docker-compose.yml     # Local development
├── docker-compose.test.yml # E2E test environment
├── turbo.json             # Turbo build configuration
├── pnpm-workspace.yaml    # Workspace definition
└── package.json           # Root scripts
```

### Backend Key Files

| File | Purpose |
|------|---------|
| `medusa-config.ts` | Module registration, Redis, S3, email provider |
| `src/api/` | REST API routes (file-based) |
| `src/modules/review/` | Product review module |
| `src/modules/resend/` | Email notification provider |
| `src/workflows/` | Order processing, email sending |
| `src/lib/email-queue.ts` | BullMQ email queue singleton |
| `src/lib/redis.ts` | Redis connection utilities |

### Storefront Key Files

| File | Purpose |
|------|---------|
| `wrangler.jsonc` | Cloudflare Workers config + Hyperdrive binding |
| `vite.config.ts` | Build configuration |
| `react-router.config.ts` | SSR routing configuration |
| `app/lib/medusa.server.ts` | Server-side Medusa SDK |
| `app/lib/db.server.ts` | Hyperdrive/PostgreSQL access |
| `app/lib/stripe.ts` | Stripe client setup |
| `app/context/` | Cart, Locale, Wishlist providers |

---

## Development Patterns

### API Route Pattern (Backend)

```typescript
// src/api/store/products/[id]/reviews/route.ts
import { MedusaRequest, MedusaResponse } from "@medusajs/framework"

export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  try {
    const { id } = req.params
    const reviewService = req.scope.resolve("reviewService")
    const reviews = await reviewService.list({ product_id: id })
    res.json({ reviews })
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch reviews" })
  }
}

export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  // Validate input, create review, return response
}
```

### Workflow Pattern (Backend)

```typescript
// src/workflows/send-order-confirmation.ts
import { createWorkflow, createStep } from "@medusajs/workflows-sdk"

const sendEmailStep = createStep(
  "send-email",
  async ({ orderId }, { container }) => {
    const emailQueue = container.resolve("emailQueue")
    await emailQueue.add("order-confirmation", { orderId })
    return { success: true }
  },
  async (data, { container }) => {
    // Compensation/rollback logic
  }
)

export const sendOrderConfirmationWorkflow = createWorkflow(
  "send-order-confirmation",
  (input) => {
    const result = sendEmailStep(input)
    return result
  }
)
```

### React Router Loader Pattern (Storefront)

```typescript
// app/routes/products.$handle.tsx
import type { Route } from "./+types/products.$handle"
import { getProductByHandle } from "~/lib/products.server"

export async function loader({ params, context }: Route.LoaderArgs) {
  const product = await getProductByHandle(params.handle, context.cloudflare.env)
  if (!product) {
    throw new Response("Not Found", { status: 404 })
  }
  return { product }
}

export default function ProductPage({ loaderData }: Route.ComponentProps) {
  const { product } = loaderData
  return <ProductDisplay product={product} />
}
```

### Hyperdrive Database Access (Storefront)

```typescript
// app/lib/db.server.ts
import postgres from "postgres"

export function getDb(env: Env) {
  const connectionString = env.HYPERDRIVE?.connectionString
    ?? env.DATABASE_URL
    ?? env.CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE

  return postgres(connectionString, {
    ssl: false, // Hyperdrive handles SSL
  })
}

// Usage in loader
export async function loader({ context }: Route.LoaderArgs) {
  const sql = getDb(context.cloudflare.env)
  const products = await sql`SELECT * FROM product WHERE status = 'published'`
  return { products }
}
```

---

## Environment & Configuration

### Backend Environment Variables

```bash
# Database
DATABASE_URL="postgresql://user:pass@host:5432/medusa"
DATABASE_SSL="true"  # For production

# Redis
REDIS_URL="redis://localhost:6379"

# CORS
STORE_CORS="https://your-storefront.com"
ADMIN_CORS="https://admin.your-domain.com"
AUTH_CORS="https://your-storefront.com"

# Auth
JWT_SECRET="your-jwt-secret"
COOKIE_SECRET="your-cookie-secret"

# S3/R2 Storage
S3_URL="https://your-bucket.r2.cloudflarestorage.com"
S3_BUCKET="your-bucket"
S3_REGION="auto"
S3_ACCESS_KEY_ID="..."
S3_SECRET_ACCESS_KEY="..."

# Email (Resend)
RESEND_API_KEY="re_..."
RESEND_FROM_EMAIL="orders@yourdomain.com"

# Stripe
STRIPE_SECRET_KEY="sk_..."
STRIPE_WEBHOOK_SECRET="whsec_..."

# Analytics
POSTHOG_API_KEY="phc_..."
```

### Storefront Environment Variables

```bash
# .dev.vars (Cloudflare Workers local dev)
MEDUSA_BACKEND_URL="http://localhost:9000"
MEDUSA_PUBLISHABLE_KEY="pk_..."
STRIPE_SECRET_KEY="sk_..."
DATABASE_URL="postgresql://..."  # For local Hyperdrive simulation

# Build-time (in wrangler.jsonc or CI)
VITE_POSTHOG_API_KEY="phc_..."
```

### Wrangler Configuration

```jsonc
// apps/storefront/wrangler.jsonc
{
  "name": "gracestowelstorefront",
  "compatibility_date": "2025-04-04",
  "compatibility_flags": ["nodejs_compat"],
  "hyperdrive": [
    {
      "binding": "HYPERDRIVE",
      "id": "your-hyperdrive-id"
    }
  ],
  "observability": {
    "enabled": true,
    "traces_enabled": true,
    "logs": { "enabled": true }
  }
}
```

---

## Testing Requirements

### Test Types & Locations

| Type | Framework | Location | Command |
|------|-----------|----------|---------|
| Backend Unit | Jest | `apps/backend/src/**/*.spec.ts` | `npm run test:unit` |
| Backend Integration | Jest | `apps/backend/integration-tests/` | `npm run test:integration` |
| Storefront Unit | Vitest | `apps/storefront/**/*.test.tsx` | `npm run test` |
| E2E | Playwright | `apps/e2e/tests/` | `npm run test:e2e` |

### Test Requirements for New Code

1. **All new features MUST have tests**
2. **Follow AAA pattern** (Arrange, Act, Assert)
3. **Mock external services** (Stripe, Resend, etc.)
4. **Test edge cases** and error conditions
5. **Maintain >80% coverage** on new code

### Running Tests

```bash
# All tests
pnpm test

# Backend only
cd apps/backend && npm test

# Storefront only
cd apps/storefront && npm test

# E2E (requires Docker)
npm run test:e2e:ci

# Type checking
pnpm typecheck
```

---

## Deployment Pipeline

### Branches

| Branch | Environment | Auto-Deploy |
|--------|-------------|-------------|
| `main` | Production | Yes |
| `staging` | Staging | Yes |
| Feature branches | - | No (PR only) |

### CI/CD Stages

```
┌──────────────────────────────────────────────────────────────┐
│ 1. VALIDATE                                                   │
│    - Lint (ESLint)                                           │
│    - Type Check (TypeScript)                                 │
│    - Security Scan (Gitleaks, Trivy)                         │
│    - Lockfile Verification                                   │
├──────────────────────────────────────────────────────────────┤
│ 2. UNIT TESTS (Parallel)                                     │
│    - Backend Unit Tests (Jest)                               │
│    - Storefront Tests (Vitest)                               │
│    - Coverage Upload (Codecov)                               │
├──────────────────────────────────────────────────────────────┤
│ 3. E2E TESTS                                                 │
│    - Docker Compose (postgres, redis, backend, storefront)   │
│    - Playwright (Chromium)                                   │
│    - Artifact Upload (HTML Report)                           │
├──────────────────────────────────────────────────────────────┤
│ 4. DEPLOY (on main/staging)                                  │
│    - Backend → Railway                                       │
│    - Storefront → Cloudflare Workers                         │
│    - Database Migrations                                     │
└──────────────────────────────────────────────────────────────┘
```

### Manual Deployment Commands

```bash
# Deploy storefront to Cloudflare
pnpm run deploy:storefront

# Deploy backend to Railway
pnpm run deploy:api

# Run database migrations
cd apps/backend && npm run migrate
```

---

## Common Tasks

### Adding a New API Endpoint

> **First, read the official documentation:** https://docs.medusajs.com/v2/learn/fundamentals/api-routes

1. **Consult docs** - Check if Medusa already provides the endpoint you need
2. Create route file: `apps/backend/src/api/{scope}/{path}/route.ts`
   - `store/` for customer-facing (public)
   - `admin/` for admin-facing (authenticated)
3. Export HTTP method handlers (`GET`, `POST`, `PUT`, `DELETE`)
4. Add input validation with Zod schemas
5. Delegate business logic to services (NOT in route handlers)
6. Add tests in `integration-tests/http/`
7. Update API documentation in `docs/BACKEND_API.md`

### Adding a New Storefront Page

1. Create route file: `apps/storefront/app/routes/{path}.tsx`
2. Export `loader` for data fetching
3. Export `action` for form submissions (if needed)
4. Export default component
5. Add tests for loader/component

### Adding a New Medusa Module

> **First, read the official documentation:** https://docs.medusajs.com/v2/learn/fundamentals/modules

1. **Consult docs** - Check if Medusa provides a built-in module for your use case
2. Create directory: `apps/backend/src/modules/{name}/`
3. Add `index.ts` (module registration using `Module()`)
4. Add `service.ts` (extend `MedusaService()` for CRUD)
5. Add `models/` (data models using `model.define()`)
6. Register in `medusa-config.ts`
7. Generate and run migrations: `npm run build && npm run migrate`
8. Add tests in `__tests__/` directory

### Adding Background Jobs

> **First, read the official documentation:** https://docs.medusajs.com/v2/learn/fundamentals/scheduled-jobs

**For Scheduled/Cron Jobs (Medusa Pattern):**
1. Create job in `apps/backend/src/jobs/{name}.ts`
2. Export default async function and `config: ScheduledJobConfig`
3. Use cron expression in `config.schedule`

**For Queue-Based Jobs (BullMQ - Custom):**
1. Create queue in `apps/backend/src/lib/`
2. Add worker in `apps/backend/src/workers/`
3. Configure retry/backoff policies
4. Add monitoring via Redis

**Use Medusa's scheduled jobs when possible** - only use BullMQ for complex queue scenarios (email, webhooks).

---

## Anti-Patterns

### NEVER Do These

| Anti-Pattern | Why It's Bad | Do This Instead |
|--------------|--------------|-----------------|
| Skip Medusa docs | Reinventing the wheel | Consult https://docs.medusajs.com/v2 first |
| Use Medusa v1 patterns | Incompatible with v2 | Use v2 patterns (see docs) |
| Invent custom patterns | Breaks conventions | Use Medusa's built-in patterns |
| Use `any` type | Defeats type safety | Define proper interfaces |
| Commit `.env` files | Security risk | Use `.env.template` |
| Ignore catch errors | Silent failures | Log and handle properly |
| Sync email sending | Blocks requests | Use BullMQ async queue |
| Direct DB in storefront writes | Data integrity issues | Use Medusa REST API |
| Node.js APIs in storefront | Edge incompatible | Use Web APIs |
| Cross-module DB calls | Tight coupling | Use module services |
| Log raw PII | Privacy violation | Mask sensitive data |
| Skip input validation | Security risk | Validate with Zod |
| Over-engineer | Complexity debt | Keep it simple |

### Code Smell Examples

```typescript
// BAD: Using any
const data: any = await fetchData()

// GOOD: Proper typing
interface ProductData { id: string; name: string }
const data: ProductData = await fetchData()

// BAD: Ignoring errors
try { doSomething() } catch (e) { }

// GOOD: Proper error handling
try {
  await doSomething()
} catch (error) {
  logger.error("Failed to do something", { error })
  throw new Error("Operation failed")
}

// BAD: Sync email in request handler
const emailService = req.scope.resolve("emailService")
await emailService.send(email) // Blocks response

// GOOD: Async via queue
const emailQueue = req.scope.resolve("emailQueue")
await emailQueue.add("send-email", { email })
```

---

## Quick Reference

### Key Commands

```bash
# Development
pnpm dev                    # Start all services
pnpm dev:api               # Backend only
pnpm dev:storefront        # Storefront only

# Testing
pnpm test                  # All tests
pnpm typecheck             # Type checking
pnpm lint                  # Linting

# Database
cd apps/backend
npm run migrate            # Run migrations
npm run seed               # Seed data

# Deployment
pnpm deploy:storefront     # Deploy to Cloudflare
pnpm deploy:api            # Deploy to Railway
```

### Key URLs

| Environment | Backend | Storefront |
|-------------|---------|------------|
| Local | `http://localhost:9000` | `https://localhost:5173` |
| Staging | Railway staging | `gracestowelstorefront-staging.workers.dev` |
| Production | Railway prod | `gracestowelstorefront.workers.dev` |

### Key Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@medusajs/medusa` | 2.12.0 | Commerce framework |
| `react-router` | 7.10.1 | Frontend routing |
| `react` | 19.1.1 | UI library |
| `stripe` | 19.1.0 | Payments |
| `bullmq` | 5.65.0 | Job queues |
| `ioredis` | 5.8.2 | Redis client |
| `zod` | 4.1.13 | Validation |

---

## Additional Resources

### Official Documentation (ALWAYS Check First)

| Resource | URL |
|----------|-----|
| **Medusa v2 Docs** | https://docs.medusajs.com/v2 |
| **Medusa v2 API Reference** | https://docs.medusajs.com/v2/api |
| **React Router v7 Docs** | https://reactrouter.com/dev/guides |
| **Cloudflare Workers Docs** | https://developers.cloudflare.com/workers/ |
| **Stripe API Reference** | https://docs.stripe.com/api |

### Project Documentation

- **Architecture Details:** `docs/ARCHITECTURE.md`
- **API Documentation:** `docs/BACKEND_API.md`
- **Testing Strategy:** `docs/TESTING_STRATEGY.md`
- **Environment Setup:** `docs/ENVIRONMENT_SETUP.md`
- **Railway Infrastructure:** `docs/RAILWAY_INFRASTRUCTURE.md`
- **Agent Context Rules:** `docs/project_context.md`

---

*Last updated: December 2024*
