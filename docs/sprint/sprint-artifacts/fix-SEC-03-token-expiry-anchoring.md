# IMPL-SEC-03: Token Expiry Anchoring

## User Story

**As a** System Security Architect,
**I want** modification tokens to always be anchored to the order creation time,
**So that** tokens cannot be generated with "fresh" expiration windows that allow indefinite access.

## Acceptance Criteria

### Scenario 1: Retroactive Token Generation

**Given** an order was created 90 minutes ago
**When** a new modification token is generated
**Then** the token should be expired (remaining time <= 0)
**And** it should NOT have a new 1-hour window starting from generation time

### Scenario 2: Future Proofing

**Given** the token generation service
**When** `generateToken` is called without an explicit `createdAt` anchor
**Then** the service should throw an error or fail safely (preventing default "now" behavior)

## Technical Implementation Plan (Original)

### Problem

Modification tokens rely on `createdAt` to anchor their 1-hour expiration. If `createdAt` is omitted or incorrect in future code changes, tokens could be minted with "renewed" 1-hour windows, effectively allowing indefinite modification.

### Solution Overview

Add robustness to `ModificationTokenService` to enforce `createdAt` usage and prevent regression.

### Implementation Steps

#### 1. Backend Service (`apps/backend/src/services/modification-token.ts`)


- [x] Update `generateToken` signature to make `orderCreatedAt` a **required** parameter (if not already strictly enforced).

- [x] Add a guard: If `orderCreatedAt` is not provided (or optional), throw an error in production environment.

- [x] Add validation: Ensure `orderCreatedAt` is not in the future.

#### 2. Tests (`apps/backend/src/services/__tests__/modification-token.spec.ts`)


- [x] Add regression test: Call `generateToken` with `orderCreatedAt` = 2 hours ago. Verify generated token has `exp` in the past (or verify `remaining_seconds <= 0` / token validation fails).

- [x] Ensure `generateToken` cannot be called without an anchor time.

### Verification


- **Automated**:

  - Unit tests in `modification-token.spec.ts`.

### Dependencies


- None.

---

## Dev Agent Record

### Implementation Notes (2025-12-31)

**SEC-03 Token Expiry Anchoring implemented with:**

1. **`generateToken` signature changed** - `orderCreatedAt` parameter is now **required** (was optional)
2. **Runtime validation** - Throws `"orderCreatedAt is required to anchor token expiry to order creation time"` if parameter is undefined/null
3. **Future date validation** - Throws `"orderCreatedAt cannot be in the future"` to prevent clock skew exploitation
4. **All existing callers verified** - `order-placed.ts` and `create-order-from-stripe.ts` already pass `orderCreatedAt` correctly
5. **18 unit tests pass** including 2 new SEC-03 specific tests

### Completion Notes

All acceptance criteria satisfied:
- AC1: Token generated for 90-min-old order has `exp` in the past → ✅ Test exists and passes (added explicit 90-minute boundary test)
- AC2: `generateToken` without anchor throws error → ✅ Implemented and tested

### Code Review Fixes (2025-12-31)

**Issues Fixed:**
1. **C1 (Critical)**: Fixed type safety violation in `create-order-from-stripe.ts` - made `createdAt` required parameter in `generateModificationTokenStep` input type and added runtime guard
2. **H1 (High)**: Added explicit test for exactly 90-minute boundary scenario (AC1 requirement)
3. **M1 (Medium)**: Added `sprint-status.yaml` to File List
4. **M2 (Medium)**: Added 90-minute boundary test to verify AC1 exact requirement

**Test Count:** 19 unit tests (was 18, added 1 new 90-minute boundary test)

---

## File List

### Modified
- `apps/backend/src/services/modification-token.ts` - Made `orderCreatedAt` required, added validation guards
- `apps/backend/src/workflows/create-order-from-stripe.ts` - Fixed type safety: made `createdAt` required in generateModificationTokenStep
- `apps/backend/integration-tests/unit/modification-token.unit.spec.ts` - Added SEC-03 tests including 90-minute boundary test (AC1), updated existing tests for required param
- `apps/backend/integration-tests/integration/order-email.integration.spec.ts` - Updated generateToken call
- `apps/backend/integration-tests/http/cancel-order.spec.ts` - Updated generateToken call
- `docs/sprint/sprint-artifacts/sprint-status.yaml` - Updated story status tracking

---

## Change Log

| Date | Change |
|------|--------|
| 2025-12-31 | SEC-03 implementation complete. `orderCreatedAt` now required. 342 tests pass. |
| 2025-12-31 | Code review fixes: Fixed type safety in workflow step (C1), added 90-minute boundary test (H1/M2), updated File List (M1). 19 unit tests pass. |

---

## Status

done
