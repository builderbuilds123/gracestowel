# IMPL-CONC-01: edit_status locking is best-effort

**Epic**: Checkout Audit Fixes
**Priority**: Medium
**Status**: Ready for Dev
## Story

**As a** Developer,
**I want** to implement distributed locking for order modifications,
**So that** race conditions between payment capture and order updates are prevented, ensuring data integrity.

**Acceptance Criteria:**

**Given** an order is being processed for payment capture
**When** a concurrent modification request is received
**Then** the modification request should fail or wait until the capture is complete
**And** the Capture Worker should acquire a distributed lock before processing
**And** the Modification workflow should check for the lock before proceeding

## Problem

Race condition exists between capture and modification because locking is optimistic (metadata read-write) without atomic guards.

## Solution Overview

Use Redis distributed lock or DB row lock.

## Implementation Steps

### 1. Capture Worker


- [ ] **Acquire Lock**: `await lockService.acquire('order-lock:' + orderId)`.

- [ ] **Process**: Capture payment.

- [ ] **Release Lock**: `await lockService.release(...)`.

### 2. Modification Workflows


- [ ] **Check Lock**: Attempt to acquire lock or check if key exists. Fail if locked.

## Verification


- **Automated**:

  - Test: Simultaneous modification and capture request. One should fail or wait.

## Dependencies


- None.
