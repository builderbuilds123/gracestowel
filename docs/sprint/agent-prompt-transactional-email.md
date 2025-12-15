# Agent Implementation Prompt: Transactional Email Integration

## Mission

Implement the **Transactional Email Integration** feature using a **Test-Driven Development (TDD)** approach. Build a robust, non-blocking email system that delivers order confirmation emails with magic links for guest order access.

**Primary Objective**: Implement all 13 stories across 4 epics using BullMQ queue architecture, ensuring all tests pass and the system is production-ready.

**Key Deliverable**: A fully functional transactional email system with:
- Async email queue (BullMQ)
- Retry mechanism with exponential backoff
- Dead Letter Queue for failed emails
- Order confirmation emails with magic links for guests
- Comprehensive logging and alerting

---

## 🔴 CRITICAL: MIGRATION REQUIRED - STORIES TAKE PRECEDENCE

### Architectural Decision: BullMQ Queue (CONFIRMED)

**The stories and architecture documentation are the source of truth. The existing implementation using Medusa Workflow MUST be replaced with BullMQ queue architecture.**

### Challenge: Existing Implementation Conflict

A previous implementation exists that uses a different approach:

| Component | Existing (TO BE REPLACED) | Required (PER STORIES) |
|-----------|---------------------------|------------------------|
| Email Trigger | `sendOrderConfirmationWorkflow()` | `enqueueEmail()` via BullMQ |
| Processing | Medusa Workflow (synchronous) | BullMQ Worker (async) |
| Retry | None | 3x exponential backoff (1s, 2s, 4s) |
| Failure Handling | try/catch only | Dead Letter Queue (Redis) |
| Error Classification | None | Invalid email detection |

### Resolution: Replace Workflow with BullMQ

**YOU MUST:**
1. **IGNORE** the existing `sendOrderConfirmationWorkflow` implementation
2. **IMPLEMENT** the BullMQ queue architecture as specified in the stories
3. **REFACTOR** `order-placed.ts` subscriber to call `enqueueEmail()` instead of the workflow
4. **KEEP** the existing email template (`order-placed.tsx`) - it's already correct
5. **KEEP** the existing `ModificationTokenService` - reuse for magic link generation

### Files to REPLACE/REFACTOR:

| File | Action | Reason |
|------|--------|--------|
| `apps/backend/src/subscribers/order-placed.ts` | REFACTOR | Replace workflow call with `enqueueEmail()` |
| `apps/backend/src/workflows/send-order-confirmation.ts` | DEPRECATE | No longer needed after BullMQ migration |

### Files to KEEP (already correct):

| File | Status | Notes |
|------|--------|-------|
| `apps/backend/src/modules/resend/emails/order-placed.tsx` | ✅ KEEP | Template already has magic link support |
| `apps/backend/src/modules/resend/service.ts` | ✅ KEEP | Resend provider works correctly |
| `apps/backend/src/services/modification-token.ts` | ✅ KEEP | Token generation works correctly |

### Files to CREATE (per stories):

| File | Story | Purpose |
|------|-------|---------|
| `apps/backend/src/lib/email-queue.ts` | 1.1 | BullMQ queue singleton |
| `apps/backend/src/jobs/email-worker.ts` | 1.2 | BullMQ worker |
| `apps/backend/src/utils/email-masking.ts` | 4.1 | PII masking utility |

---

## Epic Overview

| Epic | Stories | Goal | Status |
|------|---------|------|--------|
| Epic 1 | 1.1-1.3 | Email Queue Infrastructure | 🔨 To Implement |
| Epic 2 | 2.1-2.3 | Retry & Dead Letter Queue | 🔨 To Implement |
| Epic 3 | 3.1-3.4 | Order Confirmation Email | 🔨 3.1 needs refactor, 3.3 done |
| Epic 4 | 4.1-4.3 | Observability & Security | 🔨 To Implement |

**Total: 13 stories across 4 epics**

## Critical Context Files

**MUST READ before implementation:**

1. **PRD**: `docs/product/prds/transactional-email-prd.md`
2. **Architecture**: `docs/product/architecture/transactional-email-architecture.md`
3. **Epics Overview**: `docs/product/epics/transactional-email-epics.md`
4. **Project Context**: `docs/project_context.md`
5. **Sprint Status**: `docs/sprint/sprint-artifacts/sprint-status.yaml`

## Stories to Implement

Located in `docs/sprint/sprint-artifacts/`:

### Epic 1: Email Queue Infrastructure
| Story | File | Status | Description |
|-------|------|--------|-------------|
| 1.1 | `email-1-1-create-email-queue-service.md` | 🔨 TODO | BullMQ queue singleton + enqueueEmail() |
| 1.2 | `email-1-2-create-email-worker.md` | 🔨 TODO | Worker that processes email jobs via Resend |
| 1.3 | `email-1-3-verify-non-blocking-behavior.md` | 🔨 TODO | Ensure email failures never block orders |

### Epic 2: Retry & Dead Letter Queue
| Story | File | Status | Description |
|-------|------|--------|-------------|
| 2.1 | `email-2-1-implement-exponential-backoff-retry.md` | 🔨 TODO | 3x retry with 1s, 2s, 4s delays |
| 2.2 | `email-2-2-implement-dead-letter-queue.md` | 🔨 TODO | Redis list for failed emails |
| 2.3 | `email-2-3-handle-invalid-email-addresses.md` | 🔨 TODO | Skip retry for invalid emails |

### Epic 3: Order Confirmation Email
| Story | File | Status | Description |
|-------|------|--------|-------------|
| 3.1 | `email-3-1-wire-order-placed-subscriber.md` | 🔄 REFACTOR | Replace workflow with `enqueueEmail()` |
| 3.2 | `email-3-2-generate-magic-link-for-guests.md` | 🔄 REFACTOR | Integrate with new queue approach |
| 3.3 | `email-3-3-update-order-confirmation-template.md` | ✅ DONE | Template already has magic link support |
| 3.4 | `email-3-4-e2e-order-confirmation-flow.md` | 🔨 TODO | Integration tests for BullMQ flow |

