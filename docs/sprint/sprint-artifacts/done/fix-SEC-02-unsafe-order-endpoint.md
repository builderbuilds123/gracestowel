# IMPL-SEC-02: Unsafe /store/orders/by-payment-intent Endpoint

**Epic**: Checkout Audit Fixes
**Priority**: Critical
**Status**: Done
## Problem

The `GET /store/orders/by-payment-intent` endpoint is unsafe, performing extensive PII leaks, full table scans, and uncontrolled token minting. PII (shipping address) is returned to anyone with the PaymentIntent ID.

## Solution Overview

Phase 0 (Emergency): Secure the endpoint immediately by stripping PII and adding caching directives.

## Implementation Steps

### 1. Backend API (`apps/backend/src/api/store/orders/by-payment-intent/route.ts`)


- [x] **Remove PII**: Modify the response to return *only* necessary status fields (e.g., `order_id`, `status`). Do NOT return `shipping_address`, `items`, or `customer` details.

- [x] **Disable Token Minting**: Stop calling `modificationTokenService.generateToken()` in this read-only endpoint unless explicitly required and authorized.

- [x] **Add Headers**: Set `Cache-Control: no-store, private` and `X-Content-Type-Options: nosniff`.

- [x] **Optimize Query**:

  - Instead of `query.graph({ entity: "order" })` (full scan), use a filtered query if possible or add a database index on `metadata->>'stripe_payment_intent_id'`.

  - If DB indexing is not immediate, at least limit the scan to recent orders (e.g., created in last 24h).

### 2. Storefront Usage (`apps/storefront/app/routes/checkout.success.tsx`)


- [x] Verify the storefront only needs `order_id` or status to redirect/show success.

- [x] Remove any reliance on PII from this endpoint.

## Verification


- **Automated**:

  - Test: Call the endpoint with a valid PI ID. Assert response does NOT contain `shipping_address` or `email`.

  - Test: Performance test (mock many orders) to ensure it doesn't timeout (verify scan limit or index usage).

- **Manual**:

  - Visit checkout success page. Ensure it loads correctly without the PII payload.

## Dependencies


- None.

## File List

**Modified Files:**


- `apps/backend/src/api/store/orders/by-payment-intent/route.ts` - Removed PII, disabled token minting, added security headers, optimized query

- `apps/storefront/app/routes/checkout.success.tsx` - Updated to use minimal order API response (only order.id and status)

- `apps/backend/integration-tests/unit/by-payment-intent-endpoint.unit.spec.ts` - Added comprehensive security and performance tests

## Dev Agent Record


- **Status:** Complete (Code Review + Fixes Applied)

- **Summary:**

  Secured the `/store/orders/by-payment-intent` endpoint by removing PII leakage, disabling token minting, adding security headers, and optimizing the query pattern. The endpoint now returns only `order_id` and `status` fields, with proper security headers to prevent caching. Storefront updated to work with minimal response. Comprehensive test suite added covering PII protection, security headers, query optimization, and error handling.


- **Code Review Fixes Applied:**

  - Replaced `console.error` with structured logger (`logger.error`) for proper error tracking and PostHog integration

  - Story documentation updated with File List, Dev Agent Record, and Change Log sections

  - All tasks marked complete [x]

  - Story status updated from "Drafted" to "done"


- **Implementation Notes:**

  - Query optimization uses 24h filter + pagination limit (200 orders) to bound scan size. Full database index on `metadata->>'stripe_payment_intent_id'` recommended for production scale but not blocking.

  - Token minting completely removed - clients should use `/order/status/:id` endpoint for modification tokens if needed.

  - Security headers properly set on all responses (including errors).

## Change Log


- **2025-12-30**: Initial implementation - SEC-02 security fixes applied

  - Removed PII from response (shipping_address, items, customer details)

  - Disabled token minting in read-only endpoint

  - Added security headers (Cache-Control, X-Content-Type-Options)

  - Optimized query with 24h filter and pagination limit

  - Updated storefront to use minimal response

  - Added comprehensive unit tests


- **2025-12-30 - Code Review Fixes (Amelia)**:

  - Replaced `console.error` with structured logger for production observability

  - Added File List, Dev Agent Record, and Change Log sections to story

  - Marked all tasks as complete [x]

  - Updated story status to "done"
