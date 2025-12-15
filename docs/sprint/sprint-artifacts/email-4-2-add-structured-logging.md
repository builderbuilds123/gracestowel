# Story 4.2: Add Structured Logging Throughout Email Flow

Status: Ready-for-Dev

## Story

As a **developer**,
I want **structured logging at every step of the email flow**,
So that **operators can diagnose issues and monitor email health**.

## Acceptance Criteria

### AC1: Queue Logging

**Given** an email job is enqueued
**When** `enqueueEmail()` succeeds
**Then** log: `[EMAIL][QUEUE] Enqueued {template} for order {orderId} to {maskedEmail}`

### AC2: Processing Logging

**Given** an email job is picked up by the worker
**When** processing begins
**Then** log: `[EMAIL][PROCESS] Processing {template} for order {orderId}, attempt {attemptsMade}/3`

### AC3: Success Logging

**Given** an email is sent successfully
**When** Resend API returns success
**Then** log: `[EMAIL][SENT] Sent {template} to {maskedEmail} for order {orderId}`
**And** log metric: `[METRIC] email_sent template={template} order={orderId}`

### AC4: Failure Logging

**Given** an email send fails
**When** Resend API returns error
**Then** log: `[EMAIL][FAILED] Failed {template} for order {orderId}: {error.message}`
**And** log metric: `[METRIC] email_failed template={template} order={orderId} error={error.code}`

### AC5: DLQ Logging

**Given** an email job moves to DLQ
**When** all retries exhausted
**Then** log: `[EMAIL][DLQ] Job {jobId} moved to DLQ after {attempts} attempts`
**And** log metric: `[METRIC] email_dlq template={template} order={orderId}`

## Technical Requirements

### Files to Update

- `apps/backend/src/lib/email-queue.ts`
- `apps/backend/src/jobs/email-worker.ts`

### Logging Pattern

```typescript
import { maskEmail } from "../utils/email-masking"

// Get logger from Medusa container
const logger = container.resolve("logger")

// Queue logging
logger.info(`[EMAIL][QUEUE] Enqueued ${template} for order ${orderId} to ${maskEmail(recipient)}`)

// Processing logging
logger.info(`[EMAIL][PROCESS] Processing ${template} for order ${orderId}, attempt ${attemptsMade + 1}/3`)

// Success logging
logger.info(`[EMAIL][SENT] Sent ${template} to ${maskEmail(recipient)} for order ${orderId}`)
logger.info(`[METRIC] email_sent template=${template} order=${orderId}`)

// Failure logging
logger.error(`[EMAIL][FAILED] Failed ${template} for order ${orderId}: ${error.message}`)
logger.info(`[METRIC] email_failed template=${template} order=${orderId} error=${error.code || "unknown"}`)

// DLQ logging
logger.error(`[EMAIL][DLQ] Job ${jobId} moved to DLQ after ${attempts} attempts`)
logger.info(`[METRIC] email_dlq template=${template} order=${orderId}`)
```

### Log Levels

| Event | Level | Prefix |
|-------|-------|--------|
| Queue success | info | `[EMAIL][QUEUE]` |
| Processing start | info | `[EMAIL][PROCESS]` |
| Send success | info | `[EMAIL][SENT]` |
| Send failure | error | `[EMAIL][FAILED]` |
| DLQ move | error | `[EMAIL][DLQ]` |
| Metrics | info | `[METRIC]` |

### Metric Log Format

Metrics use key=value format for easy parsing:
```
[METRIC] email_sent template=order_confirmation order=ord_123
[METRIC] email_failed template=order_confirmation order=ord_123 error=rate_limit
[METRIC] email_dlq template=order_confirmation order=ord_123
```

## Tasks / Subtasks

- [ ] Update `email-queue.ts` with queue logging
- [ ] Update `email-worker.ts` with processing/success/failure logging
- [ ] Update DLQ handler with DLQ logging
- [ ] Add metric logs for all events
- [ ] Ensure all email addresses use `maskEmail()`
- [ ] Use correct log levels (info vs error)
- [ ] Verify logs appear in console/log files

## Testing Requirements

### Unit Tests

Add to existing test files:

- [ ] Queue enqueue logs with `[EMAIL][QUEUE]`
- [ ] Worker processing logs with `[EMAIL][PROCESS]`
- [ ] Success logs with `[EMAIL][SENT]` and `[METRIC]`
- [ ] Failure logs with `[EMAIL][FAILED]` and `[METRIC]`
- [ ] DLQ logs with `[EMAIL][DLQ]` and `[METRIC]`
- [ ] All email addresses are masked in logs

### Log Verification

```typescript
// Mock logger
const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}

// After operation
expect(mockLogger.info).toHaveBeenCalledWith(
  expect.stringContaining("[EMAIL][QUEUE]")
)
expect(mockLogger.info).toHaveBeenCalledWith(
  expect.stringContaining("[METRIC] email_sent")
)
```

### Test Command

```bash
cd apps/backend && TEST_TYPE=unit npx jest --grep "logging"
```

## Definition of Done

- [ ] Queue enqueue logged with `[EMAIL][QUEUE]`
- [ ] Worker processing logged with `[EMAIL][PROCESS]`
- [ ] Success logged with `[EMAIL][SENT]` and `[METRIC]`
- [ ] Failure logged with `[EMAIL][FAILED]` and `[METRIC]`
- [ ] DLQ logged with `[EMAIL][DLQ]` and `[METRIC]`
- [ ] All email addresses masked in logs
- [ ] Logs include orderId, template, attempt count where relevant
- [ ] Metric logs use key=value format
- [ ] No TypeScript errors

## Dev Notes

### Log Namespacing

All email logs use `[EMAIL]` prefix for easy filtering:
```bash
# Filter email logs
grep "\[EMAIL\]" app.log

# Filter email metrics
grep "\[METRIC\] email_" app.log
```

### Metric Parsing

The key=value format enables easy parsing:
```bash
# Count emails sent
grep "\[METRIC\] email_sent" app.log | wc -l

# Find failed emails for specific order
grep "\[METRIC\] email_failed.*order=ord_123" app.log
```

### Logger Initialization

The logger must be resolved from the Medusa container:
```typescript
const logger = container.resolve("logger")
```

For the email queue (which may not have container access), use the `initEmailQueue(container)` pattern from Story 1.3.

### PII Protection

**Critical:** Never log raw email addresses. Always use `maskEmail()`:
```typescript
// ❌ WRONG
logger.info(`Sent to ${recipient}`)

// ✅ CORRECT
logger.info(`Sent to ${maskEmail(recipient)}`)
```

## References

- [PII Masking (Story 4.1)](docs/sprint/sprint-artifacts/email-4-1-create-pii-masking-utility.md)
- [Email Queue (Story 1.1)](docs/sprint/sprint-artifacts/email-1-1-create-email-queue-service.md)
- [Email Worker (Story 1.2)](docs/sprint/sprint-artifacts/email-1-2-create-email-worker.md)
- [Architecture Doc - Logging](docs/product/architecture/transactional-email-architecture.md)

## Dev Agent Record

_To be filled by implementing agent_

### Agent Model Used
_Model name_

### Completion Notes
_Implementation notes_

### File List
| File | Change |
|------|--------|
| `apps/backend/src/lib/email-queue.ts` | Modified - added logging |
| `apps/backend/src/jobs/email-worker.ts` | Modified - added logging |

### Change Log
_Code review follow-ups_
