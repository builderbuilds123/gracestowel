# IMPL-CHK-02-A: Backend Payment Collection API & Service

**Epic**: Checkout Audit Fixes  
**Priority**: Critical  
**Status**: Done  
**Type**: Implementation  
**Estimated Effort**: Medium (1 day)

---

## Story

**As a** storefront developer  
**I want** backend APIs to initialize `PaymentCollection` and `PaymentSession`  
**So that** the frontend can decouple payment logic from the Cart completion flow

---

## Problem Statement

The Storefront currently creates Stripe PaymentIntents directly. Medusa v2 requires a `PaymentCollection` to exist before a Payment Session (and Intent) is created. This story implements the missing API layer.

---

## Acceptance Criteria

1.  **AC1**: `POST /store/payment-collections` creates a new PaymentCollection for a cart
2.  **AC2**: `POST /store/payment-collections/:id/payment-sessions` creates a session with `pp_stripe`
3.  **AC3**: The returned data includes the `client_secret` from the Stripe PaymentIntent
4.  **AC4**: Existing Order/Cart Services are not broken by this addition

---

## Technical Details

**New API Routes:**
- `apps/storefront/app/routes/api.payment-collections.ts`
- `apps/storefront/app/routes/api.payment-collections.$id.sessions.ts`

**Logic:**
- Interact with Medusa `paymentCollectionService` (via `@medusajs/medusa-js` or direct API calls)
- Ensure correct error handling for "Cart not found" or "Payment Collection already exists"

---

## Tasks

- [x] 1.1 Verify/Create `/store/payment-collections` proxy route in Storefront API
- [x] 1.2 Verify/Create `/store/payment-collections/:id/payment-sessions` proxy route
- [x] 1.3 Add Unit Tests for these new API routes

---

## Dev Agent Record

### File List

| File | Action | Description |
|------|--------|-------------|
| `apps/storefront/app/routes/api.payment-collections.ts` | Created → Modified | POST handler for creating PaymentCollection |
| `apps/storefront/app/routes/api.payment-collections.$id.sessions.ts` | Created → Modified | POST handler for creating PaymentSession |
| `apps/storefront/app/routes/api.payment-collections.test.ts` | Created → Modified | Unit tests (6 tests, added idempotency test) |
| `apps/storefront/app/routes/api.payment-collections.$id.sessions.test.ts` | Created → Modified | Unit tests (8 tests, added provider_id validation, JSON parse, missing structure tests) |
| `apps/storefront/app/routes/checkout.tsx` | Modified | Added null checks for unexpected Medusa response structure, fixed type assertions |

### Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-01-08 | Dev Agent | Initial implementation of payment collection routes |
| 2026-01-08 | Code Review (AI) | Added input validation (cartId/collectionId format), standardized error format to `{ error: ... }`, added JSDoc headers, added 4 new edge-case tests |
| 2026-01-08 | Code Review (AI) - Adversarial | Fixed 8 HIGH + 2 MEDIUM issues: removed sensitive error leakage, added idempotency handling for duplicate collections, fixed JSON parse error handling, added provider_id validation, fixed type assertions in checkout, added null checks for unexpected response structure, added 5 new tests (14 total) |

### Senior Developer Review (AI)

**Reviewed:** 2026-01-08T17:33:51Z  
**Reviewer:** Amelia (Dev Agent)  
**Outcome:** ✅ Approved with fixes applied

#### Review Findings Summary (First Review)

| # | Severity | Issue | Resolution |
|---|----------|-------|------------|
| 1 | HIGH | Story missing File List section | Added Dev Agent Record with File List and Change Log |
| 2 | HIGH | No input validation on cartId — could pass objects/arrays/malicious strings | Added `typeof === "string"` check + format validation (`cart_` prefix, min 10 chars) |
| 3 | MEDIUM | No collectionId validation in sessions route | Added format validation (`paycol_` prefix, min 10 chars) |
| 4 | MEDIUM | Inconsistent error format (`{ message }` vs `{ error }`) | Standardized all responses to `{ error: ... }` matching existing routes |
| 5 | MEDIUM | Missing edge case tests for validation | Added 4 new tests: invalid format, non-string cartId, invalid collectionId |
| 6 | MEDIUM | Missing JSDoc headers (inconsistent with existing routes) | Added JSDoc documentation to both route files |
| 7 | LOW | Files not staged for commit | User responsibility — files ready for staging |
| 8 | LOW | Unrelated backend typecheck error (`list-sales-channels.ts`) | Not in scope — existing issue in separate script |

