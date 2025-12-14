# Story 4-3: Monitor API Latency and Error Rates

**Epic:** Epic 4 - Production Monitoring & Observability
**Status:** Done
**Prerequisites:** ✅ Story 1.1

---

## User Story

As a developer,
I want to track API request latency and error rates,
So that I can identify backend performance issues and API failures.

---

## Acceptance Criteria

| AC | Given | When | Then |
|----|-------|------|------|
| 1 | The storefront makes an API request to the backend | The request completes (success or failure) | An `api_request` event is captured with URL, method, status, duration, and success/failure |
| 2 | A request fails | The event is sent | The error message is captured for debugging |

---

## Tasks / Subtasks

- [x] Task 1: Create monitoredFetch Utility (AC: 1, 2)
  - [x] Create `monitored-fetch.ts` utility module
  - [x] Implement timing measurement with `performance.now()`
  - [x] Capture request URL, method, status code
  - [x] Calculate and include duration in milliseconds
  - [x] Determine success/failure based on `response.ok`

- [x] Task 2: Handle Error Scenarios (AC: 2)
  - [x] Capture network errors (fetch throws)
  - [x] Extract error messages from non-ok responses
  - [x] Include error_message in event payload

- [x] Task 3: Security & Privacy
  - [x] Sanitize URLs to strip sensitive query params (token, auth, etc.)
  - [x] Add skipTracking option for sensitive requests

- [x] Task 4: Integration with Checkout
  - [x] Update checkout.tsx to use monitoredFetch
  - [x] Add labels for payment-intent and shipping-rates requests

- [x] Task 5: Add Unit Tests
  - [x] Test successful request tracking
  - [x] Test failed request tracking with error message
  - [x] Test network error handling
  - [x] Test URL sanitization
  - [x] Test skipTracking option
  - [x] Test convenience methods (monitoredPost, monitoredGet)

---

## Implementation Details

### PostHog Event Structure

```javascript
posthog.capture('api_request', {
  url: '/api/payment-intent',     // Sanitized URL (no sensitive params)
  method: 'POST',                  // HTTP method
  status: 200,                     // HTTP status code (0 for network errors)
  duration_ms: 150,                // Request duration in milliseconds
  success: true,                   // true if response.ok, false otherwise
  request_path: '/api/payment-intent',  // URL path only
  request_host: 'localhost:3000',       // Host
  label: 'create-payment-intent',       // Optional label for grouping
  error_message: 'Payment failed',      // Only for failed requests
});
```

### Usage

```typescript
import { monitoredFetch, monitoredPost, monitoredGet } from '../utils/monitored-fetch';

// Basic usage
const response = await monitoredFetch('/api/endpoint', {
  method: 'POST',
  body: JSON.stringify(data),
  label: 'my-operation',
});

// Convenience methods
const getResponse = await monitoredGet('/api/data');
const postResponse = await monitoredPost('/api/create', { name: 'test' });

// Skip tracking for sensitive requests
const response = await monitoredFetch('/api/auth', { skipTracking: true });
```

### Monitored Endpoints

| Endpoint | Label | Description |
|----------|-------|-------------|
| `/api/payment-intent` | create-payment-intent / update-payment-intent | Payment initialization |
| `/api/shipping-rates` | fetch-shipping-rates / refetch-shipping-rates | Shipping calculation |

---

## Dev Agent Record

### Context Reference

- `apps/storefront/app/utils/monitored-fetch.ts` - Main utility
- `apps/storefront/app/routes/checkout.tsx` - Integration

### Agent Model Used

Claude Opus 4.5 (via Cursor)

### Completion Notes List

- **Implementation (2025-12-14):**
  - Created `monitoredFetch` utility with timing, error tracking, and PostHog integration
  - Added `monitoredPost` and `monitoredGet` convenience methods
  - Implemented URL sanitization for sensitive query parameters
  - Added `skipTracking` option for sensitive requests
  - Added `label` option for request grouping/filtering
  - Updated checkout.tsx to use monitoredFetch for all API calls

- **Security:** URLs are sanitized before sending to PostHog (strips token, auth, key, secret, password, jwt, session params)

- **Tests Added:** 11 new tests covering all ACs

- **Test Results:** 143 storefront tests pass (0 failures, 0 regressions)

### File List

- `apps/storefront/app/utils/monitored-fetch.ts` - **NEW** - Monitored fetch utility
- `apps/storefront/app/utils/monitored-fetch.test.ts` - **NEW** - Unit tests
- `apps/storefront/app/routes/checkout.tsx` - **MODIFIED** - Use monitoredFetch
- `docs/sprint/sprint-artifacts/4-3-monitor-api-latency-error-rates.md` - **NEW** - Story file
- `docs/sprint/sprint-artifacts/sprint-status.yaml` - **MODIFIED** - Status updated

### Change Log

- 2025-12-14: Implemented monitoredFetch utility, integrated with checkout, added 11 unit tests. All ACs met.
