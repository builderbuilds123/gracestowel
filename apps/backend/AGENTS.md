---
description: 
globs: apps/backend/*
alwaysApply: false
---

# Backend AGENTS.md — Medusa v2 Patterns

<!-- Inherits from root AGENTS.md. This file contains backend-specific guidance. -->

> **Always consult [Medusa v2 docs](https://docs.medusajs.com/v2) before implementing.**

---

## Quick Reference

```bash
npm run dev           # Start backend (localhost:9000)
npm test              # Run tests
npm run migrate       # Run migrations
npm run seed          # Seed data
```

---

## Directory Structure

```
src/
├── api/              # File-based REST routes
│   ├── store/        # Public endpoints
│   ├── admin/        # Authenticated endpoints
│   └── webhooks/     # External webhooks (Stripe)
├── modules/          # Custom Medusa modules
│   ├── review/       # Product reviews
│   └── resend/       # Email provider
├── workflows/        # Multi-step operations with rollback
├── subscribers/      # Event listeners
├── jobs/             # Scheduled jobs
├── services/         # Custom services
├── lib/              # Utilities (queues, redis)
└── workers/          # BullMQ workers
```

---

## Medusa v2 Patterns

### When to Use What

| Scenario | Use | Not |
|----------|-----|-----|
| Reusable business logic | Service | Route handler |
| Multi-step with rollback | Workflow | try/catch in service |
| React to domain events | Subscriber | Inline calls |
| Periodic tasks | Scheduled Job | setInterval |
| Cross-module data | Links | Direct DB queries |

### Services

```typescript
// src/modules/review/service.ts
import { MedusaService } from "@medusajs/framework/utils"
import { Review } from "./models/review"

class ReviewService extends MedusaService({ Review }) {
  async getAverageRating(productId: string): Promise<number> {
    const reviews = await this.listReviews({ product_id: productId })
    return reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
  }
}
```

**Docs:** https://docs.medusajs.com/v2/learn/fundamentals/modules/service-factory

### Workflows

```typescript
// src/workflows/example.ts
import { createWorkflow, createStep, StepResponse } from "@medusajs/framework/workflows-sdk"

const myStep = createStep(
  "my-step",
  async (input, { container }) => {
    const service = container.resolve("myService")
    const result = await service.doSomething(input)
    return new StepResponse(result, { id: result.id }) // compensation data
  },
  async ({ id }, { container }) => {
    // Rollback logic
    await container.resolve("myService").undo(id)
  }
)

export const myWorkflow = createWorkflow("my-workflow", (input) => {
  return myStep(input)
})
```

**Docs:** https://docs.medusajs.com/v2/learn/fundamentals/workflows

### Workflow Locking (Concurrent Protection)

```typescript
import { acquireLockStep, releaseLockStep } from "@medusajs/core-flows"

export const myAtomicWorkflow = createWorkflow("atomic-op", (input) => {
  acquireLockStep({ key: `lock:${input.id}`, timeout: 30, ttl: 120 })
  const result = doWorkStep(input)
  releaseLockStep({ key: `lock:${input.id}` })
  return result
})
```

### API Routes

```typescript
// src/api/store/reviews/route.ts
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"

const Schema = z.object({
  product_id: z.string(),
  rating: z.number().min(1).max(5),
})

export async function POST(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const data = Schema.parse(req.body)
  const service = req.scope.resolve("reviewModuleService")
  const review = await service.createReviews(data)
  res.status(201).json({ review })
}
```

**Docs:** https://docs.medusajs.com/v2/learn/fundamentals/api-routes

### Subscribers

```typescript
// src/subscribers/order-placed.ts
import type { SubscriberConfig, SubscriberArgs } from "@medusajs/framework"

export default async function handler({ event, container }: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve("logger")
  logger.info(`Order placed: ${event.data.id}`)
  // Trigger async work via workflow or queue
}

export const config: SubscriberConfig = { event: "order.placed" }
```

**Docs:** https://docs.medusajs.com/v2/learn/fundamentals/events-and-subscribers

---

## Project-Specific Patterns

### Email Queue (BullMQ)

```typescript
// Always async - never send email synchronously
const emailQueue = container.resolve("emailQueue")
await emailQueue.add("order-confirmation", { orderId })
```

### Inventory Operations

```typescript
// Use InventoryDecrementService for atomic updates
const inventoryService = container.resolve("inventoryDecrementService")
await inventoryService.decrementWithCompensation(items, locationId)
```

### Payment Architecture

- **Source of truth:** `Order.total` → `PaymentCollection.amount` → Stripe
- **PaymentCollection required** — all orders must have one
- **Currency:** Medusa = dollars, Stripe = cents (auto-converted)

---

## v2 vs v1 (Don't Mix)

| v1 (Don't Use) | v2 (Use This) |
|----------------|---------------|
| `TransactionBaseService` | `MedusaService({ Model })` |
| `@Inject` decorators | `container.resolve()` |
| `eventBusService.emit()` | Subscribers |
| `medusa-config.js` | `medusa-config.ts` |

---

## Key Files

| File | Purpose |
|------|---------|
| `medusa-config.ts` | Module registration |
| `src/lib/email-queue.ts` | BullMQ singleton |
| `src/lib/redis.ts` | Redis utilities |
| `src/services/inventory-decrement-logic.ts` | Atomic inventory |

---

## Docs Links

- [Modules](https://docs.medusajs.com/v2/learn/fundamentals/modules)
- [Workflows](https://docs.medusajs.com/v2/learn/fundamentals/workflows)
- [API Routes](https://docs.medusajs.com/v2/learn/fundamentals/api-routes)
- [Subscribers](https://docs.medusajs.com/v2/learn/fundamentals/events-and-subscribers)
- [Scheduled Jobs](https://docs.medusajs.com/v2/learn/fundamentals/scheduled-jobs)
- [Data Models](https://docs.medusajs.com/v2/learn/fundamentals/modules/data-models)
