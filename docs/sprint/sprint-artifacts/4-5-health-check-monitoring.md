# Story 4-5: Health Check Monitoring

**Epic:** Epic 4 - Production Monitoring & Observability
**Status:** Done
**Prerequisites:** ✅ Story 2.1 (PostHog backend SDK setup)

---

## User Story

As a developer,
I want to implement automated health checks that report to PostHog,
So that I can detect system outages quickly.

---

## Acceptance Criteria

| AC | Given | When | Then |
|----|-------|------|------|
| 1 | A health check endpoint exists at `/health` on the backend | The health check runs | Database and Redis connectivity are verified |
| 2 | The health check completes | The event is sent | A `health_check` event is sent to PostHog with status (healthy/unhealthy) and response time |
| 3 | A health check fails | The endpoint returns | Error details are included in the response and PostHog event |

---

## Tasks / Subtasks

- [x] Task 1: Enhance Health Endpoint (AC: 1, 2, 3)
  - [x] Add database connectivity check via Medusa query
  - [x] Add Redis connectivity check via ioredis
  - [x] Calculate and include response_time_ms
  - [x] Return healthy/unhealthy status based on checks

- [x] Task 2: PostHog Integration (AC: 2, 3)
  - [x] Send health_check event with status
  - [x] Include response_time_ms in event
  - [x] Include database_status, redis_status
  - [x] Include error details when unhealthy

- [x] Task 3: Error Handling (AC: 3)
  - [x] Return 503 status when unhealthy
  - [x] Include error array in response
  - [x] Log warnings for failed checks

- [x] Task 4: Add Unit Tests
  - [x] Test healthy status response
  - [x] Test response_time_ms inclusion
  - [x] Test database connectivity check
  - [x] Test unhealthy status on database failure
  - [x] Test PostHog event capture
  - [x] Test error details in PostHog event
  - [x] Test Redis not configured handling
  - [x] Test logging

---

## Implementation Details

### Health Check Response Structure

```typescript
interface HealthCheckResult {
  status: 'healthy' | 'unhealthy';
  service: string;
  timestamp: string;
  response_time_ms: number;
  checks: {
    database: { status: 'ok' | 'error'; latency_ms?: number; error?: string };
    redis: { status: 'ok' | 'error' | 'not_configured'; latency_ms?: number; error?: string };
  };
  errors?: string[];
}
```

### Example Responses

**Healthy (200):**
```json
{
  "status": "healthy",
  "service": "medusa-backend",
  "timestamp": "2024-12-14T01:15:00.000Z",
  "response_time_ms": 45,
  "checks": {
    "database": { "status": "ok", "latency_ms": 12 },
    "redis": { "status": "ok", "latency_ms": 8 }
  }
}
```

**Unhealthy (503):**
```json
{
  "status": "unhealthy",
  "service": "medusa-backend",
  "timestamp": "2024-12-14T01:15:00.000Z",
  "response_time_ms": 5023,
  "checks": {
    "database": { "status": "error", "latency_ms": 5000, "error": "Connection timeout" },
    "redis": { "status": "ok", "latency_ms": 8 }
  },
  "errors": ["Database: Connection timeout"]
}
```

### PostHog Event

```javascript
posthog.capture({
  distinctId: 'system_health_check',
  event: 'health_check',
  properties: {
    status: 'healthy' | 'unhealthy',
    service: 'medusa-backend',
    response_time_ms: 45,
    database_status: 'ok' | 'error',
    database_latency_ms: 12,
    redis_status: 'ok' | 'error' | 'not_configured',
    redis_latency_ms: 8,
    error_count: 0,
    errors: undefined | ['...'],
    timestamp: '...'
  }
});
```

---

## Dev Agent Record

### Context Reference

- `apps/backend/src/api/health/route.ts` - Health endpoint

### Agent Model Used

Claude Opus 4.5 (via Cursor)

### Completion Notes List

- **Implementation (2025-12-14):**
  - Enhanced existing `/health` endpoint with comprehensive checks
  - Added database connectivity check via Medusa query (regions)
  - Added Redis connectivity check via ioredis
  - Returns 200 for healthy, 503 for unhealthy
  - Includes detailed latency and error information
  - Replaced console.log with structured logger
  - Reports to PostHog with full status and timing

- **Note:** Redis returns `not_configured` if REDIS_URL is not set (still healthy)

- **Tests Added:** 8 new unit tests covering all ACs

- **Test Results:** 286 backend unit tests pass (0 failures, 0 regressions)

### File List

- `apps/backend/src/api/health/route.ts` - **MODIFIED** - Enhanced health check
- `apps/backend/integration-tests/unit/health-check.unit.spec.ts` - **NEW** - Unit tests
- `docs/sprint/sprint-artifacts/4-5-health-check-monitoring.md` - **NEW** - Story file
- `docs/sprint/sprint-artifacts/sprint-status.yaml` - **MODIFIED** - Status updated

### Change Log

- 2025-12-14: Enhanced health endpoint with DB/Redis checks, response timing, PostHog integration, and error handling. Added 8 unit tests. All ACs met.
