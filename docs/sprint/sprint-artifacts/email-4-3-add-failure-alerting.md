# Story 4.3: Add Failure Alerting

Status: Drafted

## Story

As a **developer**,
I want **alerts triggered when email failures occur**,
So that **operators are notified of email system issues**.

## Acceptance Criteria

### AC1: DLQ Alert

**Given** an email job moves to DLQ
**When** the DLQ handler runs
**Then** an alert log is created: `[EMAIL][ALERT] Email delivery failed for order {orderId} after 3 attempts`
**And** the alert includes: orderId, template, error message, timestamp

### AC2: Alert Log Format

**Given** an alert is triggered
**When** the log entry is created
**Then** the format is parseable by external alerting tools:
```
[EMAIL][ALERT] Email delivery failed | order={orderId} template={template} error={errorMessage} attempts=3 timestamp={iso8601}
```

### AC3: Alert Log Level

**Given** an alert is triggered
**When** the log entry is created
**Then** it uses `logger.error()` level (not info or warn)

### AC4: Per-Failure Alerting (MVP)

**Given** multiple emails fail
**When** each moves to DLQ
**Then** each DLQ entry triggers an individual alert log
(Rate-based aggregation is post-MVP)

## Technical Requirements

### File to Modify

`apps/backend/src/jobs/email-worker.ts`

### Implementation

```typescript
// In the failed event handler
emailWorker.on("failed", async (job, error) => {
  if (!job) return

  const { orderId, template, recipient } = job.data
  const timestamp = new Date().toISOString()

  // Store in DLQ (existing logic from Story 2.2)
  const dlqEntry = {
    jobId: job.id,
    orderId,
    template,
    recipient: maskEmail(recipient),
    error: error.message,
    failedAt: timestamp,
    attempts: job.attemptsMade,
  }
  await redis.lpush(DLQ_KEY, JSON.stringify(dlqEntry))

  // DLQ log (existing)
  logger.error(`[EMAIL][DLQ] Job ${job.id} moved to DLQ after ${job.attemptsMade} attempts: ${error.message}`)

  // ALERT log (new) - parseable format for external tools
  logger.error(
    `[EMAIL][ALERT] Email delivery failed | ` +
    `order=${orderId} ` +
    `template=${template} ` +
    `error=${error.message.replace(/\|/g, "-")} ` + // Escape pipe chars
    `attempts=${job.attemptsMade} ` +
    `timestamp=${timestamp}`
  )

  // Metric for alerting dashboards
  logger.info(`[METRIC] email_alert order=${orderId} template=${template}`)
})
```

### Alert Log Format Specification

```
[EMAIL][ALERT] Email delivery failed | key1=value1 key2=value2 ...
```

Fields:
- `order` - Medusa order ID
- `template` - Email template name
- `error` - Error message (pipes escaped)
- `attempts` - Number of attempts made
- `timestamp` - ISO 8601 timestamp

### External Alerting Integration

The alert log format enables integration with:
- **Datadog:** Parse `[EMAIL][ALERT]` logs, create monitor
- **PagerDuty:** Trigger on error log pattern
- **Slack:** Webhook on log pattern match
- **CloudWatch:** Metric filter on `[EMAIL][ALERT]`

Example Datadog log query:
```
service:gracestowel-backend "[EMAIL][ALERT]"
```

## Tasks / Subtasks

- [ ] Add alert logging to DLQ handler in `email-worker.ts`
- [ ] Use `logger.error()` level for alerts
- [ ] Format alert with pipe-delimited key=value pairs
- [ ] Include: orderId, template, error, attempts, timestamp
- [ ] Escape pipe characters in error messages
- [ ] Add metric log for alerting dashboards
- [ ] Document alert format for ops team

## Testing Requirements

### Unit Tests

Add to `apps/backend/integration-tests/unit/email-worker.unit.spec.ts`:

- [ ] DLQ handler logs alert with `[EMAIL][ALERT]` prefix
- [ ] Alert log uses `logger.error()` level
- [ ] Alert log includes: orderId, template, error, attempts, timestamp
- [ ] Alert log format is parseable (key=value pairs)
- [ ] Metric log created with `[METRIC] email_alert`

### Test Implementation

```typescript
describe("Failure Alerting", () => {
  it("logs alert when job moves to DLQ", async () => {
    const mockLogger = { error: jest.fn(), info: jest.fn() }
    
    // Trigger DLQ (simulate 3 failures)
    await simulateJobFailure(job, new Error("API Error"))
    
    // Verify alert log
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringMatching(/\[EMAIL\]\[ALERT\].*order=ord_123.*template=order_confirmation/)
    )
  })

  it("alert log is parseable", async () => {
    await simulateJobFailure(job, new Error("API Error"))
    
    const alertLog = mockLogger.error.mock.calls.find(
      call => call[0].includes("[EMAIL][ALERT]")
    )[0]
    
    // Parse key=value pairs
    const parts = alertLog.split("|")[1].trim().split(" ")
    const parsed = Object.fromEntries(
      parts.map(p => p.split("="))
    )
    
    expect(parsed.order).toBe("ord_123")
    expect(parsed.template).toBe("order_confirmation")
    expect(parsed.attempts).toBe("3")
    expect(parsed.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })
})
```

### Test Command

```bash
cd apps/backend && TEST_TYPE=unit npx jest integration-tests/unit/email-worker.unit.spec.ts --grep "alerting"
```

## Definition of Done

- [ ] DLQ handler logs alert with `[EMAIL][ALERT]` prefix
- [ ] Alert log includes: orderId, template, error, attempts, timestamp
- [ ] Alert uses `logger.error()` level (not info)
- [ ] Alert format is parseable by external tools (pipe-delimited key=value)
- [ ] Metric log created for alerting dashboards
- [ ] Integration test: DLQ entry triggers alert log
- [ ] No TypeScript errors

## Dev Notes

### Why Separate Alert Log?

The `[EMAIL][DLQ]` log is for debugging (detailed info).
The `[EMAIL][ALERT]` log is for alerting (structured, parseable).

Both are logged for different purposes:
- DLQ log: Human-readable for investigation
- Alert log: Machine-parseable for automated alerting

### Error Message Escaping

Error messages may contain pipe characters (`|`) which would break parsing. Escape them:
```typescript
error.message.replace(/\|/g, "-")
```

### Post-MVP: Rate-Based Alerting

For MVP, each failure triggers an alert. Post-MVP improvements:
- Aggregate alerts (e.g., "5 failures in last 10 minutes")
- Threshold-based alerting (e.g., ">5% failure rate")
- Alert deduplication

### Ops Documentation

Create runbook for ops team:
1. How to find alert logs
2. How to inspect DLQ
3. How to manually retry failed emails
4. Escalation procedures

## References

- [DLQ Implementation (Story 2.2)](docs/sprint/sprint-artifacts/email-2-2-implement-dead-letter-queue.md)
- [Structured Logging (Story 4.2)](docs/sprint/sprint-artifacts/email-4-2-add-structured-logging.md)
- [Architecture Doc - Alerting](docs/product/architecture/transactional-email-architecture.md)
- [PRD - FR16](docs/product/prds/transactional-email-prd.md)

## Dev Agent Record

_To be filled by implementing agent_

### Agent Model Used
_Model name_

### Completion Notes
_Implementation notes_

### File List
| File | Change |
|------|--------|
| `apps/backend/src/jobs/email-worker.ts` | Modified - added alert logging |

### Change Log
_Code review follow-ups_
