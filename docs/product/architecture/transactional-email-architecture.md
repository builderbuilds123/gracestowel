---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
inputDocuments:
  - "docs/product/prds/transactional-email-prd.md"
  - "docs/project_context.md"
  - "docs/epics.md"
  - "docs/index.md"
  - "docs/architecture/overview.md"
  - "docs/architecture/backend.md"
  - "docs/architecture/data-models.md"
  - "docs/architecture/integration.md"
  - "docs/architecture/storefront.md"
workflowType: 'architecture'
lastStep: 8
status: 'complete'
completedAt: '2025-12-14'
project_name: 'gracestowel'
user_name: 'Big Dick'
date: '2025-12-14'
hasProjectContext: true
---

# Architecture Decision Document - Transactional Email Integration

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements (26 FRs):**
The PRD defines a transactional email system with clear separation of concerns:

1. **Email Delivery Core (FR1-5):** Resend API integration with async queue, retry mechanism (3x exponential backoff), and Dead Letter Queue for failed emails
2. **Order Confirmation (FR6-10):** Primary MVP feature — trigger on `order.placed` event, include order summary and magic link with 1-hour TTL
3. **Magic Link Integration (FR11-13):** Reuse existing GuestAccessService from Epic 4 — no new auth infrastructure needed
4. **Observability (FR14-18):** Structured logging of all email attempts, failure alerting, DLQ inspection via direct Redis access (MVP)
5. **Error Handling (FR19-23):** Graceful degradation — email failures never block order flows
6. **Configuration (FR24-26):** Environment variables for Resend credentials

**Non-Functional Requirements (22 NFRs):**

| Category | Key Requirements |
|----------|------------------|
| Performance | Queue < 1s, API call < 30s, Total latency < 5 min |
| Security | API keys in env vars, no PII in logs, secure magic link tokens |
| Reliability | Non-blocking, 3x retry with backoff, DLQ persistence |
| Scalability | Handle 10x burst traffic, rate limiting, extensible design |
| Integration | Medusa subscribers, existing Redis, existing GuestAccessService |

**Scale & Complexity:**

- Primary domain: Backend API (Medusa v2 module extension)
- Complexity level: Low-Medium
- Estimated architectural components: 4-5 (Subscriber, EmailService, Queue Worker, Templates, DLQ)

### Technical Constraints & Dependencies

**From Project Context (30 rules):**
- ✅ Must use Medusa workflows with rollback logic
- ✅ Must use subscribers for domain events
- ✅ Must use BullMQ jobs for heavy processing (non-blocking)
- ✅ Redis already available for queue infrastructure
- ✅ MCP servers prioritized for external service interactions

**From PRD:**
- Resend as email provider (no alternatives considered for MVP)
- Reuse GuestAccessService for magic links (no new auth)
- Simple text templates for MVP (no rich HTML)
- Manual DLQ inspection only (no admin API for MVP)

### Cross-Cutting Concerns Identified

1. **Logging:** All email attempts must be logged with structured data (integrates with existing logging from Epic 8)
2. **Alerting:** Failure rate threshold triggers alerts (integrates with existing alerting infrastructure)
3. **Error Handling:** Consistent retry/DLQ pattern for all transient failures
4. **Security:** PII handling in logs, secure token generation for magic links

## Starter Template Evaluation

### Primary Technology Domain

**Backend API Extension** — Adding transactional email capabilities to existing Medusa v2 e-commerce backend.

### Existing Technical Foundation (Brownfield)

This is not a greenfield project. The technical stack is already established and documented in `docs/project_context.md`:

| Layer | Technology | Version |
|-------|------------|---------|
| Runtime | Node.js | >=24 |
| Backend Framework | Medusa | v2.12.0 |
| Database | PostgreSQL | Railway-hosted |
| Queue/Cache | Redis | BullMQ |
| Language | TypeScript | v5.6+ |
| Package Manager | pnpm | Monorepo workspaces |

### Selected Approach: Medusa Module Extension

**Rationale:**
- Project context mandates using Medusa workflows, subscribers, and BullMQ
- Email feature fits naturally as a Medusa module with subscriber triggers
- Existing infrastructure (Redis, logging, alerting) can be reused
- No new architectural patterns needed — follow established conventions

## Core Architectural Decisions

