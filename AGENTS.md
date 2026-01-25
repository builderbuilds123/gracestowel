# AGENTS.md - AI Agent Guidelines for Grace's Towel

<!-- Last reviewed: 2026-01-04 | Rule count: ~25 -->

## Quick Start

```bash
pnpm dev              # Start all services
pnpm test             # Run all tests
pnpm typecheck        # Type check
```

## Superpowers System

<EXTREMELY_IMPORTANT>
You have superpowers. Superpowers teach you new skills and capabilities. RIGHT NOW run: `.agent/superpowers/.codex/superpowers-codex bootstrap` and follow the instructions it returns.
</EXTREMELY_IMPORTANT>

**Key Resources:**
- Medusa v2 Docs: https://docs.medusajs.com/v2
- Project Gotchas: [`docs/project_context.md`](docs/project_context.md)

---

## Project Overview

**Grace's Towel** — E-commerce platform for premium Turkish cotton towels.

| Component | Technology | Location |
|-----------|------------|----------|
| Backend | Medusa v2 (Node.js ≥24) | `apps/backend/` |
| Storefront | React Router v7 + Cloudflare Workers | `apps/storefront/` |
| E2E Tests | Playwright | `apps/e2e/` |
| Database | PostgreSQL 16+ (Railway) | — |
| Cache | Redis 7+ (Railway) | — |

**Monorepo:** pnpm workspaces + Turborepo

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    STOREFRONT (Edge)                         │
├─────────────────────────────────────────────────────────────┤
│  READ  ───► Medusa REST API ───► Backend ───► DB            │
│  WRITE ───► Medusa REST API ───► Backend ───► DB            │
└─────────────────────────────────────────────────────────────┘
```

See nested AGENTS.md files for app-specific patterns:
- [`apps/backend/AGENTS.md`](apps/backend/AGENTS.md) — Medusa v2 patterns
- [`apps/storefront/AGENTS.md`](apps/storefront/AGENTS.md) — Edge/React Router patterns

---

## Critical Rules (Cross-Cutting)

### MUST Follow

1. **Consult Medusa v2 docs first** — https://docs.medusajs.com/v2
2. **TypeScript strict mode** — No `any` types, define interfaces
3. **Never commit secrets** — Use `.env.template`, not `.env`
4. **Handle errors properly** — Never ignore catch blocks
5. **Async email only** — Use BullMQ queue, never sync
6. **Mask PII in logs** — Especially email addresses
7. **Use structured logging** — No `console.log`. Use `logger.info(msg, { context })`.

### Principles

- Follow existing codebase patterns
- Business logic in services, not routes
- Use workflows for multi-step operations
- Prefer Medusa built-ins over custom solutions

---

## Key Commands

| Task | Command |
|------|---------|
| Dev (all) | `pnpm dev` |
| Dev (backend) | `pnpm dev:api` |
| Dev (storefront) | `pnpm dev:storefront` |
| Test | `pnpm test` |
| Type check | `pnpm typecheck` |
| Lint | `pnpm lint` |
| Migrate | `cd apps/backend && npm run migrate` |
| Deploy storefront | `pnpm deploy:storefront` |
| Deploy backend | `pnpm deploy:api` |
| Ralph Orchestrator | `./scripts/ralph run` |

---

## Server Process Management

### Cleanup Before Starting Servers

**ALWAYS clean up existing processes before starting dev servers:**

```bash
# Kill processes on common ports
lsof -ti:5173 | xargs kill -9 2>/dev/null  # Storefront
lsof -ti:9000 | xargs kill -9 2>/dev/null  # Backend API
lsof -ti:9001 | xargs kill -9 2>/dev/null  # Stripe webhooks
```

### Stripe Webhook Forwarding

**CRITICAL for checkout testing:** Stripe webhooks must be forwarded locally:

```bash
# Start Stripe CLI webhook forwarding
stripe listen --forward-to localhost:9000/webhooks/stripe
```

Without this, checkout will appear to succeed but orders won't be created (Medusa won't receive payment confirmation).

### Log Output for Agent Inspection

**ALWAYS write logs to temp files when starting servers:**

```bash
# ALWAYS start servers with logs persisted to temp directory
pnpm dev:api 2>&1 | tee /tmp/gracestowel-api.log
pnpm dev:storefront 2>&1 | tee /tmp/gracestowel-storefront.log

# Check logs in real-time
tail -f /tmp/gracestowel-api.log
tail -f /tmp/gracestowel-storefront.log

