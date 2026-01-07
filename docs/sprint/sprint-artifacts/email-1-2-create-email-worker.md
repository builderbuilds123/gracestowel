# Story 1.2: Create Email Worker

Status: done

## Story

As a **developer**,
I want **a BullMQ worker that processes email jobs**,
So that **queued emails are sent via Resend**.

## Acceptance Criteria

### AC1: Worker Creation

**Given** the backend application starts
**When** the email worker module is loaded
**Then** a BullMQ worker is created that listens to the `email-queue`
**And** the worker uses the same Redis connection as the queue

### AC2: Job Processing - Success

**Given** a job exists in the `email-queue`
**When** the worker picks up the job
**Then** the worker extracts `{ orderId, template, recipient, data }` from job payload
**And** the worker calls the existing Resend notification provider service to send the email
**And** on success, the worker logs: `[EMAIL][SENT] Sent {template} to {maskedEmail} for order {orderId}`

### AC3: Job Processing - Failure

**Given** the Resend API call fails
**When** the worker catches the error
**Then** the worker throws the error (BullMQ handles retry automatically)
**And** the worker logs: `[EMAIL][FAILED] Failed {template} for order {orderId}: {error.message}`

### AC4: Worker Startup

**Given** the Medusa backend starts
**When** all modules are loaded
**Then** the email worker is automatically started and listening for jobs

## Technical Requirements

### File to Create

`apps/backend/src/jobs/email-worker.ts`

### Reference Pattern

Follow the existing pattern from `apps/backend/src/jobs/fallback-capture.ts`:

```typescript
import { Worker, Job } from "bullmq"
import { getRedisConnection } from "../lib/redis"
import { getEmailQueue, EmailJobPayload } from "../lib/email-queue"
import { maskEmail } from "../utils/email-masking"

const QUEUE_NAME = "email-queue"

let emailWorker: Worker | null = null

export function startEmailWorker(container: MedusaContainer): Worker {
  if (emailWorker) {
    return emailWorker
  }

  const logger = container.resolve("logger")
  const resendService = container.resolve("resendNotificationProviderService")

  emailWorker = new Worker(
    QUEUE_NAME,
    async (job: Job<EmailJobPayload>) => {
      const { orderId, template, recipient, data } = job.data
      const maskedRecipient = maskEmail(recipient)

      logger.info(`[EMAIL][PROCESS] Processing ${template} for order ${orderId}, attempt ${job.attemptsMade + 1}/3`)

      try {
        // Call Resend service to send email
        await resendService.send({
          to: recipient,
          template: template,
          data: data,
        })

        logger.info(`[EMAIL][SENT] Sent ${template} to ${maskedRecipient} for order ${orderId}`)
      } catch (error) {
        logger.error(`[EMAIL][FAILED] Failed ${template} for order ${orderId}: ${error.message}`)
        throw error // Re-throw to trigger BullMQ retry
      }
    },
    {
      connection: getRedisConnection(),
      concurrency: 5, // Process up to 5 emails concurrently
    }
  )

  // Log worker events
  emailWorker.on("completed", (job) => {
    logger.info(`[EMAIL][COMPLETE] Job ${job.id} completed`)
  })

  emailWorker.on("failed", (job, error) => {
    logger.error(`[EMAIL][JOB_FAILED] Job ${job?.id} failed: ${error.message}`)
  })

  return emailWorker
}
```

### Worker Registration

The worker must be started when Medusa boots. Options:

1. **Loader approach** (preferred): Create `apps/backend/src/loaders/email-worker-loader.ts`
2. **Jobs index**: Add to `apps/backend/src/jobs/index.ts` if it exists

Check existing patterns in `apps/backend/src/loaders/` for how workers are started.

### Dependencies

- `bullmq` (already installed)
- `apps/backend/src/lib/email-queue.ts` (Story 1.1)
- `apps/backend/src/utils/email-masking.ts` (Story 4.1 - can stub initially)
- `apps/backend/src/modules/resend/service.ts` (existing Resend service)

## Tasks / Subtasks

- [x] Create `apps/backend/src/jobs/email-worker.ts`
- [x] Implement worker that processes `email-queue` jobs
- [x] Resolve Resend service from Medusa container
- [x] Call Resend service `send()` method with correct parameters
- [x] Add logging for processing, success, and failure
- [x] Register worker to start on Medusa boot (loader or jobs index)
- [x] Verify worker starts when running `pnpm dev`

## Testing Requirements

### Unit Tests

Create `apps/backend/integration-tests/unit/email-worker.unit.spec.ts`:

- [x] Worker processes job and calls Resend service
- [x] Worker logs success with masked email
- [x] Worker logs failure with error message
- [x] Worker throws on Resend failure (enables retry)
- [x] Worker logs attempt number correctly

### Integration Tests

- [ ] Worker picks up job from queue within 5 seconds
- [ ] Worker retries on failure (verify job.attemptsMade increments)

### Test Command

```bash
cd apps/backend && TEST_TYPE=unit npx jest integration-tests/unit/email-worker.unit.spec.ts
```

## Definition of Done

- [x] File `apps/backend/src/jobs/email-worker.ts` exists
- [x] Worker processes jobs from `email-queue`
- [x] Worker calls Resend service to send emails
- [x] Worker logs success with masked email address
- [x] Worker logs failure with error message
- [x] Worker throws on failure (enables BullMQ retry)
- [x] Worker starts when Medusa application boots
- [x] No TypeScript errors (`pnpm typecheck` passes)

## Dev Notes

### Resend Service Integration

The existing Resend service is at `apps/backend/src/modules/resend/service.ts`. Check its interface:
- Method name might be `send()`, `sendEmail()`, or `sendNotification()`
- Parameters might differ from the example above
- Review the service file to understand the correct API

### Email Masking Dependency

Story 4.1 creates the `maskEmail()` utility. For this story:
- Option A: Implement Story 4.1 first
- Option B: Create a simple stub: `const maskEmail = (e: string) => e.replace(/^(.{2}).*@/, '$1***@')`

### Concurrency

Set `concurrency: 5` to process multiple emails in parallel. Adjust based on Resend rate limits (default: 100/second for paid plans).

## References

- Fallback Capture Job (pattern): `apps/backend/src/jobs/fallback-capture.ts`
- Resend Service: `apps/backend/src/modules/resend/service.ts`
- [Email Queue (Story 1.1)](./email-1-1-create-email-queue-service.md)
- [Architecture Doc](../../product/architecture/transactional-email-architecture.md)

## Dev Agent Record

### Agent Model Used
Amelia (Reviewer)

### Completion Notes
- Verified existing implementation of `apps/backend/src/jobs/email-worker.ts`.
- Created missing unit tests in `apps/backend/integration-tests/unit/email-worker.unit.spec.ts`.
- Verified tests pass.
- Verified implementation meets ACs.
- Noted massive scope creep (Stories 1.2, 1.3, 2.x, 4.x implemented in one file).

### File List
| File | Change |
|------|--------|
| `apps/backend/src/jobs/email-worker.ts` | Verified |
| `apps/backend/src/loaders/email-worker.ts` | Verified |
| `apps/backend/src/loaders/index.ts` | Modified - added emailWorkerLoader registration |
| `apps/backend/integration-tests/unit/email-worker.unit.spec.ts` | Updated with Story 1.2 tests |

### Change Log
- Added missing unit tests for Story 1.2.
- Updated File List to include loader files.
- Updated Testing Requirements checkboxes to reflect test coverage.
- Note: Implementation includes scope from future stories (2.2 DLQ, 2.3 invalid email handling, 4.3 alerting).
