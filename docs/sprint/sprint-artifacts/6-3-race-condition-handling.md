# Story 6.3: Race Condition Handling

Status: ready-for-dev

## Story

As a Developer,
I want to lock the order for editing near the 59:59 mark,
So that we don't allow edits while capture is starting.

## Acceptance Criteria

1.  **Given** the grace period is expiring.
2.  **When** a capture job starts.
3.  **Then** the order metadata must be updated atomically: `edit_status: locked_for_capture`.
4.  **Given** an order is marked `edit_status: locked_for_capture`.
5.  **When** a user attempts to "Edit Order" (add/remove items).
6.  **Then** the request must fail with `409 Conflict`.
7.  **And** the response body must contain: `{ code: 'ORDER_LOCKED', message: 'Order is processing and cannot be edited' }`.
8.  **And** REUSE: Leverage existing `JobActiveError` pattern from `payment-capture-queue.ts`.

## Tasks / Subtasks

- [ ] Task 1: Optimistic Locking / State Management (AC: 1, 3, 8)
  - [ ] **Mechanism**: Use `metadata.edit_status` flag.
  - [ ] **Reference**: See `apps/backend/src/lib/payment-capture-queue.ts` (lines 132-153) for `checkJobActive` pattern.
  - [ ] **Timing**: Set buffer to capture at 59:30 (giving 30s buffer) rather than 59:59.
  - [ ] **Transition**: Capture Job sets `edit_status` from `editable` to `locked_for_capture`.

- [ ] Task 2: Edit Endpoint Guard (AC: 4, 5, 6, 7)
  - [ ] **Location**: `apps/backend/src/workflows/add-item-to-order.ts` (Main edit workflow).
  - [ ] **Check**: Inspect `order.metadata.edit_status`.
  - [ ] **Error**: Throw `JobActiveError` or Medusa Conflict error if locked.
  - [ ] **Pattern**: Mirror `processPaymentCapture` (lines 304-312) status check logic.

- [ ] Task 3: Audit Logging for Rejections (AC: 8)
  - [ ] Log rejected edit attempts (warn level).

## Dev Notes

- **Existing Code**: `payment-capture-queue.ts` is the source of truth for capture state.
- **Service**: `OrderEditService` references in previous drafts were incorrect. Logic resides in `workflows/add-item-to-order.ts`.
- **Validation**: Use `modificationTokenService` if time validation needed.

## Previous Story Intelligence

- **Epic 6 Context**: This story enforces the integrity of the "Grace Period" window (Epics 3-5).
- **Related Stories**:
  - Story 3.1 (Timer UI): The UI must reflect the `locked_for_capture` state immediately to prevent user frustration.
  - Story 2.3 (Capture Workflow): This workflow is the *actor* that sets the lock.
  - Story 3.4 (Cancellation): Parallel cancellation requests must also respect this lock.

## Technical Implementation Details

- **Locking Mechanism**: **Database-Level Optimistic Locking**.
  - We use the `metadata` JSONB column in Postgres.
  - **Critical**: All state transitions MUST happen inside a `SERIALIZABLE` or `REPEATABLE READ` transaction if possible, or use explicit row locking (`FOR UPDATE`) when reading the order to set the flag.
- **State Source of Truth**: The Database `metadata.edit_status`. Redis is for queueing, DB is for state.

## Testing Strategy

### 1. Concurrent Request Simulation (The "Hammer" Test)
- **Goal**: Prove that 2 simultaneous requests cannot both succeed.
- **Setup**: Create a Node.js script using `axios` or `fetch`.
- **Action**:
  - Request A: Trigger `POST /admin/orders/{id}/capture` (Simulating Job).
  - Request B: Trigger `POST /store/orders/{id}/edit` (Simulating User).
- **Execution**: Use `Promise.all([reqA, reqB])` to fire them within milliseconds.
- **Assertion**:
  - Exactly ONE request returns `200 OK`.
  - The other request MUST return `409 Conflict` (or `400` if handled upstream).
  - Database `metadata.edit_status` must responsibly reflect the winner `locked_for_capture`.

### 2. UI State Verification
- **Mock**: Force backend response to 409.
- **Inspect**:### Refined Anti-Patters & Implementation Details

- **Capture Workflow**: The capture logic is in `apps/backend/src/lib/payment-capture-queue.ts` and `apps/backend/src/loaders/payment-capture-worker.ts` (NOT `payment-capture.ts`).
- **Time Validation**: Use the dedicated service:
  ```typescript
  // E3: Time Validation Pattern
  if (await modificationTokenService.isWithinModificationWindow(order.id)) {
      throw new Error("Cannot capture while modification window is open");
  }
  ```
- **Locking**: Explicit row locking example:
  ```sql
  -- O2: Explicit Row Locking (if raw SQL needed)
  SELECT * FROM "order" WHERE id = $1 FOR UPDATE NOWAIT;
  ```
- **Lock Release**: The `locked_for_capture` flag MUST be cleared (set to `idle`) in the `finally` block of the capture job, regardless of success or failure.

## Monitoring & Alerting

- **Stuck Locks**: Alert if any order remains `locked_for_capture` for > 10 minutes.
- **Race Detected**: Log `INFO` count for "Order Locked" 409 responses.

## Dev Agent Record

### Context Reference

- `docs/product/epics/payment-integration.md` - Epic 6 Source.
- `apps/backend/src/workflows/add-item-to-order.ts` - Target workflow.
- `apps/backend/src/lib/payment-capture-queue.ts` - Target capture logic.

### Agent Model Used

Antigravity (Google Deepmind)

### Completion Notes List

- Added "Previous Story Intelligence" linking Stories 3.1 and 3.4.
- Defined "Database-Level Optimistic Locking" with transaction requirements.
- Added comprehensive "Concurrent Request Simulation" testing strategy.
- Completed Dev Agent Record.
- Corrected file path to `payment-capture-queue.ts`.
- Added `modificationTokenService` validation reference.
- Defined Lock Release semantics and Stuck Lock monitoring.

### File List

- `apps/backend/src/workflows/add-item-to-order.ts`
- `apps/backend/src/lib/payment-capture-queue.ts`