### Decision Priority Analysis

**Critical Decisions (Block Implementation):**
1. Queue Architecture → BullMQ
2. DLQ Storage → Redis List
3. Template Architecture → Hybrid (React Email, simple styling)

**Removed from Scope:**
- Feature flag → Removed (full send, no staged rollout)

### Decision 1: Queue Architecture

**Decision:** BullMQ Queue

**Rationale:**
- Already in project infrastructure (project context rule)
- Built-in retry with exponential backoff
- Native failed job handling for DLQ pattern
- Non-blocking by design
- Proven pattern in this codebase

**Implementation Flow:**
```
Subscriber (order.placed) → Queue Job → Worker → Resend API
                                    ↓ (on failure)
                              Retry (3x) → DLQ (Redis)
```

### Decision 2: DLQ Storage Strategy

**Decision:** Redis List

**Rationale:**
- Same infrastructure as queue (no new dependencies)
- Simple key-value storage for failed email payloads
- Manual inspection via Redis CLI for MVP
- Can query with `LRANGE email:dlq 0 -1`

**Schema:**
```
Key: email:dlq
Value: JSON stringified failed email job payloads
```

### Decision 3: Email Template Architecture

**Decision:** Hybrid (React Email with simple styling)

**Rationale:**
- Existing React Email infrastructure already built (`src/modules/resend/emails/`)
- Templates exist for ORDER_PLACED, WELCOME, SHIPPING_CONFIRMATION, ORDER_CANCELED
- Keep simple text-focused styling for MVP
- Foundation ready for rich HTML post-MVP

**Change Required:**
- Add magic link to ORDER_PLACED template
- Ensure templates are text-focused (no heavy styling)

### Decision 4: Feature Flag

**Decision:** Removed — Full send, no staged rollout.

### Implementation Sequence

1. **Email Queue Setup** — BullMQ queue and worker for async email processing
2. **Order Placed Subscriber** — Trigger queue job on `order.placed` event
3. **Retry Logic** — 3x exponential backoff in worker config
4. **DLQ Handler** — Move to Redis list after retries exhausted
5. **Magic Link Integration** — Add to ORDER_PLACED template using GuestAccessService
6. **Alerting** — Log failures, integrate with existing alerting

### Cross-Component Dependencies

```
order.placed event
       ↓
OrderPlacedSubscriber
       ↓
EmailQueueService.enqueue()
       ↓
BullMQ Queue (Redis)
       ↓
EmailWorker.process()
       ↓
ResendNotificationProviderService.send()
       ↓
   Success → Log
   Failure → Retry (3x) → DLQ (Redis) → Alert
```

## Implementation Patterns & Consistency Rules

### Naming Patterns (Established)

**Subscriber Files:**
- Pattern: `kebab-case.ts` (e.g., `order-placed.ts`, `customer-created.ts`)
- Handler function: `{eventName}Handler` (e.g., `orderPlacedHandler`)
- Export config with `event` property

**Job Files:**
- Pattern: `kebab-case.ts` (e.g., `fallback-capture.ts`)
- Export default async function + `config` object with `name` and `schedule`

**Queue Names:**
- Pattern: `kebab-case` (e.g., `payment-capture`, `email-queue`)
- Job IDs: `{action}-{entityId}` (e.g., `capture-ord_123`, `email-ord_456`)

**Redis Keys:**
- Pattern: `namespace:entity:id` (e.g., `email:dlq`, `capture_intent:ord_123`)

### Structure Patterns (Established)

```
apps/backend/src/
├── subscribers/          # Event handlers (order-placed.ts)
├── jobs/                 # Cron jobs (fallback-capture.ts)
├── lib/                  # Shared utilities (payment-capture-queue.ts)
├── modules/              # Medusa modules (resend/)
├── workflows/            # Medusa workflows
├── utils/                # Helper functions (stripe.ts, posthog.ts)
└── repositories/         # Data access (order-recovery.ts)
```

**New Email Components Location:**
```
apps/backend/src/
├── lib/
│   └── email-queue.ts           # BullMQ queue setup + enqueue function
├── jobs/
│   └── email-worker.ts          # BullMQ worker (processes queue)
├── subscribers/
│   └── order-placed.ts          # MODIFY: Add email queue call
└── modules/resend/
    └── emails/
        └── order-placed.tsx     # MODIFY: Add magic link
```

