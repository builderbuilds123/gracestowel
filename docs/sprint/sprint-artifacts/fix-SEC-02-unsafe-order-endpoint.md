# IMPL-SEC-02: Unsafe /store/orders/by-payment-intent Endpoint

**Epic**: Checkout Audit Fixes
**Priority**: Critical
**Status**: Drafted

## Problem
The `GET /store/orders/by-payment-intent` endpoint is unsafe, performing extensive PII leaks, full table scans, and uncontrolled token minting. PII (shipping address) is returned to anyone with the PaymentIntent ID.

## Solution Overview
Phase 0 (Emergency): Secure the endpoint immediately by stripping PII and adding caching directives.

## Implementation Steps

### 1. Backend API (`apps/backend/src/api/store/orders/by-payment-intent/route.ts`)
- [ ] **Remove PII**: Modify the response to return *only* necessary status fields (e.g., `order_id`, `status`). Do NOT return `shipping_address`, `items`, or `customer` details.
- [ ] **Disable Token Minting**: Stop calling `modificationTokenService.generateToken()` in this read-only endpoint unless explicitly required and authorized.
- [ ] **Add Headers**: Set `Cache-Control: no-store, private` and `X-Content-Type-Options: nosniff`.
- [ ] **Optimize Query**:
  - Instead of `query.graph({ entity: "order" })` (full scan), use a filtered query if possible or add a database index on `metadata->>'stripe_payment_intent_id'`.
  - If DB indexing is not immediate, at least limit the scan to recent orders (e.g., created in last 24h).

### 2. Storefront Usage (`apps/storefront/app/routes/checkout.success.tsx`)
- [ ] Verify the storefront only needs `order_id` or status to redirect/show success.
- [ ] Remove any reliance on PII from this endpoint.

## Verification
- **Automated**:
  - Test: Call the endpoint with a valid PI ID. Assert response does NOT contain `shipping_address` or `email`.
  - Test: Performance test (mock many orders) to ensure it doesn't timeout (verify scan limit or index usage).
- **Manual**:
  - Visit checkout success page. Ensure it loads correctly without the PII payload.

## Dependencies
- None.
