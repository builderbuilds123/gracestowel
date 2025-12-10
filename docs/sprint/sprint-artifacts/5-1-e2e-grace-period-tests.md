# Story 5.1: E2E Grace Period Tests

Status: Done

## Story

As a QA Engineer,
I want an automated test suite that simulates the 1-hour grace period,
so that we can verify the "Edit Button" disappears and capture triggers correctly.

## Acceptance Criteria

### AC1: Timer Visibility & Expiration

1. **Given** a test order is placed via checkout  
   **When** the order confirmation page loads  
   **Then** the "Edit Order" button MUST be visible  
   **And** a countdown timer (`role="timer"`) MUST be displayed

2. **Given** the countdown timer reaches 0 (simulated via short TTL)  
   **When** the timer expires  
   **Then** the "Edit Order" button MUST be hidden  
   **And** the order status MUST change to "Processing"

### AC2: Magic Link & Session Persistence

3. **Given** a guest user accesses an order via Magic Link  
   **When** the JWT token TTL has expired (via short `PAYMENT_CAPTURE_DELAY_MS` / 1000)  
   **Then** attempting to use the Magic Link MUST redirect to "Link Expired" page

4. **Given** a guest accesses via valid Magic Link  
   **When** the page loads successfully  
   **Then** cookie `guest_order_{order_id}` MUST be set with:
   - `httpOnly: true`, `secure: true`, `sameSite: strict`
   - `path: /order/status/{order_id}`
   - `maxAge` calculated from JWT `exp` claim (dynamic, not hardcoded)

### AC3: Capture Job Trigger (BullMQ Wiring)

5. **Given** a test order is placed with a BullMQ capture job queued  
   **When** the job delay elapses (via short `PAYMENT_CAPTURE_DELAY_MS`)  
   **Then** the `processPaymentCapture` worker SHOULD execute  
   **And** the order `metadata.payment_captured_at` SHOULD be set

### AC4: Edit Actions During Grace Period

6. **Given** a guest is on the order status page within the grace period  
   **When** they attempt to cancel  
   **Then** the Stripe authorization MUST be voided  
   **And** the order status MUST update to `canceled`

## Tasks / Subtasks

- [x] **Backend: Enable Short TTL for Test Environment** (AC: 1-5)
  - [x] File: `apps/backend/src/lib/payment-capture-queue.ts` (L52-56)
  - [x] Verify `PAYMENT_CAPTURE_DELAY_MS` env var works for BullMQ job delay
  - [x] File: `apps/backend/src/services/modification-token.ts` (L28, L67)
  - [x] **Change:** Update service to use `PAYMENT_CAPTURE_DELAY_MS` (in seconds) as source of truth
  - [x] Logic: `const windowSeconds = (process.env.PAYMENT_CAPTURE_DELAY_MS ? parseInt(process.env.PAYMENT_CAPTURE_DELAY_MS)/1000 : 3600)`
  - [x] Test config files: `apps/backend/.env.test`, `apps/e2e/.env` set `PAYMENT_CAPTURE_DELAY_MS=10000`

- [x] **E2E: Grace Period Timer UI Tests** (AC: 1, 2)
  - [x] Create `apps/e2e/tests/grace-period.spec.ts`
  - [x] Follow patterns from `apps/e2e/tests/checkout.spec.ts`
  - [x] Selectors: `role="timer"`, text `/being processed/`
  - [x] Tests use `test.skip()` when env vars missing (not `test.fixme()`)

- [x] **E2E: Magic Link & Cookie Persistence Tests** (AC: 3, 4)
  - [x] Test: Valid JWT grants access
  - [x] Test: Expired JWT shows "Link Expired" page
  - [x] Test: Cookie `guest_order_{id}` set with correct attributes
  - [x] Test: Cookie path scoped to `/order/status/{id}`
  - [x] Test: Page refresh uses cookie (not URL token)

