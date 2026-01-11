# CHK-03: Atomic Checkout Orchestration

## Problem Statement

The current checkout implementation uses a **multi-call approach** where the client makes 3+ sequential API calls to complete payment preparation:

1. `POST /api/carts/:id/shipping-methods` - Persist shipping selection
2. `PATCH /api/carts/:id` - Sync email and shipping address
3. `POST /api/payment-collections/:id/sessions` - Refresh payment session to get updated `client_secret`

This introduces **race condition risks** and **partial failure states** where:
- If call #2 succeeds but call #3 fails, the cart is in an inconsistent state
- Cart totals may change between calls (another tab, price update), causing PaymentIntent amount mismatch
- Each network round-trip adds ~100ms latency (total: 300-500ms overhead)
- Complex client-side error handling required for each step

## Root Cause Discovery

During PR #133 code review, we attempted to implement an **atomic checkout endpoint** (`/api/carts/:id/prepare-for-payment`) that would orchestrate all three operations server-side in a single request.

**Issue Encountered**: React Router 7's file-based routing with `@cloudflare/vite-plugin` did **not register the new route**. The route type file (`.react-router/types/app/routes/+types.api.carts.$id.prepare-for-payment.d.ts`) was never generated despite:
- Correct file naming convention (`api.carts.$id.prepare-for-payment.ts`)
- Valid `action` export function signature
- Multiple server restarts and cache clears

**Secondary Issue**: During dev mode with mkcert (HTTPS), the CSRF protection failed due to `host` / `origin` header mismatch. Disabling mkcert resolved this, but the route registration issue persisted.

## Proposed Solution

### Option A: Resource Route Pattern (Recommended)
Convert the endpoint to a **resource route** using React Router's explicit route configuration instead of file-based convention.

Add to `app/routes.ts` or equivalent:
```typescript
import { route } from "@react-router/dev/routes";

export default [
  // ... existing routes
  route("api/carts/:id/prepare-for-payment", "routes/api.carts.$id.prepare-for-payment.ts"),
];
```

### Option B: Backend API Endpoint
Move the orchestration logic to the Medusa backend as a custom API route (`/store/carts/:id/prepare-for-payment`), bypassing React Router entirely.

### Option C: Investigate Framework Bug
File an issue with `@cloudflare/vite-plugin` or `react-router` to understand why new action routes aren't being registered during dev mode.

## Acceptance Criteria

- [ ] **AC1**: A single POST endpoint `/api/carts/:id/prepare-for-payment` (or equivalent) accepts `{ shipping_option_id, email, shipping_address, payment_collection_id }` and returns `{ client_secret }`.
- [ ] **AC2**: The endpoint executes the following operations atomically (all-or-nothing):
  1. Persist shipping method via `MedusaCartService.addShippingMethod()`
  2. Update cart with email and shipping address via `MedusaCartService.updateCart()`
  3. Refresh payment session via Medusa API to sync PaymentIntent amount
- [ ] **AC3**: If any step fails, the endpoint returns an error and does NOT leave the cart in a partial state.
- [ ] **AC4**: CheckoutForm.tsx calls this single endpoint instead of 3 separate calls.
- [ ] **AC5**: Checkout completes successfully in local dev (HTTP mode) and production (Cloudflare Workers).
- [ ] **AC6**: Unit tests cover success, partial failure, and error scenarios.
- [ ] **AC7**: Structured logging with trace ID for all operations.

## Technical Notes

### Why Atomic Matters

| Scenario | Multi-Call | Atomic |
|----------|------------|--------|
| User changes cart in another tab | PaymentIntent may have stale amount | Server always uses fresh cart total |
| Network drops after step 2 | Shipping persisted, payment not refreshed | Either all succeed or none |
| User double-clicks "Pay Now" | Race condition between calls | Idempotent server-side handling |

### Files to Modify
- `apps/storefront/app/routes/api.carts.$id.prepare-for-payment.ts` (new or fix registration)
- `apps/storefront/app/components/CheckoutForm.tsx` (update handleSubmit)
- `apps/storefront/app/routes.ts` (if using explicit route config)

### Dependencies
- Depends on: CHK-02-A (Payment Collection APIs)
- Depends on: SHP-01 (Shipping persistence)

## Story Points
**5 points** (Medium complexity - primarily routing/framework investigation)

## Priority
**Medium** - Not a blocker but improves reliability and user experience.

## Labels
`checkout`, `reliability`, `performance`, `react-router`
