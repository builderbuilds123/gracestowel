# Story 2.2: Implement Dead Letter Queue

Status: done

## Story

As a **developer**,
I want **failed email jobs to be stored in a Dead Letter Queue**,
So that **operators can inspect and manually retry failed emails**.

## Acceptance Criteria

### AC1: DLQ Storage on Final Failure

**Given** an email job has failed all 3 retry attempts
**When** BullMQ fires the `failed` event for the job
**Then** the job data is stored in Redis list with key `email:dlq`

### AC2: DLQ Entry Format

**Given** a job is moved to DLQ
**When** the entry is stored
**Then** it contains:
```json
{
  "jobId": "email-ord_123",
  "orderId": "ord_123",
  "template": "order_confirmation",
  "recipient": "j***@example.com",
  "error": "Resend API error: rate limit exceeded",
  "failedAt": "2025-12-14T10:30:00.000Z",
  "attempts": 3
}
```

### AC3: DLQ Logging

**Given** a job is moved to DLQ
**When** the storage completes
**Then** a log entry is created: `[EMAIL][DLQ] Job {jobId} moved to DLQ after 3 attempts: {error}`

### AC4: Manual DLQ Inspection

**Given** an operator wants to inspect the DLQ
**When** they run `redis-cli LRANGE email:dlq 0 -1`
**Then** they see all failed email jobs as JSON strings

### AC5: PII Masking in DLQ

**Given** a job is stored in DLQ
**When** the entry is created
**Then** the email address is masked (e.g., `j***@example.com`)

## Technical Requirements

### File to Modify

`apps/backend/src/jobs/email-worker.ts`

### Implementation

Add `failed` event handler to the worker:

```typescript
import { Worker, Job } from "bullmq"
import { getRedisConnection } from "../lib/redis"
import { maskEmail } from "../utils/email-masking"

const DLQ_KEY = "email:dlq"

export function startEmailWorker(container: MedusaContainer): Worker {
  const logger = container.resolve("logger")
  const redis = getRedisConnection()

  const emailWorker = new Worker(
    QUEUE_NAME,
    async (job: Job<EmailJobPayload>) => {
      // ... existing processing logic
    },
    { connection: getRedisConnection() }
  )

  // Handle final failure - move to DLQ
  emailWorker.on("failed", async (job, error) => {
    if (!job) return

    const { orderId, template, recipient } = job.data

    const dlqEntry = {
      jobId: job.id,
      orderId,
      template,
      recipient: maskEmail(recipient),
      error: error.message,
      failedAt: new Date().toISOString(),
      attempts: job.attemptsMade,
    }

    try {
      await redis.lpush(DLQ_KEY, JSON.stringify(dlqEntry))
      logger.error(`[EMAIL][DLQ] Job ${job.id} moved to DLQ after ${job.attemptsMade} attempts: ${error.message}`)
    } catch (dlqError) {
      // Even DLQ storage failed - log but don't throw
      logger.error(`[EMAIL][DLQ_ERROR] Failed to store job ${job.id} in DLQ: ${dlqError.message}`)
    }
  })

  return emailWorker
}
```

### Redis Key

- **Key:** `email:dlq`
- **Type:** Redis List (LPUSH to add, LRANGE to read)
- **Value:** JSON stringified DLQ entries

### DLQ Entry Schema

```typescript
interface DLQEntry {
  jobId: string          // BullMQ job ID (email-ord_123)
  orderId: string        // Medusa order ID
  template: string       // Email template name
  recipient: string      // Masked email address
  error: string          // Error message from final failure
  failedAt: string       // ISO 8601 timestamp
  attempts: number       // Number of attempts made (should be 3)
}
```

## Tasks / Subtasks