### Logging Patterns (Established)

```typescript
// Get logger from container
const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

// Info level for normal operations
logger.info(`[EMAIL] Order confirmation queued: ${orderId}`)

// Error level for failures
logger.error(`[EMAIL][CRITICAL] Failed to send email for order ${orderId}:`, error)

// Metric logging pattern
logger.info(`[METRIC] email_sent order=${orderId} template=order_confirmation`)
logger.info(`[METRIC] email_failed order=${orderId} error=${error.code}`)
```

### Error Handling Patterns (Established)

```typescript
// Non-blocking pattern (from order-placed.ts)
try {
  await sendEmail(...)
  logger.info(`Email sent for order ${orderId}`)
} catch (error) {
  // Log but don't throw - email failure shouldn't block order
  logger.error(`Failed to send email:`, error)
}
```

### Queue Patterns (Established from payment-capture-queue)

```typescript
// Queue setup pattern
import { Queue, Worker } from "bullmq"
import { getRedisConnection } from "./redis"

const QUEUE_NAME = "email-queue"

export function getEmailQueue(): Queue {
  return new Queue(QUEUE_NAME, { connection: getRedisConnection() })
}

// Job options pattern
await queue.add(
  `email-${orderId}`,           // Job name
  { orderId, template, data },   // Payload
  {
    delay: 0,                    // Immediate
    jobId: `email-${orderId}`,   // Idempotency key
    attempts: 3,                 // Retry count
    backoff: {
      type: "exponential",
      delay: 1000,               // 1s, 2s, 4s
    },
  }
)
```

### DLQ Pattern (New - Based on Established Conventions)

```typescript
// Redis list for DLQ
const DLQ_KEY = "email:dlq"

// On final failure (after 3 retries)
async function moveToDLQ(job: Job, error: Error) {
  const redis = getRedisConnection()
  await redis.lpush(DLQ_KEY, JSON.stringify({
    jobId: job.id,
    data: job.data,
    error: error.message,
    failedAt: new Date().toISOString(),
    attempts: job.attemptsMade,
  }))
  logger.error(`[EMAIL][DLQ] Job ${job.id} moved to DLQ after ${job.attemptsMade} attempts`)
}
```

### Anti-Patterns (AVOID)

| ❌ Don't | ✅ Do |
|----------|-------|
| `console.log()` for important events | `logger.info()` with structured data |
| Throw errors in subscribers | Catch and log, don't block |
| Hardcode Redis connection strings | Use `getRedisConnection()` utility |
| Create new queue instances per call | Use singleton pattern |
| Log full email addresses | Mask PII: `****@domain.com` |


## Project Structure & Boundaries

### Email Feature File Structure

Since this is a brownfield extension, here's the specific structure for the email feature:

```
apps/backend/src/
├── lib/
│   ├── email-queue.ts              # NEW: BullMQ queue setup + enqueue
│   └── redis.ts                    # EXISTING: Redis connection (reuse)
│
├── jobs/
│   ├── email-worker.ts             # NEW: BullMQ worker for email processing
│   └── fallback-capture.ts         # EXISTING: Reference pattern
│
├── subscribers/
│   └── order-placed.ts             # MODIFY: Add email queue call
│
├── modules/resend/
│   ├── index.ts                    # EXISTING: Module registration
│   ├── service.ts                  # EXISTING: Resend provider service
│   └── emails/
│       ├── order-placed.tsx        # MODIFY: Add magic link prop
│       └── ...                     # EXISTING: Other templates
│
├── services/
│   └── guest-access.ts             # EXISTING: Magic link generation (reuse)
│
└── utils/
    └── email-masking.ts            # NEW: PII masking utility
```

### New Files to Create

| File | Purpose | Dependencies |
|------|---------|--------------|
| `lib/email-queue.ts` | BullMQ queue singleton + `enqueueEmail()` | `bullmq`, `lib/redis.ts` |
| `jobs/email-worker.ts` | Worker that processes email jobs | `email-queue.ts`, `modules/resend/service.ts` |
| `utils/email-masking.ts` | Mask email addresses in logs | None |

### Files to Modify