- [x] **Backend Integration: Capture Wiring Test** (AC: 5)
  - [x] Extend `apps/backend/integration-tests/unit/payment-capture-queue.unit.spec.ts`
  - [x] Add test: `schedulePaymentCapture()` → worker invoked → metadata set

- [x] **E2E: Cancel Order Tests** (AC: 6)
  - [x] Test: Cancel succeeds during grace period
  - [x] Test: Cancel fails after expiration

## Implementation Guide

### TTL Configuration (Single Source of Truth)

| System | Env Var | File | Logic |
|:---|:---|:---|:---|
| BullMQ Job Delay | `PAYMENT_CAPTURE_DELAY_MS` | `payment-capture-queue.ts` | Direct use (ms) |
| JWT Token | `PAYMENT_CAPTURE_DELAY_MS` | `modification-token.ts` | Div 1000 (seconds) |

**Test env files:**
- `apps/backend/.env.test`
- `apps/e2e/.env`

```bash
PAYMENT_CAPTURE_DELAY_MS=10000 # 10 seconds
```

### Cookie Contract (Story 4.3)

| Attribute | Value |
|:---|:---|
| Name | `guest_order_{order_id}` |
| httpOnly | `true` |
| secure | `true` (production) |
| sameSite | `strict` |
| path | `/order/status/{order_id}` |
| maxAge | Dynamic from JWT `exp` |

**Source:** [`guest-session.server.ts`](file:///Users/leonliang/Github%20Repo/gracestowel/apps/storefront/app/utils/guest-session.server.ts)

### UI Selectors

| Element | Selector |
|:---|:---|
| Timer | `role="timer"` |
| Expired State | Text: "being processed" |
| Link Expired | Heading: "Link Expired" |

### Files to Touch

**Modify:**
- `apps/backend/src/services/modification-token.ts` - Refactor to use `PAYMENT_CAPTURE_DELAY_MS`

**New:**
- `apps/e2e/tests/grace-period.spec.ts`

**Extend:**
- `apps/backend/integration-tests/unit/payment-capture-queue.unit.spec.ts`

**Reference:**
- `apps/e2e/tests/checkout.spec.ts`
- `apps/backend/integration-tests/unit/modification-token.unit.spec.ts`
- `apps/storefront/app/utils/guest-session.server.ts`

### References

- [Story 3.1: Timer UI](file:///Users/leonliang/Github%20Repo/gracestowel/docs/sprint/sprint-artifacts/3-1-storefront-timer-edit-ui.md)
- [Story 4.3: Session Persistence](file:///Users/leonliang/Github%20Repo/gracestowel/docs/sprint/sprint-artifacts/4-3-session-persistence.md)

## Dev Agent Record

### Agent Model Used

Antigravity (Google Deepmind)

### Completion Notes List

- Story generated via BMAD *create-story workflow in YOLO mode
- Updated to use single Env Var `PAYMENT_CAPTURE_DELAY_MS` as source of truth
- Cookie contracts detailed and validated against Story 4.3
- ✅ Implemented Task 1: Configured backend to use PAYMENT_CAPTURE_DELAY_MS for modification token window and verified with unit tests (4 tests pass).
- ✅ Implemented Task 4: Added backend unit test for capture job wiring (schedule -> worker -> metadata). Verified pass (18 tests pass).
- ✅ Implemented Tasks 2, 3, 5: Created `apps/e2e/tests/grace-period.spec.ts` with FULL test implementations covering AC1-AC6. Tests use `test.skip()` when `TEST_MODIFICATION_TOKEN` env var is not set (allows running in CI with seeded test data).

### File List

- apps/backend/src/services/modification-token.ts
- apps/backend/.env.test
- apps/backend/integration-tests/unit/payment-capture-config.unit.spec.ts
- apps/e2e/tests/grace-period.spec.ts
- apps/backend/integration-tests/unit/payment-capture-queue.unit.spec.ts
- docs/sprint/sprint-artifacts/sprint-status.yaml
