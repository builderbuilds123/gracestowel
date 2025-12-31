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


- [ ] Update `generateToken` signature to make `orderCreatedAt` a **required** parameter (if not already strictly enforced).

- [ ] Add a guard: If `orderCreatedAt` is not provided (or optional), throw an error in production environment.

- [ ] Add validation: Ensure `orderCreatedAt` is not in the future.

#### 2. Tests (`apps/backend/src/services/__tests__/modification-token.spec.ts`)


- [ ] Add regression test: Call `generateToken` with `orderCreatedAt` = 2 hours ago. Verify generated token has `exp` in the past (or verify `remaining_seconds <= 0` / token validation fails).

- [ ] Ensure `generateToken` cannot be called without an anchor time.

### Verification


- **Automated**:

  - Unit tests in `modification-token.spec.ts`.

### Dependencies


- None.
