# Story 2.3: Handle Invalid Email Addresses

Status: Ready-for-Dev

## Story

As a **developer**,
I want **invalid email addresses to be detected and moved directly to DLQ without retry**,
So that **we don't waste retry attempts on undeliverable emails**.

## Acceptance Criteria

### AC1: Invalid Email Detection

**Given** an email job is being processed
**When** the Resend API returns a 400 error indicating invalid email address
**Then** the job is NOT retried
**And** the job is immediately moved to DLQ with error: `Invalid email address: {maskedEmail}`
**And** a log entry is created: `[EMAIL][INVALID] Invalid email address for order {orderId}, moved to DLQ`

### AC2: Server Errors Retry

**Given** an email job is being processed
**When** the Resend API returns a 5xx error (server error)
**Then** the job IS retried (normal retry flow)

### AC3: Rate Limit Retry

**Given** an email job is being processed
**When** the Resend API returns a 429 error (rate limit)
**Then** the job IS retried (normal retry flow)

### AC4: Network Errors Retry

**Given** an email job is being processed
**When** a network timeout or connection error occurs
**Then** the job IS retried (normal retry flow)

## Technical Requirements

### File to Modify

`apps/backend/src/jobs/email-worker.ts`

### Error Classification Logic

```typescript
function isRetryableError(error: any): boolean {
  // Resend API errors have status codes
  const status = error.statusCode || error.status || error.response?.status
  
  // 4xx errors (except rate limit) are not retryable
  if (status >= 400 && status < 500 && status !== 429) {
    return false
  }
  
  // Check for specific invalid email error messages
  const message = error.message?.toLowerCase() || ""
  if (message.includes("invalid email") || 
      message.includes("invalid recipient") ||
      message.includes("email address is not valid")) {
    return false
  }
  
  // Everything else is retryable (5xx, 429, network errors)
  return true
}

async function moveToDLQDirectly(
  job: Job<EmailJobPayload>, 
  error: Error, 
  redis: Redis, 
  logger: Logger
) {
  const { orderId, template, recipient } = job.data
  
  const dlqEntry = {
    jobId: job.id,
    orderId,
    template,
    recipient: maskEmail(recipient),
    error: `Invalid email address: ${maskEmail(recipient)}`,
    failedAt: new Date().toISOString(),
    attempts: job.attemptsMade + 1,
    reason: "invalid_email",
  }
  
  await redis.lpush(DLQ_KEY, JSON.stringify(dlqEntry))
  logger.warn(`[EMAIL][INVALID] Invalid email address for order ${orderId}, moved to DLQ`)
}
```

### Updated Worker Logic

```typescript
emailWorker = new Worker(
  QUEUE_NAME,
  async (job: Job<EmailJobPayload>) => {
    const { orderId, template, recipient, data } = job.data

    try {
      await resendService.send({ to: recipient, template, data })
      logger.info(`[EMAIL][SENT] Sent ${template} to ${maskEmail(recipient)} for order ${orderId}`)
    } catch (error) {
      // Check if error is retryable
      if (!isRetryableError(error)) {
        // Invalid email - move directly to DLQ, don't retry
        await moveToDLQDirectly(job, error, redis, logger)
        return // Don't throw - job completes (but email not sent)
      }
      
      // Retryable error - throw to trigger BullMQ retry
      logger.error(`[EMAIL][FAILED] Failed ${template} for order ${orderId}: ${error.message}`)
      throw error
    }
  },
  { connection: getRedisConnection() }
)
```

## Tasks / Subtasks

- [ ] Create `isRetryableError(error)` helper function
- [ ] Create `moveToDLQDirectly()` function for immediate DLQ storage
- [ ] Update worker to check error type before throwing
- [ ] For invalid email (400), call `moveToDLQDirectly()` and return (don't throw)
- [ ] For retryable errors (5xx, 429, network), throw to trigger retry
- [ ] Add `reason: "invalid_email"` field to DLQ entries for filtering
- [ ] Log with `[EMAIL][INVALID]` prefix for invalid emails

## Testing Requirements

### Unit Tests

Add to `apps/backend/integration-tests/unit/email-worker.unit.spec.ts`:

- [ ] `isRetryableError()` returns `false` for 400 status
- [ ] `isRetryableError()` returns `false` for "invalid email" message
- [ ] `isRetryableError()` returns `true` for 500 status
- [ ] `isRetryableError()` returns `true` for 429 status
- [ ] `isRetryableError()` returns `true` for network errors
- [ ] Invalid email goes to DLQ without retry
- [ ] Invalid email DLQ entry has `reason: "invalid_email"`
- [ ] 5xx error triggers retry (throws)

### Integration Tests

Add to `apps/backend/integration-tests/integration/email-invalid.integration.spec.ts`:

- [ ] Job with invalid email goes to DLQ after 1 attempt (not 3)
- [ ] Job with 5xx error retries 3 times before DLQ
- [ ] DLQ entries can be filtered by `reason` field

### Test Command

```bash
cd apps/backend && TEST_TYPE=unit npx jest integration-tests/unit/email-worker.unit.spec.ts
```

## Definition of Done

- [ ] Worker detects invalid email errors (Resend 400)
- [ ] Invalid email errors skip retry and go directly to DLQ
- [ ] Retryable errors (5xx, 429, network) trigger normal retry
- [ ] Log entry distinguishes invalid email (`[EMAIL][INVALID]`) from other failures
- [ ] DLQ entries include `reason` field for filtering
- [ ] Unit tests pass for error classification
- [ ] Integration test: invalid email goes to DLQ without retry
- [ ] No TypeScript errors

## Dev Notes

### Why Skip Retry for Invalid Emails?

Invalid email addresses will never succeed, no matter how many times we retry. Retrying wastes:
- Time (7+ seconds of delays)
- Resend API quota
- System resources

### Resend Error Format

Check the actual Resend API error format. It might be:
```typescript
// Option A: HTTP status in error
error.statusCode = 400

// Option B: Nested response
error.response.status = 400

// Option C: Error message only
error.message = "The email address is invalid"
```

Adjust `isRetryableError()` based on actual Resend error structure.

### Job Completion vs Failure

When we detect an invalid email:
- We call `moveToDLQDirectly()` to store in DLQ
- We `return` (not `throw`) so the job completes successfully
- This prevents BullMQ from retrying

The `failed` event handler (Story 2.2) won't fire because the job "succeeded" (from BullMQ's perspective). That's why we need `moveToDLQDirectly()`.

## References

- [Email Worker (Story 1.2)](docs/sprint/sprint-artifacts/email-1-2-create-email-worker.md)
- [DLQ Implementation (Story 2.2)](docs/sprint/sprint-artifacts/email-2-2-implement-dead-letter-queue.md)
- [Resend API Docs](https://resend.com/docs/api-reference/errors)
- [Architecture Doc](docs/product/architecture/transactional-email-architecture.md)

## Dev Agent Record

_To be filled by implementing agent_

### Agent Model Used
_Model name_

### Completion Notes
_Implementation notes_

### File List
| File | Change |
|------|--------|
| `apps/backend/src/jobs/email-worker.ts` | Modified - error classification, direct DLQ |

### Change Log
_Code review follow-ups_
