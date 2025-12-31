# IMPL-ORD-03: Address update token transport mismatch

## User Story

**As a** Frontend Developer,
**I want** the address update endpoint to accept the standard `x-modification-token` header,
**So that** I don't have to write custom logic to pass the token in the body for just this one endpoint.

## Acceptance Criteria

### Scenario 1: Header Authentication

**Given** a valid modification token
**When** I make a request to update the address sending the token in the `x-modification-token` header
**Then** the request should be accepted and processed

### Scenario 2: Backward Compatibility

**Given** a legacy client
**When** it sends the token in the request body
**Then** the request should still be processed successfully (optional but good for safety)

## Technical Implementation Plan (Original)

### Problem

Storefront sends modification token in `x-modification-token` header, but backend expects it in the body. Address updates fail.

### Solution Overview

Update backend to accept header-based tokens.

### Implementation Steps

#### 1. Backend Route (`apps/backend/src/api/store/orders/[id]/address/route.ts`)


- [ ] Read `req.headers['x-modification-token']`.

- [ ] Use header token if present; fall back to `req.body.token` for backward compatibility.

### Verification


- **Automated**:

  - Test: Call endpoint with token in header. Verify success.

  - Test: Call endpoint with token in body. Verify success.

### Dependencies


- None.