### Epic 4: Observability & Security
| Story | File | Status | Description |
|-------|------|--------|-------------|
| 4.1 | `email-4-1-create-pii-masking-utility.md` | 🔨 TODO | Extract maskEmail() to utils/ |
| 4.2 | `email-4-2-add-structured-logging.md` | 🔨 TODO | [EMAIL] namespace logging |
| 4.3 | `email-4-3-add-failure-alerting.md` | 🔨 TODO | [EMAIL][ALERT] for DLQ entries |

---

## Existing Code Reference

### Files to KEEP and REUSE:

| File | Purpose | Reuse How |
|------|---------|-----------|
| `apps/backend/src/modules/resend/emails/order-placed.tsx` | Email template | Worker calls this via Resend service |
| `apps/backend/src/modules/resend/service.ts` | Resend provider | Worker uses this to send emails |
| `apps/backend/src/services/modification-token.ts` | Token generation | Subscriber uses this for magic links |
| `apps/backend/src/lib/redis.ts` | Redis connection | Queue and worker reuse this |
| `apps/backend/src/lib/payment-capture-queue.ts` | Queue pattern | Reference for email-queue.ts |
| `apps/backend/src/jobs/fallback-capture.ts` | Worker pattern | Reference for email-worker.ts |

### Files to REFACTOR:

| File | Current State | Required Change |
|------|---------------|-----------------|
| `apps/backend/src/subscribers/order-placed.ts` | Calls `sendOrderConfirmationWorkflow()` | Call `enqueueEmail()` instead |

### Files to DEPRECATE (after migration):

| File | Reason |
|------|--------|
| `apps/backend/src/workflows/send-order-confirmation.ts` | Replaced by BullMQ worker |

### Existing Code to Extract:

| Source | Target | What |
|--------|--------|------|
| `apps/backend/src/api/store/orders/[id]/guest-view/route.ts` (lines 120-135) | `apps/backend/src/utils/email-masking.ts` | `maskEmail()` function |

---

## Architecture Overview

```
Order Event → Subscriber → Email Queue → Worker → Resend API
                              ↓ (on failure)
                         Retry (3x) → DLQ (Redis)

apps/backend/src/
├── lib/
│   ├── email-queue.ts           # NEW: BullMQ queue singleton + enqueue
│   └── redis.ts                 # EXISTING: Redis connection (reuse)
├── jobs/
│   ├── email-worker.ts          # NEW: BullMQ worker for email processing
│   └── fallback-capture.ts      # EXISTING: Reference pattern
├── subscribers/
│   └── order-placed.ts          # MODIFY: Add email queue call
├── modules/resend/
│   ├── index.ts                 # EXISTING: Module registration
│   ├── service.ts               # EXISTING: Resend provider service
│   └── emails/
│       ├── order-placed.tsx     # MODIFY: Add magic link prop
│       └── ...                  # EXISTING: Other templates
├── services/
│   └── modification-token.ts    # EXISTING: Magic link generation (reuse)
└── utils/
    └── email-masking.ts         # NEW: PII masking utility
```

## Key Design Decisions

### 1. Queue Architecture: BullMQ
- Already in project infrastructure
- Built-in retry with exponential backoff
- Native failed job handling for DLQ pattern
- Non-blocking by design

### 2. DLQ Storage: Redis List
- Key: `email:dlq`
- Simple LPUSH to add, LRANGE to read
- Manual inspection via Redis CLI for MVP

### 3. Template Architecture: React Email
- Existing infrastructure at `src/modules/resend/emails/`
- Keep simple text-focused styling for MVP

### 4. Non-Blocking Pattern (CRITICAL)
```typescript
// ✅ CORRECT - fire and forget
try {
  await enqueueEmail(payload)
} catch (error) {
  logger.error(`[EMAIL][ERROR] Failed to queue: ${error.message}`)
  // DO NOT THROW - order must continue
}

// ❌ WRONG - blocks order
const job = await enqueueEmail(payload)
if (!job) throw new Error("Email failed")
```

## Implementation Patterns

### Queue Pattern (from payment-capture-queue.ts)
```typescript
import { Queue, Job } from "bullmq"
import { getRedisConnection } from "./redis"

const QUEUE_NAME = "email-queue"
let emailQueue: Queue | null = null

export function getEmailQueue(): Queue {
  if (!emailQueue) {
    emailQueue = new Queue(QUEUE_NAME, { connection: getRedisConnection() })
  }
  return emailQueue
}

export async function enqueueEmail(payload: EmailJobPayload): Promise<Job | null> {
  try {
    const queue = getEmailQueue()
    return await queue.add(`email-${payload.orderId}`, payload, {
      jobId: `email-${payload.orderId}`,
      attempts: 3,
      backoff: { type: "exponential", delay: 1000 },
    })
  } catch (error) {
    logger.error(`[EMAIL][ERROR] Failed to queue: ${error.message}`)
    return null
  }
}
```

### Worker Pattern (from fallback-capture.ts)
```typescript
import { Worker, Job } from "bullmq"

export function startEmailWorker(container: MedusaContainer): Worker {
  const logger = container.resolve("logger")
  const resendService = container.resolve("resendNotificationProviderService")

  const worker = new Worker(
    "email-queue",
    async (job: Job<EmailJobPayload>) => {
      const { orderId, template, recipient, data } = job.data
      
      logger.info(`[EMAIL][PROCESS] Processing ${template} for order ${orderId}`)
      
      try {
        await resendService.send({ to: recipient, template, data })
        logger.info(`[EMAIL][SENT] Sent ${template} to ${maskEmail(recipient)}`)
      } catch (error) {
        logger.error(`[EMAIL][FAILED] ${error.message}`)
        throw error // Re-throw for retry
      }
    },
    { connection: getRedisConnection() }
  )

  // DLQ handler
  worker.on("failed", async (job, error) => {
    if (!job) return
    await redis.lpush("email:dlq", JSON.stringify({
      jobId: job.id,
      orderId: job.data.orderId,
      error: error.message,
      failedAt: new Date().toISOString(),
    }))
    logger.error(`[EMAIL][DLQ] Job ${job.id} moved to DLQ`)
    logger.error(`[EMAIL][ALERT] Email delivery failed | order=${job.data.orderId}`)
  })

  return worker
}
```