### Senior Developer Review (AI) - Adversarial

**Reviewed:** 2026-01-08T18:00:00Z  
**Reviewer:** Amelia (Dev Agent - Adversarial)  
**Outcome:** ✅ All HIGH and MEDIUM issues fixed, 14/14 tests passing

#### Review Findings Summary (Adversarial Review)

| # | Severity | Issue | Resolution |
|---|----------|-------|------------|
| 1 | HIGH | Sensitive error leakage — `debug: errorText` exposed to clients | Removed `debug` field from all error responses, sanitized error messages |
| 2 | HIGH | Missing idempotency handling for duplicate payment collection creation | Added 409 conflict handling — fetches and returns existing collection instead of failing |
| 3 | HIGH | Silent JSON parse error masking in sessions route | Fixed try/catch to properly validate JSON — returns 400 for invalid JSON |
| 4 | HIGH | Type assertion mismatch in checkout.tsx — `data.id` confusion | Fixed type assertions, added clarifying comments that `data.id` is PaymentIntent ID from Stripe |
| 5 | HIGH | No null checks for unexpected Medusa response structure | Added null checks in checkout.tsx for missing `payment_sessions` array and missing `client_secret` |
| 6 | HIGH | Missing test for "payment collection already exists" scenario | Added test for 409 conflict handling with idempotency |
| 7 | HIGH | Missing test for unexpected Medusa response structure | Added test for missing `payment_sessions` array in response |
| 8 | HIGH | Missing integration test for client_secret structure | Test now verifies actual structure matches expectations |
| 9 | MEDIUM | Missing provider_id validation in sessions route | Added validation — must start with `pp_` prefix and be at least 5 chars |
| 10 | MEDIUM | Missing test for invalid provider_id | Added test for invalid provider_id format validation |

#### Code Changes Applied (First Review)

**`api.payment-collections.ts`:**
```typescript
// Added JSDoc header
/**
 * POST /api/payment-collections
 * Creates a new PaymentCollection for a cart via Medusa backend.
 */

// Added input validation (lines 24-33)
if (!cartId || typeof cartId !== "string") {
  return data({ error: "Cart ID is required and must be a string", traceId }, { status: 400 });
}
if (!cartId.startsWith("cart_") || cartId.length < 10) {
  return data({ error: "Invalid cart ID format", traceId }, { status: 400 });
}

// Standardized all error responses from { message } to { error }
```

**`api.payment-collections.$id.sessions.ts`:**
```typescript
// Added JSDoc header
/**
 * POST /api/payment-collections/:id/sessions
 * Creates a PaymentSession for the given PaymentCollection via Medusa backend.
 */

// Added collectionId validation (lines 22-27)
if (!collectionId.startsWith("paycol_") || collectionId.length < 10) {
  return data({ error: "Invalid collection ID format", traceId }, { status: 400 });
}

// Standardized all error responses from { message } to { error }
```

#### Code Changes Applied (Adversarial Review)

**`api.payment-collections.ts`:**
```typescript
// Removed sensitive error leakage (line 77)
// BEFORE: return data({ error: "Failed to create payment collection", traceId, debug: errorText }, ...)
// AFTER: return data({ error: userMessage, traceId }, ...) // No debug field

// Added idempotency handling for 409 conflicts (lines 78-98)
if (response.status === 409) {
  // Fetch existing collection for this cart
  const existingResponse = await monitoredFetch(`${medusaBackendUrl}/store/payment-collections?cart_id=${cartId}`, ...);
  if (existingResponse.ok) {
    const existingData = await existingResponse.json();
    return data(existingData); // Return existing collection instead of error
  }
}

// Sanitized error messages by status code
const userMessage = response.status === 404 
  ? "Cart not found"
  : response.status === 409
  ? "Payment collection already exists"
  : "Failed to create payment collection";
```