| File | Change | Reason |
|------|--------|--------|
| `subscribers/order-placed.ts` | Add `enqueueEmail()` call | Trigger async email on order |
| `modules/resend/emails/order-placed.tsx` | Add `magicLink` prop | Include modification link |

### Architectural Boundaries

**Queue Boundary:**
```
Subscriber → enqueueEmail() → [Redis Queue] → Worker → ResendService
```
- Subscriber only enqueues, never sends directly
- Worker owns retry logic and DLQ handling
- ResendService is the only component that talks to Resend API

**Data Flow:**
```
order.placed event
    ↓
OrderPlacedSubscriber
    ├── Get order data (query.graph)
    ├── Generate magic link (GuestAccessService)
    └── Enqueue email job (EmailQueueService)
           ↓
    [BullMQ Queue - Redis]
           ↓
    EmailWorker.process()
    ├── Build email payload
    ├── Call ResendService.send()
    └── On failure: retry or DLQ
```

**Integration Points:**

| Component | Integrates With | Method |
|-----------|-----------------|--------|
| `order-placed.ts` | `email-queue.ts` | `enqueueEmail()` |
| `order-placed.ts` | `guest-access.ts` | `generateMagicLink()` |
| `email-worker.ts` | `resend/service.ts` | `send()` |
| `email-worker.ts` | Redis | DLQ via `LPUSH` |

### Requirements to Structure Mapping

| PRD Requirement | File(s) |
|-----------------|---------|
| FR1-5 (Email delivery) | `lib/email-queue.ts`, `jobs/email-worker.ts` |
| FR6-10 (Order confirmation) | `subscribers/order-placed.ts`, `modules/resend/emails/order-placed.tsx` |
| FR11-13 (Magic link) | `services/guest-access.ts` (existing) |
| FR14-18 (Observability) | All files (logging patterns) |
| FR19-23 (Error handling) | `jobs/email-worker.ts` (retry + DLQ) |


## Architecture Validation Results

### Coherence Validation ✅

**Decision Compatibility:**
- BullMQ + Redis: ✅ Already working together in codebase (payment-capture-queue)
- Resend + React Email: ✅ Already integrated in `src/modules/resend`
- Medusa Subscribers + BullMQ: ✅ Proven pattern in `order-placed.ts`
- GuestAccessService + Magic Links: ✅ Existing service, just need to call it

**Pattern Consistency:**
- Naming: ✅ All patterns follow existing kebab-case conventions
- Logging: ✅ Uses established `logger.info/error` with `[NAMESPACE]` prefix
- Error handling: ✅ Non-blocking try/catch pattern matches existing code
- Queue patterns: ✅ Mirrors `payment-capture-queue.ts` exactly

**Structure Alignment:**
- New files in correct locations (`lib/`, `jobs/`, `utils/`)
- Modifications to existing files are minimal and targeted
- No new directories needed — fits existing structure

### Requirements Coverage Validation ✅

**Functional Requirements Coverage:**

| FR | Architectural Support | Status |
|----|----------------------|--------|
| FR1-5 (Email delivery) | BullMQ queue + worker | ✅ |
| FR6-10 (Order confirmation) | Subscriber + template | ✅ |
| FR11-13 (Magic link) | GuestAccessService (existing) | ✅ |
| FR14-18 (Observability) | Structured logging patterns | ✅ |
| FR19-23 (Error handling) | Retry + DLQ in worker | ✅ |
| FR24-26 (Configuration) | Env vars (existing pattern) | ✅ |

**Non-Functional Requirements Coverage:**

| NFR Category | Architectural Support | Status |
|--------------|----------------------|--------|
| Performance (< 5 min) | Async queue, immediate processing | ✅ |
| Security (no PII in logs) | `email-masking.ts` utility | ✅ |
| Reliability (non-blocking) | Try/catch in subscriber | ✅ |
| Scalability (10x burst) | BullMQ handles backpressure | ✅ |

### Implementation Readiness Validation ✅

**Decision Completeness:**
- ✅ Queue architecture: BullMQ with specific job options
- ✅ DLQ strategy: Redis list with defined schema
- ✅ Template approach: Hybrid React Email
- ✅ All patterns have code examples

**Structure Completeness:**
- ✅ 3 new files clearly defined
- ✅ 2 files to modify identified
- ✅ Integration points mapped
- ✅ Dependencies documented