### Logging Pattern
```typescript
// Namespace prefixes
logger.info(`[EMAIL][QUEUE] Enqueued ${template} for order ${orderId}`)
logger.info(`[EMAIL][PROCESS] Processing ${template}, attempt ${attemptsMade}/3`)
logger.info(`[EMAIL][SENT] Sent ${template} to ${maskEmail(recipient)}`)
logger.error(`[EMAIL][FAILED] Failed ${template}: ${error.message}`)
logger.error(`[EMAIL][DLQ] Job ${jobId} moved to DLQ`)
logger.error(`[EMAIL][ALERT] Email delivery failed | order=${orderId}`)

// Metrics
logger.info(`[METRIC] email_sent template=${template} order=${orderId}`)
logger.info(`[METRIC] email_failed template=${template} order=${orderId}`)
```

### PII Masking Pattern
```typescript
export function maskEmail(email: string | null | undefined): string {
  if (!email || typeof email !== "string") return "[invalid-email]"
  const atIndex = email.indexOf("@")
  if (atIndex <= 0) return "[invalid-email]"
  const local = email.substring(0, atIndex)
  const domain = email.substring(atIndex + 1)
  if (local.length <= 2) return email
  return `${local[0]}${"*".repeat(Math.min(local.length - 1, 7))}@${domain}`
}
// "john.doe@example.com" → "j*******@example.com"
```

## Story Dependencies

```
Story 4.1 (PII Masking) ──────────────────────────────────┐
                                                          │
Epic 1 (Infrastructure)                                   │
  1.1 Queue Service ──► 1.2 Worker ──► 1.3 Non-Blocking ──┤
                            │                             │
                            ▼                             │
Epic 2 (Retry & DLQ)        │                             │
  2.1 Retry ──► 2.2 DLQ ──► 2.3 Invalid Emails ───────────┤
                                                          │
Epic 3 (Order Confirmation)                               │
  3.1 Subscriber ──► 3.2 Magic Link ──► 3.3 Template ──► 3.4 E2E
                                                          │
Epic 4 (Observability)                                    │
  4.1 PII Masking ──► 4.2 Logging ──► 4.3 Alerting ◄──────┘
```

**Recommended Implementation Order (CONFIRMED - BullMQ Required):**

1. Story 4.1 (PII Masking) - Extract `maskEmail()` to `utils/email-masking.ts`
2. Story 1.1 (Queue Service) - Create BullMQ queue singleton
3. Story 1.2 (Worker) - Create BullMQ worker
4. Story 2.1 (Retry) - Configure exponential backoff (1s, 2s, 4s)
5. Story 2.2 (DLQ) - Implement Redis DLQ (`email:dlq`)
6. Story 2.3 (Invalid Emails) - Error classification, skip retry for invalid
7. Story 1.3 (Non-Blocking) - Verify `enqueueEmail()` never blocks orders
8. Story 3.1 (Subscriber) - **REFACTOR** to use `enqueueEmail()` instead of workflow
9. Story 3.2 (Magic Link) - **REFACTOR** to integrate with queue payload
10. Story 4.2 (Logging) - Add `[EMAIL]` namespace logging
11. Story 4.3 (Alerting) - Add `[EMAIL][ALERT]` for DLQ entries
12. Story 3.4 (E2E Tests) - Complete integration tests for BullMQ flow

**Story 3.3 is already DONE** - template has magic link support, no changes needed.

## Iteration Protocol (CRITICAL)

For each story, follow this **strict cycle until all tests pass**:

### Phase 1: Understand
1. Read the story file completely (`docs/sprint/sprint-artifacts/email-*.md`)
2. Read referenced files (architecture, existing code patterns)
3. Understand acceptance criteria and technical requirements
4. Note dependencies on previous stories

### Phase 2: Implement
1. Create/modify files as specified in the story
2. Follow existing patterns from the codebase
3. Use the exact file paths specified
4. Include all required functionality

### Phase 3: Test
1. Run unit tests for the specific file:
   ```bash
   cd apps/backend && TEST_TYPE=unit npx jest integration-tests/unit/<test-file>.spec.ts
   ```
2. Run integration tests if applicable:
   ```bash
   cd apps/backend && TEST_TYPE=integration npx jest integration-tests/integration/<test-file>.spec.ts
   ```
3. Check for TypeScript errors:
   ```bash
   cd apps/backend && pnpm typecheck
   ```

### Phase 4: Validate & Fix
1. **If tests fail:**
   - Read the error message carefully
   - Identify the root cause
   - Fix the implementation
   - Re-run tests
   - **REPEAT until ALL tests pass**

2. **If TypeScript errors:**
   - Fix type errors
   - Re-run typecheck
   - **REPEAT until no errors**

3. **If lint errors:**
   - Fix lint issues
   - Re-run lint
   - **REPEAT until clean**

### Phase 5: Verify Completeness
Check ALL items in the story's "Definition of Done":
- [ ] All acceptance criteria met
- [ ] All tests passing
- [ ] No TypeScript errors
- [ ] Code follows project patterns
- [ ] Logging implemented correctly

### Phase 6: Clean Context Self-Review (CRITICAL)

**Before marking any story as done, perform a fresh-eyes review:**