# Check recent log entries
tail -100 /tmp/gracestowel-storefront.log
```

Log files persist across restarts for post-session debugging.

---

## Structured Logging

**NEVER use `console.log/warn/error` directly unless specifically instructed.** Always use structured logger:

```typescript
import { createLogger, getTraceIdFromRequest } from "../lib/logger";

// In route handlers
const traceId = getTraceIdFromRequest(request);
const logger = createLogger({ traceId, context: "api.carts" });

logger.info("Cart completed", { cartId, orderId });
logger.error("Failed to process", error, { cartId });
```

**Why:**
- Trace IDs correlate requests across services
- JSON format enables log search/aggregation
- Prevents accidental PII exposure
- Consistent debugging experience

---

## Ralph Orchestrator

**Ralph Orchestrator** is installed as a git submodule in `tools/ralph-orchestrator/`. It enables autonomous AI agent orchestration for complex, multi-iteration tasks.

### Quick Usage

```bash
# Run with inline prompt
./scripts/ralph run -p "Refactor auth module to Medusa v2 patterns"

# Run with prompt file
echo "# Task: Your task" > PROMPT.md
./scripts/ralph run -a claude --max-iterations 50
```

### When to Use Ralph

**Use Ralph for:**
- Complex refactoring tasks requiring multiple iterations
- Test generation for large codebases
- Documentation generation
- Tasks with clear completion criteria

**Use direct agent execution for:**
- Simple one-shot tasks
- Real-time interactive tasks
- Tasks requiring immediate feedback

### AI Agent Integration Pattern

AI agents can delegate complex tasks to ralph:

```python
# 1. Agent creates detailed prompt
prompt = create_task_prompt(task_description)

# 2. Delegate to ralph
subprocess.run(["./scripts/ralph", "run", "-a", "claude", "--max-iterations", "50"])

# 3. Review results
review_changes()
```

**See:** [`docs/guides/ralph-orchestrator.md`](docs/guides/ralph-orchestrator.md) for complete guide.

---

## Codebase Structure

```
gracestowel/
├── apps/
│   ├── backend/           # Medusa v2 (see apps/backend/AGENTS.md)
│   ├── storefront/        # React Router v7 (see apps/storefront/AGENTS.md)
│   └── e2e/               # Playwright tests
├── docs/                  # Documentation
├── .github/workflows/     # CI/CD
└── docker-compose.yml     # Local dev
```

---

## Testing

| Type | Location | Command |
|------|----------|---------|
| Backend Unit | `apps/backend/src/**/*.spec.ts` | `cd apps/backend && npm test` |
| Backend Integration | `apps/backend/integration-tests/` | `cd apps/backend && npm run test:integration` |
| Storefront | `apps/storefront/**/*.test.tsx` | `cd apps/storefront && npm test` |
| E2E | `apps/e2e/tests/` | `pnpm test:e2e:ci` |

**Requirements:** All new code needs tests. Mock external services. Follow AAA pattern.

---

## Deployment

| Branch | Environment | Auto-Deploy |
|--------|-------------|-------------|
| `main` | Production | Yes |
| `staging` | Staging | Yes |

CI runs: Lint → Type Check → Security Scan → Unit Tests → E2E → Deploy

---

## Anti-Patterns (Never Do)

| Don't | Do Instead |
|-------|------------|
| Skip Medusa docs | Check docs.medusajs.com/v2 first |
| Use Medusa v1 patterns | Use v2 (`MedusaService`, `createWorkflow`) |
| Use `any` type | Define proper interfaces |
| Ignore catch errors | Log and handle properly |
| Send email synchronously | Use BullMQ queue |
| Log raw PII | Mask: `****@domain.com` |
| Use `console.log/warn/error` | Use `createLogger()` from `lib/logger.ts` (unless specifically instructed) |
| Start servers without cleanup | Kill existing port processes first |
| Test checkout without Stripe CLI | Run `stripe listen --forward-to localhost:9000/webhooks/stripe` |

---

## Resources

### Official Docs
- [Medusa v2](https://docs.medusajs.com/v2)
- [React Router v7](https://reactrouter.com/dev/guides)
- [Cloudflare Workers](https://developers.cloudflare.com/workers/)
- [Stripe API](https://docs.stripe.com/api)

### Project Docs
- [`docs/project_context.md`](docs/project_context.md) — Gotchas & recent decisions
- [`docs/architecture/`](docs/architecture/) — Architecture details
- [`docs/reference/`](docs/reference/) — API references

---

*Last updated: 2026-01-04*