- [x] Add `failed` event handler to email worker
- [x] Create DLQ entry with all required fields
- [x] Store entry in Redis list `email:dlq` using LPUSH
- [x] Mask email address using `maskEmail()` utility
- [x] Log DLQ storage with `[EMAIL][DLQ]` prefix
- [x] Handle DLQ storage errors gracefully (log, don't throw)

## Testing Requirements

### Unit Tests

Add to `apps/backend/integration-tests/unit/email-worker.unit.spec.ts`:

- [ ] `failed` event handler creates DLQ entry
- [ ] DLQ entry contains all required fields
- [ ] Email address is masked in DLQ entry
- [ ] DLQ entry stored in Redis list `email:dlq`
- [ ] DLQ storage error is logged but doesn't throw

### Integration Tests

Add to `apps/backend/integration-tests/integration/email-dlq.integration.spec.ts`:

- [ ] Job that fails 3 times ends up in DLQ
- [ ] DLQ entry can be retrieved with `LRANGE email:dlq 0 -1`
- [ ] DLQ entry JSON is valid and parseable
- [ ] Multiple failed jobs create multiple DLQ entries

### Manual Verification

```bash
# After triggering a failed email job
redis-cli LRANGE email:dlq 0 -1

# Expected output:
# 1) "{\"jobId\":\"email-ord_123\",\"orderId\":\"ord_123\",\"template\":\"order_confirmation\",\"recipient\":\"j***@example.com\",\"error\":\"API Error\",\"failedAt\":\"2025-12-14T10:30:00.000Z\",\"attempts\":3}"
```

### Test Command

```bash
cd apps/backend && TEST_TYPE=integration npx jest integration-tests/integration/email-dlq.integration.spec.ts
```

## Definition of Done

- [x] Worker has `failed` event handler
- [x] Failed jobs are stored in Redis list `email:dlq`
- [x] DLQ entries contain: jobId, orderId, template, masked recipient, error, failedAt, attempts
- [x] Email addresses are masked in DLQ entries
- [x] Log entry created when job moves to DLQ
- [x] Manual verification: `redis-cli LRANGE email:dlq 0 -1` shows entries
- [x] No TypeScript errors

## Dev Notes

### Why Redis List?

- Simple append-only storage (LPUSH)
- Easy to inspect (LRANGE)
- No additional infrastructure needed
- Can be upgraded to dedicated DLQ service later

### DLQ Cleanup (Post-MVP)

For MVP, DLQ entries persist indefinitely. Post-MVP considerations:
- Add TTL to entries
- Create admin API for DLQ management
- Implement bulk retry functionality

### Error Handling in DLQ Handler

The DLQ handler itself can fail (Redis unavailable). Handle gracefully:
```typescript
try {
  await redis.lpush(DLQ_KEY, JSON.stringify(dlqEntry))
} catch (dlqError) {
  // Log but don't throw - we've already failed, don't make it worse
  logger.error(`[EMAIL][DLQ_ERROR] Failed to store in DLQ: ${dlqError.message}`)
}
```

## References

- [Email Worker (Story 1.2)](docs/sprint/sprint-artifacts/email-1-2-create-email-worker.md)
- [Retry Logic (Story 2.1)](docs/sprint/sprint-artifacts/email-2-1-implement-exponential-backoff-retry.md)
- [PII Masking (Story 4.1)](docs/sprint/sprint-artifacts/email-4-1-create-pii-masking-utility.md)
- [Architecture Doc - DLQ](docs/product/architecture/transactional-email-architecture.md)

## Dev Agent Record

### Agent Model Used
Amelia (Reviewer)

### Completion Notes
- Verified "ghost implementation" of DLQ logic in `apps/backend/src/jobs/email-worker.ts`.
- Added missing unit tests for DLQ content assertions in `apps/backend/integration-tests/unit/email-worker.unit.spec.ts`.
- Created integration test `apps/backend/integration-tests/integration/email-dlq.integration.spec.ts` verifying storage and retrieval.
- Verified tests pass.

### File List
| File | Change |
|------|--------|
| `apps/backend/src/jobs/email-worker.ts` | Verified |
| `apps/backend/integration-tests/unit/email-worker.unit.spec.ts` | Updated |
| `apps/backend/integration-tests/integration/email-dlq.integration.spec.ts` | Created |

### Change Log
- Added missing verification tests.