1. **Clear Context:**
   - Start a new mental context (pretend you're a different agent)
   - Forget implementation details you just worked on

2. **Reload Instructions:**
   - Re-read the story file from `docs/sprint/sprint-artifacts/email-*.md`
   - Re-read relevant sections of:
     - `docs/product/architecture/transactional-email-architecture.md`
     - `docs/project_context.md`

3. **Self-Review Checklist:**
   ```
   □ Does the implementation match ALL acceptance criteria exactly?
   □ Are there any edge cases not handled?
   □ Does the code follow the patterns specified in architecture doc?
   □ Are all file paths correct as specified in the story?
   □ Is error handling complete (no swallowed errors)?
   □ Are all logs using correct prefixes ([EMAIL], [METRIC], etc.)?
   □ Is PII properly masked in ALL log statements?
   □ Are there any hardcoded values that should be configurable?
   □ Does the code integrate correctly with existing code?
   □ Are all imports correct and necessary?
   ```

4. **Run Full Test Suite Again:**
   ```bash
   # Run ALL email tests one more time
   cd apps/backend && TEST_TYPE=unit npx jest --testPathPattern="email" --verbose
   
   # TypeScript check
   pnpm typecheck
   
   # Lint check  
   pnpm lint
   ```

5. **Code Quality Review:**
   - Read through your implementation line by line
   - Check for:
     - Unused variables or imports
     - Missing error handling
     - Inconsistent naming
     - Missing JSDoc comments on exported functions
     - Any TODO comments that should be addressed

6. **If ANY issues found:**
   - Fix the issues
   - Re-run tests
   - **REPEAT Phase 6 from step 1**

### Phase 7: Update Status
1. Update story file `Status:` to `done`
2. Fill in "Dev Agent Record" section with:
   - Agent model used
   - Implementation notes
   - File list with changes
   - Any deviations from spec (with justification)
3. Update `sprint-status.yaml`

### ITERATION RULE
**DO NOT proceed to the next story until:**
- ALL tests for current story pass
- ALL TypeScript errors resolved
- ALL Definition of Done items checked
- **Phase 6 Self-Review completed with NO issues**
- **Full test suite passes on final run**

## Test Commands Reference

```bash
# Navigate to backend
cd apps/backend

# Run specific unit test
TEST_TYPE=unit npx jest integration-tests/unit/email-queue.unit.spec.ts

# Run specific integration test
TEST_TYPE=integration npx jest integration-tests/integration/email-flow.integration.spec.ts

# Run all email-related tests
TEST_TYPE=unit npx jest --testPathPattern="email"

# Run with verbose output
TEST_TYPE=unit npx jest --verbose integration-tests/unit/email-queue.unit.spec.ts

# Run with coverage
TEST_TYPE=unit npx jest --coverage integration-tests/unit/email-queue.unit.spec.ts

# TypeScript check
pnpm typecheck

# Lint check
pnpm lint

# Run tests with longer timeout (for retry tests)
TEST_TYPE=integration npx jest --testTimeout=20000 integration-tests/integration/email-retry.integration.spec.ts
```

## Environment Variables

Ensure these are set in `.env`:

```env
# Resend
RESEND_API_KEY=re_xxxxxxxxxxxx
RESEND_FROM_EMAIL=orders@gracestowel.com

# Redis (for BullMQ)
REDIS_URL=redis://localhost:6379

# JWT (for magic links)
JWT_SECRET=your-secure-secret-min-32-chars

# Storefront URL (for magic links)
STOREFRONT_URL=http://localhost:5173
```

## Existing Code to Reference

Before implementing, study these existing files:

### Queue Pattern
- `apps/backend/src/lib/payment-capture-queue.ts` - Queue singleton pattern
- `apps/backend/src/jobs/fallback-capture.ts` - Worker/job pattern

### Redis Connection
- `apps/backend/src/lib/redis.ts` - Redis connection utility

### Resend Service
- `apps/backend/src/modules/resend/service.ts` - Email sending
- `apps/backend/src/modules/resend/emails/` - Email templates

### Magic Link
- `apps/backend/src/services/modification-token.ts` - Token generation

### Subscriber Pattern
- `apps/backend/src/subscribers/order-placed.ts` - Event handling

## Key Interfaces

```typescript
// Email Job Payload
interface EmailJobPayload {
  orderId: string
  template: "order_confirmation"
  recipient: string
  data: {
    orderNumber: string | number
    items: Array<{ title: string; quantity: number; unit_price: number }>
    total: number
    currency: string
    magicLink?: string | null
    isGuest?: boolean
  }
}

// DLQ Entry
interface DLQEntry {
  jobId: string
  orderId: string
  template: string
  recipient: string  // Masked
  error: string
  failedAt: string   // ISO 8601
  attempts: number
  reason?: "invalid_email" | "api_error"
}

// Email Template Props
interface OrderPlacedEmailProps {
  orderNumber: string | number
  items: Array<{ title: string; quantity: number; unit_price: number }>
  total: number
  currency: string
  magicLink?: string | null
  isGuest?: boolean
}
```

## Common Pitfalls to Avoid

### ❌ DON'T: Block order flow
```typescript
// WRONG - throws on email failure
const job = await enqueueEmail(payload)
if (!job) throw new Error("Email failed")
```

### ✅ DO: Fire and forget
```typescript
// CORRECT - non-blocking
await enqueueEmail(payload) // Returns null on failure, doesn't throw
```

### ❌ DON'T: Log raw emails
```typescript
// WRONG - PII exposure
logger.info(`Sent to ${recipient}`)
```

### ✅ DO: Mask emails
```typescript
// CORRECT - PII protected
logger.info(`Sent to ${maskEmail(recipient)}`)
```

### ❌ DON'T: Swallow errors in worker
```typescript
// WRONG - no retry
catch (error) {
  logger.error(error)
  return // Job marked complete!
}
```

### ✅ DO: Re-throw for retry
```typescript
// CORRECT - enables retry
catch (error) {
  logger.error(error)
  throw error // BullMQ will retry
}
```

### ❌ DON'T: Create new queue instances
```typescript
// WRONG - multiple instances
const queue = new Queue("email-queue", { connection })
```

### ✅ DO: Use singleton
```typescript
// CORRECT - singleton pattern
const queue = getEmailQueue()
```

## Success Criteria

Implementation is complete when:

### Infrastructure (Epic 1)
- [ ] `email-queue.ts` created with singleton pattern
- [ ] `email-worker.ts` created and starts with Medusa
- [ ] `enqueueEmail()` returns null on failure (non-blocking)
- [ ] All Epic 1 tests pass

### Retry & DLQ (Epic 2)
- [ ] Jobs retry 3x with 1s, 2s, 4s delays
- [ ] Failed jobs stored in Redis `email:dlq`
- [ ] Invalid emails skip retry, go directly to DLQ
- [ ] All Epic 2 tests pass

### Order Confirmation (Epic 3)
- [ ] `order-placed.ts` subscriber enqueues email
- [ ] Guest orders include magic link
- [ ] Registered orders have no magic link
- [ ] Email template displays magic link button
- [ ] E2E flow works end-to-end
- [ ] All Epic 3 tests pass

### Observability (Epic 4)
- [ ] `maskEmail()` utility created and used everywhere
- [ ] All logs use `[EMAIL]` namespace
- [ ] DLQ entries trigger `[EMAIL][ALERT]` logs
- [ ] All Epic 4 tests pass

### Quality Gates
- [ ] All 13 stories have `Status: done`
- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] No TypeScript errors
- [ ] No lint errors
- [ ] Manual test: place order, receive email, click magic link

