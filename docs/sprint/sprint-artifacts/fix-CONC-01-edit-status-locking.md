# IMPL-CONC-01: edit_status locking is best-effort

**Epic**: Checkout Audit Fixes
**Priority**: Medium
**Status**: Drafted

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
