---
project_name: gracestowel
date: '2026-01-04'
audience: ai-agents
status: active
---

# Project Context for AI Agents

> **This file supplements [`AGENTS.md`](../AGENTS.md)**. Read both before working on this codebase.
> 
> - `AGENTS.md`: Comprehensive patterns, code examples, and how-to guides
> - `project_context.md` (this file): High-level gotchas and recent architectural decisions

---

## Quick Start

```bash
# Development
pnpm dev              # All services
pnpm dev:api          # Backend only (localhost:9000)
pnpm dev:storefront   # Storefront only (localhost:5173)

# Testing
pnpm test             # All tests
pnpm typecheck        # Type checking

# Database
cd apps/backend && npm run migrate
```

---

## Project-Specific Gotchas

### 1. Storefront Runs on Cloudflare Workers (Edge)
- **No Node.js APIs** — `fs`, `path`, `child_process` will fail
- **Database via Hyperdrive only** — use `env.HYPERDRIVE.connectionString`
- **Reads from DB, Writes via Medusa API** — never write directly to DB from storefront

### 2. Medusa v2 Only (Not v1)
- Use `MedusaService({ Model })` not `TransactionBaseService`
- Use `container.resolve()` not `@Inject` decorators
- Use `createWorkflow()` for multi-step operations
- **Always check [Medusa v2 docs](https://docs.medusajs.com/v2) first**

### 3. Email is Always Async
- Use BullMQ queue via `src/lib/email-queue.ts`
- Never send emails synchronously in request handlers
- Mask email addresses in logs: `****@domain.com`

### 4. Payment Architecture (Recent Change)
- **Source of truth**: `Order.total` → `PaymentCollection.amount` → Stripe
- **PaymentCollection required** — all orders must have one
- **No metadata fallback** — `metadata.payment_status` is deprecated
- **Currency units**: Medusa = dollars, Stripe = cents (conversion automatic)

### 5. Inventory Patterns (Recent Change)
- Use `InventoryDecrementService` for atomic updates
- Use `updateInventoryLevelsStep` from Medusa (has compensation)
- **No raw SQL** for inventory operations
- **No arbitrary location fallback** — fail loudly if location unmapped
- Check `allow_backorder` flag before permitting negative stock

### 6. Workflow Locking (Recent Change)
- Use `acquireLockStep`/`releaseLockStep` from `@medusajs/core-flows`
- Lock key = PaymentIntent ID (prevents duplicate webhook processing)
- Config: 30s timeout, 120s TTL

---

## CLI Commands (Preferred)

Use CLI commands when available. MCP servers are a secondary option.

| Task | Command |
|------|---------|
| Deploy storefront | `pnpm deploy:storefront` |
| Deploy backend | `pnpm deploy:api` |
| Run migrations | `cd apps/backend && npm run migrate` |
| Seed database | `cd apps/backend && npm run seed` |
| View logs | `railway logs` (requires Railway CLI) |
| Cloudflare logs | `wrangler tail` (requires Wrangler CLI) |

---

## Key Documentation Links

| Topic | Location |
|-------|----------|
| Full agent guidelines | [`AGENTS.md`](../AGENTS.md) |
| Backend architecture | [`docs/architecture/backend.md`](architecture/backend.md) |
| Storefront architecture | [`docs/architecture/storefront.md`](architecture/storefront.md) |
| API reference | [`docs/reference/backend-api.md`](reference/backend-api.md) |
| Testing strategy | [`docs/guides/testing-strategy.md`](guides/testing-strategy.md) |

---

## Recent Architectural Decisions

These patterns were established in recent sprints. They may not be obvious from the codebase alone.

1. **INV-01**: Workflow-level locking for concurrent inventory operations
2. **INV-02**: Backorder support with `allow_backorder` flag and `inventory.backordered` event
3. **PAY-01**: PaymentCollection as source of truth (no metadata fallback)
4. **ORD-02**: Incremental authorization for order modifications during grace period

See `docs/sprint/sprint-artifacts/` for detailed implementation notes.

---

*Last updated: 2026-01-04*