## Files to Create

| File | Story | Purpose |
|------|-------|---------|
| `apps/backend/src/lib/email-queue.ts` | 1.1 | Queue singleton + enqueue |
| `apps/backend/src/jobs/email-worker.ts` | 1.2 | Worker processing |
| `apps/backend/src/utils/email-masking.ts` | 4.1 | PII masking |
| `apps/backend/integration-tests/unit/email-queue.unit.spec.ts` | 1.1 | Queue tests |
| `apps/backend/integration-tests/unit/email-worker.unit.spec.ts` | 1.2 | Worker tests |
| `apps/backend/integration-tests/unit/email-masking.unit.spec.ts` | 4.1 | Masking tests |
| `apps/backend/integration-tests/integration/email-flow.integration.spec.ts` | 3.4 | E2E tests |

## Files to Modify

| File | Story | Change |
|------|-------|--------|
| `apps/backend/src/subscribers/order-placed.ts` | 3.1, 3.2 | Add email queue + magic link |
| `apps/backend/src/modules/resend/emails/order-placed.tsx` | 3.3 | Add magic link prop |

## Verification Checklist

After completing all stories, verify:

### Functional Tests
```bash
# All email tests pass
cd apps/backend && TEST_TYPE=unit npx jest --testPathPattern="email" --verbose

# Integration tests pass
cd apps/backend && TEST_TYPE=integration npx jest integration-tests/integration/email --verbose
```

### Manual Tests
1. **Guest Order Flow:**
   - [ ] Place order as guest
   - [ ] Receive email within 5 minutes
   - [ ] Email contains order details
   - [ ] Email contains "Modify Your Order" button
   - [ ] Click magic link → order page loads
   - [ ] Can modify order within 1 hour

2. **Registered Customer Flow:**
   - [ ] Place order while logged in
   - [ ] Receive email within 5 minutes
   - [ ] Email contains order details
   - [ ] Email does NOT contain magic link
   - [ ] Email says "log in to view"

3. **Failure Resilience:**
   - [ ] Stop Resend (mock failure)
   - [ ] Place order
   - [ ] Order completes (not blocked)
   - [ ] Check logs for `[EMAIL][ERROR]`
   - [ ] Check DLQ: `redis-cli LRANGE email:dlq 0 -1`

### Code Quality
```bash
# No TypeScript errors
cd apps/backend && pnpm typecheck

# No lint errors
cd apps/backend && pnpm lint

# All tests pass
cd apps/backend && pnpm test
```

## Begin Implementation

### CONFIRMED: Full BullMQ Migration Required

The architectural decision has been made: **BullMQ queue is required**. The existing Medusa Workflow implementation must be replaced.

### Implementation Order

```
4.1 → 1.1 → 1.2 → 2.1 → 2.2 → 2.3 → 1.3 → 3.1 → 3.2 → 4.2 → 4.3 → 3.4
```

**Note:** Story 3.3 is already DONE (template has magic link support).

### Step-by-Step Start

1. **Start with Story 4.1** (PII Masking) - no dependencies
   - Extract existing `maskEmail()` from `apps/backend/src/api/store/orders/[id]/guest-view/route.ts` (lines 120-135)
   - Create: `apps/backend/src/utils/email-masking.ts`
   - Read story: `docs/sprint/sprint-artifacts/email-4-1-create-pii-masking-utility.md`

2. **Then Story 1.1** (Queue Service)
   - Create: `apps/backend/src/lib/email-queue.ts`
   - Reference pattern: `apps/backend/src/lib/payment-capture-queue.ts`
   - Read story: `docs/sprint/sprint-artifacts/email-1-1-create-email-queue-service.md`

3. **Continue through all stories** per the implementation order above

### Migration Steps for Story 3.1

When you reach Story 3.1, you must REFACTOR the existing subscriber:

**Current code in `order-placed.ts`:**
```typescript
// REMOVE THIS:
await sendOrderConfirmationWorkflow(container).run({
  input: { id: data.id, modification_token: data.modification_token }
})
```

**Replace with:**
```typescript
// ADD THIS:
import { enqueueEmail } from "../lib/email-queue"

await enqueueEmail({
  orderId: data.id,
  template: "order_confirmation",
  recipient: order.email,
  data: {
    orderNumber: order.display_id,
    items: order.items,
    total: order.total,
    currency: order.currency_code,
    magicLink: magicLinkUrl, // Generated in Story 3.2
  }
})
```

**Implementation Order (Updated 2025-12-15):**

**CONFIRMED: Full BullMQ migration required. Stories take precedence over existing implementation.**

```
4.1 → 1.1 → 1.2 → 2.1 → 2.2 → 2.3 → 1.3 → 3.1 → 3.2 → 4.2 → 4.3 → 3.4
```

