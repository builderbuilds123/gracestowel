# Story 1.3: Verify Non-Blocking Behavior

Status: Ready-for-Dev

## Story

As a **developer**,
I want **to verify that email queue operations never block order processing**,
So that **order flows complete even if email infrastructure has issues**.

## Acceptance Criteria

### AC1: Queue Failure Handling

**Given** the `enqueueEmail()` function is called
**When** Redis is unavailable or the queue operation fails
**Then** the error is caught and logged: `[EMAIL][ERROR] Failed to queue email for order {orderId}: {error.message}`
**And** the calling function does NOT throw (returns gracefully)
**And** the order processing continues uninterrupted

### AC2: Return Type

**Given** `enqueueEmail()` is called
**When** the operation succeeds
**Then** it returns `Promise<Job>`
**When** the operation fails
**Then** it returns `Promise<null>` (not throwing)

### AC3: Worker Failure Isolation

**Given** the email worker is processing a job
**When** the job fails after all retries
**Then** the failure is logged but does NOT affect any other system operations
**And** the order that triggered the email remains in its current state (not rolled back)

## Technical Requirements

### File to Modify

`apps/backend/src/lib/email-queue.ts`

### Updated Implementation

```typescript
import { Queue, Job } from "bullmq"
import { getRedisConnection } from "./redis"

const QUEUE_NAME = "email-queue"
let emailQueue: Queue | null = null
let logger: any = console // Will be set by init function

export function initEmailQueue(container: MedusaContainer) {
  logger = container.resolve("logger")
}

export function getEmailQueue(): Queue {
  if (!emailQueue) {
    emailQueue = new Queue(QUEUE_NAME, {
      connection: getRedisConnection(),
    })
  }
  return emailQueue
}

export async function enqueueEmail(payload: EmailJobPayload): Promise<Job | null> {
  try {
    const queue = getEmailQueue()
    const jobId = `email-${payload.orderId}`
    
    const job = await queue.add(jobId, payload, {
      jobId,
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 1000,
      },
    })
    
    logger.info(`[EMAIL][QUEUE] Enqueued ${payload.template} for order ${payload.orderId}`)
    return job
  } catch (error) {
    // CRITICAL: Catch all errors - never throw from email queue
    logger.error(`[EMAIL][ERROR] Failed to queue email for order ${payload.orderId}: ${error.message}`)
    return null
  }
}
```

### Key Changes

1. **Try/catch wrapper** around entire `enqueueEmail()` function
2. **Return `null` on failure** instead of throwing
3. **Logger initialization** via `initEmailQueue()` for proper Medusa logging
4. **Success logging** with `[EMAIL][QUEUE]` prefix

## Tasks / Subtasks

- [ ] Modify `apps/backend/src/lib/email-queue.ts` to wrap `queue.add()` in try/catch
- [ ] Change return type to `Promise<Job | null>`
- [ ] Add error logging with `[EMAIL][ERROR]` prefix
- [ ] Add success logging with `[EMAIL][QUEUE]` prefix
- [ ] Add `initEmailQueue(container)` function for logger setup
- [ ] Create integration tests for failure scenarios

## Testing Requirements

### Unit Tests

Add to `apps/backend/integration-tests/unit/email-queue.unit.spec.ts`:

- [ ] `enqueueEmail()` returns `null` when Redis connection fails
- [ ] `enqueueEmail()` logs error with `[EMAIL][ERROR]` prefix on failure
- [ ] `enqueueEmail()` does NOT throw when queue.add() fails
- [ ] `enqueueEmail()` returns `Job` on success
- [ ] `enqueueEmail()` logs success with `[EMAIL][QUEUE]` prefix

### Integration Tests

Create `apps/backend/integration-tests/integration/email-non-blocking.integration.spec.ts`:

- [ ] Order completes successfully when Redis is unavailable
- [ ] Order completes successfully when email worker throws
- [ ] Order state is not affected by email failures

### Test Scenarios

**Scenario 1: Redis Unavailable**
```typescript
// Mock Redis to throw connection error
// Call enqueueEmail()
// Assert: returns null, no exception thrown
// Assert: log contains [EMAIL][ERROR]
```

**Scenario 2: Order Flow Continues**
```typescript
// Create order via API
// Mock email queue to fail
// Assert: order created successfully
// Assert: order status is correct
// Assert: email failure logged but order not affected
```

### Test Command

```bash
cd apps/backend && TEST_TYPE=integration npx jest integration-tests/integration/email-non-blocking.integration.spec.ts
```

## Definition of Done

- [ ] `enqueueEmail()` catches all errors and returns `null` on failure
- [ ] `enqueueEmail()` logs errors with `[EMAIL][ERROR]` prefix
- [ ] `enqueueEmail()` logs success with `[EMAIL][QUEUE]` prefix
- [ ] Order processing code does not await email result or check for success
- [ ] Integration test: order completes when Redis is unavailable
- [ ] Integration test: order completes when email worker throws
- [ ] No TypeScript errors (`pnpm typecheck` passes)

## Dev Notes

### Non-Blocking Pattern

This is the **critical architectural principle** for the email system. Email failures must NEVER:
- Block order creation
- Cause order rollback
- Return errors to the customer
- Affect payment processing

The pattern is: **fire and forget with logging**.

### Caller Responsibility

Code that calls `enqueueEmail()` should NOT:
```typescript
// ❌ WRONG - checking result
const job = await enqueueEmail(payload)
if (!job) {
  throw new Error("Email failed") // DON'T DO THIS
}

// ✅ CORRECT - fire and forget
await enqueueEmail(payload) // Result ignored
```

### Logger Initialization

Call `initEmailQueue(container)` in a Medusa loader to set up the logger:
```typescript
// apps/backend/src/loaders/email-queue-loader.ts
export default async function emailQueueLoader({ container }) {
  initEmailQueue(container)
}
```

## References

- [Email Queue (Story 1.1)](docs/sprint/sprint-artifacts/email-1-1-create-email-queue-service.md)
- [Architecture Doc - Non-Blocking Pattern](docs/product/architecture/transactional-email-architecture.md)
- [PRD - NFR10](docs/product/prds/transactional-email-prd.md)

## Dev Agent Record

_To be filled by implementing agent_

### Agent Model Used
_Model name_

### Completion Notes
_Implementation notes_

### File List
| File | Change |
|------|--------|
| `apps/backend/src/lib/email-queue.ts` | Modified - added try/catch, null return |
| `apps/backend/src/loaders/email-queue-loader.ts` | Created - logger initialization |

### Change Log
_Code review follow-ups_