### Gap Analysis Results

**Critical Gaps:** None

**Important Gaps:**
1. Redis connection utility — verify `lib/redis.ts` exists or create it
2. Worker startup — ensure worker starts with Medusa

**Nice-to-Have:**
- Alerting threshold configuration (post-MVP)
- DLQ inspection CLI helper (manual Redis access is fine for MVP)

### Architecture Completeness Checklist

**✅ Requirements Analysis**
- [x] Project context thoroughly analyzed
- [x] Scale and complexity assessed (Low-Medium)
- [x] Technical constraints identified (Medusa patterns)
- [x] Cross-cutting concerns mapped

**✅ Architectural Decisions**
- [x] Critical decisions documented (Queue, DLQ, Templates)
- [x] Technology stack fully specified (BullMQ, Redis, React Email)
- [x] Integration patterns defined
- [x] Performance considerations addressed

**✅ Implementation Patterns**
- [x] Naming conventions established
- [x] Structure patterns defined
- [x] Communication patterns specified
- [x] Process patterns documented

**✅ Project Structure**
- [x] Complete file structure defined
- [x] Component boundaries established
- [x] Integration points mapped
- [x] Requirements to structure mapping complete

### Architecture Readiness Assessment

**Overall Status:** ✅ READY FOR IMPLEMENTATION

**Confidence Level:** HIGH

**Key Strengths:**
- Leverages existing, proven patterns from payment capture
- Minimal new code — mostly wiring existing components
- Clear separation of concerns
- Non-blocking by design

**Areas for Future Enhancement:**
- Admin API for DLQ management (post-MVP)
- Click-through tracking via PostHog (post-MVP)
- Rich HTML templates (post-MVP)


## Architecture Completion Summary

### Workflow Completion

**Architecture Decision Workflow:** COMPLETED ✅
**Total Steps Completed:** 8
**Date Completed:** 2025-12-14
**Document Location:** `docs/product/architecture/transactional-email-architecture.md`

### Final Architecture Deliverables

**📋 Complete Architecture Document**
- All architectural decisions documented with specific patterns
- Implementation patterns ensuring AI agent consistency
- Complete project structure with all files and directories
- Requirements to architecture mapping
- Validation confirming coherence and completeness

**🏗️ Implementation Ready Foundation**
- 4 architectural decisions made (Queue, DLQ, Templates, Feature Flag removal)
- 6 implementation pattern categories defined
- 5 new/modified files specified
- 26 FRs + 22 NFRs fully supported

**📚 AI Agent Implementation Guide**
- Technology stack: BullMQ, Redis, React Email, Medusa v2
- Consistency rules that prevent implementation conflicts
- Project structure with clear boundaries
- Integration patterns and communication standards

### Implementation Handoff

**For AI Agents:**
This architecture document is your complete guide for implementing the Transactional Email Integration feature. Follow all decisions, patterns, and structures exactly as documented.

**First Implementation Priority:**
1. Create `lib/email-queue.ts` — BullMQ queue setup
2. Create `jobs/email-worker.ts` — Worker with retry + DLQ
3. Modify `subscribers/order-placed.ts` — Add queue call
4. Modify `modules/resend/emails/order-placed.tsx` — Add magic link

**Development Sequence:**
1. Set up email queue infrastructure
2. Implement worker with retry logic
3. Wire subscriber to queue
4. Add magic link to template
5. Test end-to-end flow

### Quality Assurance Checklist

**✅ Architecture Coherence**
- [x] All decisions work together without conflicts
- [x] Technology choices are compatible (BullMQ + Redis + Medusa)
- [x] Patterns support the architectural decisions
- [x] Structure aligns with existing codebase

**✅ Requirements Coverage**
- [x] All 26 functional requirements are supported
- [x] All 22 non-functional requirements are addressed
- [x] Cross-cutting concerns handled (logging, alerting, security)
- [x] Integration points defined

**✅ Implementation Readiness**
- [x] Decisions are specific and actionable
- [x] Patterns prevent agent conflicts
- [x] Structure is complete and unambiguous
- [x] Code examples provided for clarity

---

**Architecture Status:** READY FOR IMPLEMENTATION ✅

**Next Phase:** Begin implementation using the architectural decisions and patterns documented herein.