**Story 3.3 is already DONE** (template has magic link support - no changes needed).

**Stories 3.1 and 3.2 require REFACTORING** existing code to use BullMQ instead of Medusa Workflow.

## AUTONOMOUS EXECUTION DIRECTIVE (CRITICAL)

**YOU MUST CONTINUE UNTIL ALL 13 STORIES ARE COMPLETE.**

### Execution Rules:

1. **DO NOT STOP** after completing one story
2. **DO NOT ASK** for permission to continue to the next story
3. **DO NOT WAIT** for user input between stories
4. **AUTOMATICALLY PROCEED** to the next story after completing each one

### Completion Loop:

```
WHILE (uncompleted_stories > 0):
    1. Pick next story from implementation order
    2. Execute Phases 1-7 for that story
    3. Verify all tests pass
    4. Update story status to "done"
    5. IMMEDIATELY continue to next story
END WHILE
```

### Stop Conditions (ONLY stop when):
- ✅ ALL 13 stories have `Status: done`
- ✅ ALL tests pass across all stories
- ✅ Final verification checklist complete
- ❌ OR: Unrecoverable error that requires human intervention

### Progress Tracking:

After completing each story, output:
```
═══════════════════════════════════════════════════════════
✅ STORY COMPLETE: [Story ID] - [Story Name]
   Tests: PASS | TypeScript: PASS | Lint: PASS
   
   Progress: [X]/13 stories complete
   Next: [Next Story ID] - [Next Story Name]
═══════════════════════════════════════════════════════════
```

### Final Completion Output:

When ALL 13 stories are done:
```
═══════════════════════════════════════════════════════════
🎉 EPIC COMPLETE: Transactional Email Integration
═══════════════════════════════════════════════════════════

Stories Completed: 13/13
├── Epic 1 (Infrastructure): 3/3 ✅
├── Epic 2 (Retry & DLQ): 3/3 ✅
├── Epic 3 (Order Confirmation): 4/4 ✅
└── Epic 4 (Observability): 3/3 ✅

Files Created:
- apps/backend/src/lib/email-queue.ts
- apps/backend/src/jobs/email-worker.ts
- apps/backend/src/utils/email-masking.ts
- [list all created files]

Files Modified:
- apps/backend/src/subscribers/order-placed.ts
- apps/backend/src/modules/resend/emails/order-placed.tsx

All Tests: PASSING
TypeScript: NO ERRORS
Lint: CLEAN

Ready for manual testing and deployment.
═══════════════════════════════════════════════════════════
```

### Error Recovery:

If a story fails after multiple attempts:
1. Document the specific error
2. Document what was tried
3. Move to next story IF the blocker is external (e.g., missing dependency)
4. Return to blocked story after completing others
5. If still blocked, output detailed error report and STOP

## Troubleshooting

### Redis Connection Issues
```bash
# Check Redis is running
redis-cli ping
# Should return: PONG

# Check Redis URL in .env
echo $REDIS_URL
```

### BullMQ Worker Not Starting
- Ensure worker is registered in a loader
- Check `apps/backend/src/loaders/` for registration pattern
- Verify Redis connection in worker config

### Tests Timing Out
- Increase timeout for retry tests: `--testTimeout=20000`
- Check if Redis is available during tests
- Mock external services (Resend) in unit tests

### Magic Link Not Working
- Verify `JWT_SECRET` is set (min 32 chars)
- Check `STOREFRONT_URL` is correct
- Verify `ModificationTokenService` is available in container

### Email Not Sending
- Check `RESEND_API_KEY` is valid
- Verify `RESEND_FROM_EMAIL` is verified in Resend
- Check worker logs for errors

## Decision Making & Documentation Protocol

### When Facing Ambiguity or Multiple Options

When the story or architecture doesn't specify exactly how to implement something, follow this protocol:

#### 1. Identify the Decision Point
```
DECISION NEEDED: [Brief description]
Context: [Why this decision is needed]
```

#### 2. List Options with Tradeoffs
```
Option A: [Description]
  ✅ Pros: [List advantages]
  ❌ Cons: [List disadvantages]
  
Option B: [Description]
  ✅ Pros: [List advantages]
  ❌ Cons: [List disadvantages]
  
Option C: [Description]
  ✅ Pros: [List advantages]
  ❌ Cons: [List disadvantages]
```

#### 3. Evaluate Against Criteria
Consider these factors (in priority order):
1. **Alignment with PRD/Architecture** - Does it match documented requirements?
2. **Consistency with existing patterns** - Does it follow codebase conventions?
3. **Simplicity** - Is it the simplest solution that works?
4. **Maintainability** - Will future developers understand it?
5. **Performance** - Does it meet NFR requirements?
6. **Security** - Does it protect PII and follow security rules?

#### 4. Make the Decision
```
DECISION: [Chosen option]
Rationale: [Why this option was chosen]
Tradeoffs Accepted: [What downsides are accepted and why]
```

#### 5. Document in Implementation Log

### Implementation Log File

**Create and maintain:** `docs/sprint/sprint-artifacts/email-implementation-log.md`

This file captures all decisions, deviations, and learnings during implementation.

#### Log File Structure:

