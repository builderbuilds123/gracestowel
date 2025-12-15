# Agent Implementation Prompt: Transactional Email Integration

## Mission

Implement the **Transactional Email Integration** feature using a **Test-Driven Development (TDD)** approach. Build a robust, non-blocking email system that delivers order confirmation emails with magic links for guest order access.

**Primary Objective**: Implement all 13 stories across 4 epics, ensuring all tests pass and the system is production-ready.

**Key Deliverable**: A fully functional transactional email system with:
- Async email queue (BullMQ)
- Retry mechanism with exponential backoff
- Dead Letter Queue for failed emails
- Order confirmation emails with magic links for guests
- Comprehensive logging and alerting

## Epic Overview

| Epic | Stories | Goal |
|------|---------|------|
| Epic 1 | 1.1-1.3 | Email Queue Infrastructure |
| Epic 2 | 2.1-2.3 | Retry & Dead Letter Queue |
| Epic 3 | 3.1-3.4 | Order Confirmation Email |
| Epic 4 | 4.1-4.3 | Observability & Security |

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
| Story | File | Description |
|-------|------|-------------|
| 1.1 | `email-1-1-create-email-queue-service.md` | BullMQ queue singleton + enqueueEmail() |
| 1.2 | `email-1-2-create-email-worker.md` | Worker that processes email jobs via Resend |
| 1.3 | `email-1-3-verify-non-blocking-behavior.md` | Ensure email failures never block orders |

### Epic 2: Retry & Dead Letter Queue
| Story | File | Description |
|-------|------|-------------|
| 2.1 | `email-2-1-implement-exponential-backoff-retry.md` | 3x retry with 1s, 2s, 4s delays |
| 2.2 | `email-2-2-implement-dead-letter-queue.md` | Redis list for failed emails |
| 2.3 | `email-2-3-handle-invalid-email-addresses.md` | Skip retry for invalid emails |

### Epic 3: Order Confirmation Email
| Story | File | Description |
|-------|------|-------------|
| 3.1 | `email-3-1-wire-order-placed-subscriber.md` | Add enqueueEmail() to subscriber |
| 3.2 | `email-3-2-generate-magic-link-for-guests.md` | Generate magic link using ModificationTokenService |
| 3.3 | `email-3-3-update-order-confirmation-template.md` | Add magic link to email template |
| 3.4 | `email-3-4-e2e-order-confirmation-flow.md` | Integration tests for complete flow |

### Epic 4: Observability & Security
| Story | File | Description |
|-------|------|-------------|
| 4.1 | `email-4-1-create-pii-masking-utility.md` | maskEmail() for safe logging |
| 4.2 | `email-4-2-add-structured-logging.md` | [EMAIL] namespace logging |
| 4.3 | `email-4-3-add-failure-alerting.md` | [EMAIL][ALERT] for DLQ entries |

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

**Recommended Implementation Order:**
1. Story 4.1 (PII Masking) - No dependencies, needed by others
2. Story 1.1 (Queue Service)
3. Story 1.2 (Worker)
4. Story 2.1 (Retry)
5. Story 2.2 (DLQ)
6. Story 2.3 (Invalid Emails)
7. Story 1.3 (Non-Blocking)
8. Story 3.1 (Subscriber)
9. Story 3.2 (Magic Link)
10. Story 3.3 (Template)
11. Story 4.2 (Logging)
12. Story 4.3 (Alerting)
13. Story 3.4 (E2E Tests)

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

1. **Start with Story 4.1** (PII Masking) - no dependencies
2. Read the story file: `docs/sprint/sprint-artifacts/email-4-1-create-pii-masking-utility.md`
3. Implement the `maskEmail()` utility
4. Write and run tests until ALL pass
5. Update story status to `done`
6. Proceed to Story 1.1

**Implementation Order:**
```
4.1 → 1.1 → 1.2 → 2.1 → 2.2 → 2.3 → 1.3 → 3.1 → 3.2 → 3.3 → 4.2 → 4.3 → 3.4
```

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

## Final Notes

- **Iterate until perfect**: Do not move to next story until current story's tests ALL pass
- **Follow patterns**: Use existing code as reference (payment-capture-queue, fallback-capture)
- **Non-blocking is critical**: Email failures must NEVER block order flows
- **Mask all PII**: Never log raw email addresses
- **Update status**: Mark stories as `done` and update sprint-status.yaml

Good luck! 🚀
