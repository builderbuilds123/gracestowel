# Story 1.1: Create Email Queue Service

Status: done

## Story

As a **developer**,
I want **a BullMQ queue service for email jobs**,
So that **emails can be processed asynchronously without blocking order flows**.

## Acceptance Criteria

### AC1: Queue Singleton Creation

**Given** the backend application starts
**When** the email queue module is loaded
**Then** a BullMQ queue named `email-queue` is created using the existing Redis connection
**And** the queue is a singleton (same instance returned on multiple calls)
**And** the queue uses the Redis connection from `apps/backend/src/lib/redis.ts`

### AC2: Enqueue Function

**Given** a caller invokes `enqueueEmail(payload)`
**When** the payload contains `{ orderId, template, recipient, data }`
**Then** a job is added to the `email-queue` with:
- Job name: `email-{orderId}`
- Job ID: `email-{orderId}` (idempotency key)
- Payload: the full payload object
- Attempts: 3
- Backoff: exponential with 1000ms base delay

### AC3: Type Safety

**Given** the `enqueueEmail` function is called
**When** the payload is missing required fields
**Then** TypeScript compilation fails (type enforcement)

## Technical Requirements

### File to Create

`apps/backend/src/lib/email-queue.ts`

### Reference Pattern

Follow the existing pattern from `apps/backend/src/lib/payment-capture-queue.ts`:

```typescript
import { Queue, Job } from "bullmq"
import { getRedisConnection } from "./redis"

const QUEUE_NAME = "email-queue"

let emailQueue: Queue | null = null

export interface EmailJobPayload {
  orderId: string
  template: "order_confirmation" // extend for future templates
  recipient: string
  data: {
    orderNumber: string | number
    items: Array<{ title: string; quantity: number; unit_price: number }>
    total: number
    currency: string
    magicLink?: string | null
    // extensible for future templates
  }
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
  const queue = getEmailQueue()
  const jobId = `email-${payload.orderId}`
  
  const job = await queue.add(jobId, payload, {
    jobId, // idempotency key
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 1000, // 1s, 2s, 4s
    },
  })
  
  return job
}
```

### Dependencies

- `bullmq` (already installed - used by payment-capture-queue)
- `apps/backend/src/lib/redis.ts` (existing Redis connection utility)

## Tasks / Subtasks

- [x] Create `apps/backend/src/lib/email-queue.ts`
- [x] Define `EmailJobPayload` interface with all required fields
- [x] Implement `getEmailQueue()` singleton function
- [x] Implement `enqueueEmail(payload)` function with job options
- [x] Verify Redis connection import works
- [x] Add JSDoc comments for exported functions

## Testing Requirements

### Unit Tests

Create `apps/backend/integration-tests/unit/email-queue.unit.spec.ts`:

- [x] `getEmailQueue()` returns same instance on multiple calls (singleton)
- [x] `enqueueEmail()` creates job with correct name pattern `email-{orderId}`
- [x] `enqueueEmail()` sets jobId for idempotency
- [x] `enqueueEmail()` configures 3 attempts
- [x] `enqueueEmail()` configures exponential backoff with 1000ms delay
- [x] Job payload contains all fields from input

### Test Command

```bash
cd apps/backend && TEST_TYPE=unit npx jest integration-tests/unit/email-queue.unit.spec.ts
```

## Definition of Done

- [x] File `apps/backend/src/lib/email-queue.ts` exists
- [x] `getEmailQueue()` returns singleton BullMQ Queue instance
- [x] `enqueueEmail()` adds job with correct options (attempts: 3, exponential backoff)
- [x] Job ID uses pattern `email-{orderId}` for idempotency
- [x] `EmailJobPayload` interface exported and typed correctly
- [x] No TypeScript errors (`pnpm typecheck` passes)
- [x] Unit tests pass

## Dev Notes

### Redis Connection

The existing `apps/backend/src/lib/redis.ts` should export a `getRedisConnection()` function. If it doesn't exist or has a different export, check `payment-capture-queue.ts` for the actual pattern used.

### Idempotency

Using `jobId: email-{orderId}` ensures that if the same order triggers multiple email attempts (e.g., retry from subscriber), only one job exists in the queue. BullMQ will reject duplicate jobIds.

### Future Extensibility

The `template` field is typed as a union. When adding new email types (order_modified, order_shipped), extend the union:
```typescript
template: "order_confirmation" | "order_modified" | "order_shipped"
```

## References

- [Payment Capture Queue (pattern)](apps/backend/src/lib/payment-capture-queue.ts)
- [Redis Connection](apps/backend/src/lib/redis.ts)
- [Architecture Doc](docs/product/architecture/transactional-email-architecture.md)
- [BullMQ Docs](https://docs.bullmq.io/)

## Dev Agent Record

### Agent Model Used
Jules

### Completion Notes
Implemented `email-queue.ts` with the Singleton pattern and `enqueueEmail` function.
- Used `payment-capture-queue.ts` as a reference.
- Implemented `getRedisConnection` locally as `apps/backend/src/lib/redis.ts` was not found.
- Added comprehensive unit tests in `apps/backend/integration-tests/unit/email-queue.unit.spec.ts`.

### File List
| File | Change |
|------|--------|
| `apps/backend/src/lib/email-queue.ts` | Created - queue singleton + enqueue function |
| `apps/backend/integration-tests/unit/email-queue.unit.spec.ts` | Created - unit tests |