```markdown
# Transactional Email Implementation Log

Generated: [Start Date]
Last Updated: [Current Date]
Agent: [Model Name]

## Summary

| Metric | Value |
|--------|-------|
| Stories Completed | X/13 |
| Decisions Made | X |
| Deviations from Spec | X |
| Blockers Encountered | X |

## Decision Log

### DEC-001: [Decision Title]
- **Date:** YYYY-MM-DD
- **Story:** [Story ID]
- **Context:** [Why decision was needed]
- **Options Considered:**
  - Option A: [Description] - [Pros/Cons summary]
  - Option B: [Description] - [Pros/Cons summary]
- **Decision:** [Chosen option]
- **Rationale:** [Why]
- **Impact:** [What this affects]

### DEC-002: ...

## Deviation Log

### DEV-001: [Deviation Title]
- **Date:** YYYY-MM-DD
- **Story:** [Story ID]
- **Specified:** [What the spec said]
- **Implemented:** [What was actually done]
- **Reason:** [Why deviation was necessary]
- **Approved:** [Self-approved / Needs review]

## Blocker Log

### BLK-001: [Blocker Title]
- **Date Encountered:** YYYY-MM-DD
- **Story:** [Story ID]
- **Description:** [What blocked progress]
- **Resolution:** [How it was resolved]
- **Date Resolved:** YYYY-MM-DD
- **Time Lost:** [Estimate]

## Learnings & Notes

### Story-Specific Notes

#### Story 4.1: PII Masking
- [Any implementation notes]
- [Gotchas discovered]
- [Patterns that worked well]

#### Story 1.1: Email Queue
- [Notes...]

## Test Results Summary

| Story | Unit Tests | Integration Tests | TypeScript | Lint |
|-------|------------|-------------------|------------|------|
| 4.1 | ✅ X/X | N/A | ✅ | ✅ |
| 1.1 | ✅ X/X | N/A | ✅ | ✅ |
| ... | ... | ... | ... | ... |

## Files Changed

### Created
- `apps/backend/src/lib/email-queue.ts` (Story 1.1)
- `apps/backend/src/jobs/email-worker.ts` (Story 1.2)
- ...

### Modified
- `apps/backend/src/subscribers/order-placed.ts` (Story 3.1, 3.2)
- ...

## Final Verification

- [ ] All 13 stories complete
- [ ] All tests passing
- [ ] No TypeScript errors
- [ ] No lint errors
- [ ] Manual testing completed
- [ ] Implementation log complete
```

### When to Update the Log

1. **After each decision** - Document immediately
2. **After each deviation** - Document with justification
3. **After each blocker** - Document problem and resolution
4. **After each story completion** - Update summary and test results
5. **At epic completion** - Final verification and summary

### Log File Commands

```bash
# Create the log file at start
touch docs/sprint/sprint-artifacts/email-implementation-log.md

# The agent should write to this file throughout implementation
```

## Git Commit Protocol

### Branch Strategy

```bash
# Create feature branch at start (if not exists)
git checkout -b feature/transactional-email

# All work happens on this branch
```

### Commit After Each Story

After completing each story (all tests pass, self-review done):

```bash
# Stage changes
git add .

# Commit with conventional commit format
git commit -m "feat(email): [Story ID] - [Brief description]

- [Key change 1]
- [Key change 2]
- [Key change 3]

Story: [Story ID]
Tests: All passing"
```

### Commit Message Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**
- `feat` - New feature (most stories)
- `fix` - Bug fix
- `test` - Adding tests
- `refactor` - Code refactoring
- `docs` - Documentation

**Examples:**
```bash
# Story 4.1
git commit -m "feat(email): 4.1 - Add PII masking utility

- Create maskEmail() function
- Handle edge cases (null, short emails, invalid)
- Add unit tests

Story: email-4-1
Tests: 8/8 passing"

# Story 1.1
git commit -m "feat(email): 1.1 - Create email queue service

- Implement BullMQ queue singleton
- Add enqueueEmail() with retry config
- Configure exponential backoff

Story: email-1-1
Tests: 6/6 passing"
```

### Commit Frequency

- **Minimum**: One commit per completed story
- **Optional**: Intermediate commits for large stories
- **Never**: Commit broken code

## Rollback Strategy

### When Something Breaks

If a change breaks previously working functionality:

#### 1. Identify the Breaking Change
```bash
# Check recent changes
git diff HEAD~1

# Check which files changed
git status
```

#### 2. Quick Rollback Options

**Option A: Undo uncommitted changes**
```bash
# Stash current work
git stash

# Test if issue is resolved
pnpm test

# If resolved, the stashed code has the bug
# If not resolved, restore and investigate elsewhere
git stash pop
```

**Option B: Revert last commit**
```bash
# Soft revert (keep changes staged)
git reset --soft HEAD~1

# Hard revert (discard changes)
git reset --hard HEAD~1
```

**Option C: Revert specific file**
```bash
# Restore file to last commit
git checkout HEAD -- path/to/file.ts
```

#### 3. Document in Blocker Log

```markdown
### BLK-XXX: Breaking Change in [Story]
- **Cause:** [What change caused the break]
- **Symptom:** [What test/functionality failed]
- **Resolution:** [How it was fixed]
- **Prevention:** [How to avoid in future]
```

### Recovery Checklist

If you need to recover from a bad state:

1. [ ] `git stash` current work
2. [ ] `git status` to see state
3. [ ] Run all tests to identify what's broken
4. [ ] `git log --oneline -10` to see recent commits
5. [ ] Identify last known good state
6. [ ] Restore to good state
7. [ ] Re-apply changes incrementally
8. [ ] Test after each change

## Dependency Discovery Protocol

### When Existing Code Differs from Expected

If you discover that existing code doesn't match what the story/architecture expects:

#### 1. Document the Discovery
```markdown
DISCOVERY: [What was found]
Expected: [What spec/story said]
Actual: [What code actually does]
Location: [File path and line numbers]
```

#### 2. Assess Impact

**Questions to answer:**
- Does this block the current story?
- Can we work with the existing pattern?
- Does changing it break other things?

#### 3. Decision Matrix

| Situation | Action |
|-----------|--------|
| Existing pattern is better | Adapt story to use existing pattern, document deviation |
| Existing pattern is equivalent | Use existing pattern, no deviation needed |
| Existing pattern is worse but works | Use existing for consistency, note for future refactor |
| Existing pattern is broken | Fix it as part of story, document extensively |
| Existing code doesn't exist | Create as specified in story |

#### 4. Example Scenarios

**Scenario: Redis connection utility has different API**
```
Expected: getRedisConnection() returns IORedis instance
Actual: getRedis() returns { client: IORedis, subscriber: IORedis }

Action: Use getRedis().client instead, document in implementation log
```

**Scenario: Resend service has different method signature**
```
Expected: resendService.send({ to, template, data })
Actual: resendService.sendNotification(type, to, data)

Action: Adapt to actual API, document deviation
```