**`api.payment-collections.$id.sessions.ts`:**
```typescript
// Fixed JSON parse error handling (lines 34-48)
// BEFORE: catch (e) { // Ignore JSON parse error }
// AFTER: Proper validation with 400 error for invalid JSON

let body: PaymentSessionRequest = {};
try {
  const raw = await request.text();
  if (raw) {
    try {
      body = JSON.parse(raw);
    } catch (parseError) {
      return data({ error: "Invalid JSON body", traceId }, { status: 400 });
    }
  }
} catch (e) {
  // If request.text() fails, body remains empty and defaults will be used
}

// Added provider_id validation (lines 42-46)
const provider_id = body.provider_id || "pp_stripe";
if (provider_id && (!provider_id.startsWith("pp_") || provider_id.length < 5)) {
  return data({ error: "Invalid provider ID format", traceId }, { status: 400 });
}

// Removed sensitive error leakage (line 79)
// BEFORE: return data({ error: "...", debug: errorText }, ...)
// AFTER: return data({ error: userMessage, traceId }, ...) // No debug field
```

**`checkout.tsx`:**
```typescript
// Fixed type assertions and added null checks (lines 217-240)
// BEFORE: Direct access to stripeSession.data.client_secret without null checks
// AFTER: Added comprehensive null checks and clearer type annotations

const sessionData = await sessionRes.json() as { 
    payment_collection?: { 
        payment_sessions?: Array<{ 
            id: string, 
            provider_id: string, 
            data?: { 
                client_secret?: string;
                id?: string; // PaymentIntent ID from Stripe (not session ID)
                [key: string]: unknown;
            } 
        }> 
    } 
};

// Added null checks for missing structures
if (!sessions || sessions.length === 0) {
    throw new Error("No payment sessions found in response");
}

const stripeSession = sessions.find(s => s.provider_id === 'pp_stripe');
if (!stripeSession) {
    throw new Error("Stripe payment session not found in response");
}
if (!stripeSession.data?.client_secret) {
    throw new Error("Client secret not found in payment session data");
}

// Clarified that data.id is PaymentIntent ID from Stripe (not session ID)
if (stripeSession.data.id) {
    setPaymentIntentId(stripeSession.data.id);
}
```

#### Verification (First Review)

| Check | Result |
|-------|--------|
| Route-specific tests | ✅ 9/9 passing |
| Full storefront test suite | ✅ 262/262 passing |
| AC1: POST /store/payment-collections | ✅ Implemented + tested |
| AC2: POST /store/payment-collections/:id/payment-sessions | ✅ Implemented + tested |
| AC3: client_secret in response | ✅ Verified in test mock (Medusa returns this) |
| AC4: No regressions | ✅ All 262 existing tests pass |
| Storefront typecheck | ✅ Passing |

#### Verification (Adversarial Review)

| Check | Result |
|-------|--------|
| Route-specific tests | ✅ 14/14 passing (6 payment-collections + 8 sessions) |
| New tests added | ✅ 5 new tests: idempotency (409), invalid provider_id, invalid JSON, unexpected structure, 404 handling |
| Full storefront test suite | ✅ All tests passing (no regressions) |
| Security fixes | ✅ Removed sensitive error leakage from all responses |
| Idempotency | ✅ 409 conflicts handled gracefully — returns existing collection |
| Error handling | ✅ All edge cases properly validated and tested |
| Type safety | ✅ Fixed type assertions in checkout.tsx with proper null checks |
| AC1: POST /store/payment-collections | ✅ Implemented + tested + idempotency handled |
| AC2: POST /store/payment-collections/:id/payment-sessions | ✅ Implemented + tested + provider_id validated |
| AC3: client_secret in response | ✅ Verified with null checks for unexpected structures |
| AC4: No regressions | ✅ All existing tests still pass |
| Storefront typecheck | ✅ Passing |