## Code Review Simulation

### Self-Review as Senior Developer

Before marking any story complete, review code as if you're a senior developer reviewing a PR:

#### Architecture Review
```
□ Does this follow the patterns in architecture doc?
□ Is the file in the correct location?
□ Are dependencies injected correctly (not imported directly)?
□ Is the module boundary respected?
```

#### Code Quality Review
```
□ Single Responsibility: Does each function do one thing?
□ Open/Closed: Can this be extended without modification?
□ DRY: Is there any duplicated code?
□ KISS: Is this the simplest solution?
□ YAGNI: Is there any unnecessary code?
```

#### Naming Review
```
□ Are function names verbs? (getQueue, enqueueEmail, maskEmail)
□ Are variable names descriptive? (not x, temp, data)
□ Are constants UPPER_SNAKE_CASE?
□ Are files kebab-case?
□ Are interfaces/types PascalCase?
```

#### Error Handling Review
```
□ Are all errors caught where appropriate?
□ Are errors logged with context?
□ Are errors re-thrown when needed for retry?
□ Is there no silent failure?
```

#### Code Smell Detection
```
□ No functions > 50 lines
□ No files > 300 lines
□ No deeply nested conditionals (> 3 levels)
□ No magic numbers (use constants)
□ No commented-out code
□ No TODO comments without ticket reference
```

## Performance Sanity Check

### Quick Performance Review

Before completing each story, verify no obvious performance issues:

#### Database/Redis Queries
```
□ No N+1 queries (querying in a loop)
□ Queries use indexes (check query patterns)
□ No unbounded queries (always have limits)
□ Batch operations where possible
```

#### Async Operations
```
□ No blocking calls in event handlers
□ Heavy operations use queue (BullMQ)
□ Promises are awaited or fire-and-forget is intentional
□ No memory leaks (event listeners cleaned up)
```

#### Resource Usage
```
□ Connections are reused (singleton pattern)
□ No new instances created per request
□ Large objects are not held in memory
□ Streams used for large data
```

#### Email-Specific Checks
```
□ Email sending is async (queued)
□ Queue has concurrency limit
□ Retry delays are reasonable (not too aggressive)
□ DLQ prevents infinite retries
```

## Security Checklist

### Per-Story Security Review

#### PII Protection
```
□ Email addresses masked in ALL logs
□ No PII in error messages
□ No PII in job IDs or queue names
□ DLQ entries have masked PII
```

#### Authentication & Authorization
```
□ Magic links use secure tokens (JWT with secret)
□ Tokens have expiration (1 hour)
□ Token validation checks signature AND expiry
□ No sensitive data in URL parameters (except token)
```

#### Input Validation
```
□ Email addresses validated before processing
□ Order IDs validated before use
□ No SQL/NoSQL injection possible
□ No template injection in emails
```

#### Secrets Management
```
□ API keys from environment variables
□ No secrets in code or logs
□ JWT_SECRET is strong (32+ chars)
□ Secrets not in error messages
```

#### Error Handling Security
```
□ Stack traces not exposed to users
□ Internal errors logged, generic message returned
□ No information leakage in error responses
```

## Context Window Management

### When Context Gets Too Long

If you notice degraded performance or context issues:

#### 1. Create Progress Checkpoint
Save current state to implementation log:
```markdown
## Checkpoint: [Timestamp]

### Completed Stories
- [x] 4.1 - PII Masking ✅
- [x] 1.1 - Email Queue ✅
- [ ] 1.2 - Email Worker (IN PROGRESS)

### Current Story State
- Story: 1.2
- Phase: 3 (Testing)
- Files created: email-worker.ts
- Tests: 4/6 passing
- Blockers: None

### Next Steps
1. Fix failing tests for worker event handlers
2. Add DLQ handler
3. Run full test suite
```

#### 2. Summarize and Continue
If starting fresh context:
```
I am implementing the Transactional Email Integration epic.

PROGRESS:
- Stories 4.1, 1.1 complete
- Currently on Story 1.2 (Email Worker)
- 4/6 tests passing

NEXT ACTION:
Fix the 2 failing tests in email-worker.unit.spec.ts

KEY FILES TO READ:
- docs/sprint/sprint-artifacts/email-1-2-create-email-worker.md
- apps/backend/src/jobs/email-worker.ts
- docs/sprint/sprint-artifacts/email-implementation-log.md
```

#### 3. Reload Essential Context
Always reload these files when resuming:
1. Current story file
2. Implementation log (for decisions made)
3. Architecture doc (for patterns)
4. The file you're working on

## Checkpoint System

### Automatic Checkpoints

Create checkpoint after:
- Each story completion
- Each major decision
- Before any risky operation
- Every 30 minutes of work

### Checkpoint Format

Update `email-implementation-log.md` with:

```markdown
## Checkpoint [YYYY-MM-DD HH:MM]

### Progress
- Stories: X/13 complete
- Current: Story [ID] - Phase [N]

### State
- Tests passing: X/Y
- TypeScript: [PASS/FAIL]
- Lint: [PASS/FAIL]

### Files Modified This Session
- [file1.ts] - [what changed]
- [file2.ts] - [what changed]

### Uncommitted Changes
- [List of uncommitted files]

### Next Actions
1. [Next step]
2. [Following step]

### Notes
- [Any important context]
```

### Recovery from Checkpoint

If you need to resume from a checkpoint:

1. Read the latest checkpoint from implementation log
2. Verify file state matches checkpoint
3. Run tests to confirm state
4. Continue from "Next Actions"

## Final Notes

- **Iterate until perfect**: Do not move to next story until current story's tests ALL pass
- **Follow patterns**: Use existing code as reference (payment-capture-queue, fallback-capture)
- **Non-blocking is critical**: Email failures must NEVER block order flows
- **Mask all PII**: Never log raw email addresses
- **Update status**: Mark stories as `done` and update sprint-status.yaml

Good luck! 🚀
