# Story 4.2: Guest Auth Middleware

Status: ready-for-dev

## Story

As a Developer,
I want the storefront **loader** (Remix pattern) to validate the "magic token" before rendering the order status route,
so that unauthorized users cannot access random orders.

**Note:** "Middleware" in Epic refers to Remix loaders/route guards, not Express-style middleware.

## Implementation Status

### ✅ Already Completed (Prior Stories)
- `GET /store/orders/:id/guest-view` endpoint with token validation - Story 3.1
- `ModificationTokenService.validateToken()` implementation - Story 3.1
- Order status route loader (`order_.status.$id.tsx`) - Story 3.1
- PII masking in guest-view response - Story 3.1
- Error handling (401/403 with error codes) - Story 3.1

### 🎯 This Story Scope
- **Verification only:**  Audit existing implementation against Epic 4 security requirements
- **New code:** None (middleware/loader logic already exists)
- **Testing:** Add integration tests for security edge cases
- **Hardening:** Verify rate limiting configured (Cloudflare edge)

## Acceptance Criteria

### Backend Endpoint Verification

1. **Given** a user accesses `/order/status/:id?token=XYZ`
   **When** the storefront loader calls `GET /store/orders/:id/guest-view`
   **Then** the backend must:
   - Accept `x-modification-token` header (preferred) OR `token` query param
   - Validate token using `ModificationTokenService.validateToken()`
   - Verify `order_id` in URL matches `order_id` in token payload
   - Return 401 for invalid signature
   - Return 403 for expired token (with `TOKEN_EXPIRED` error code)
   - Return 403 for order ID mismatch (token for different order)

### Security Requirements Verification

2. **PII Masking:**
   - Email partially masked (e.g., `j***@example.com`)
   - Address partially masked (country code + last name only)
   - Phone numbers NOT included in response
   - Full street address NOT included

3. **HTTP Headers:**
   - `Cache-Control: no-store, private` header present
   - `X-Content-Type-Options: nosniff` header present

4. **Rate Limiting:**
   - Cloudflare edge rate limit: 60 req/min per IP
   - Endpoint path: `/store/orders/*/guest-view`
   - Action on limit: HTTP 429 (blocked before reaching backend)

### Storefront Loader Verification

5. **Given** user visits `/order/status/:id`
   **When** the loader executes
   **Then** it must:
   - Read token from cookie FIRST (Story 4.3), fallback to URL query param
   - Pass token in `x-modification-token` header to backend
   - Handle 401 → redirect to error page ("Invalid link")
   - Handle 403 + `TOKEN_EXPIRED` → show "Link Expired" UI with resend option
   - Handle 403 + `TOKEN_MISMATCH` → redirect to error page
   - NOT expose token in client-side JavaScript (server-only, never in window object)

## Tasks / Subtasks

### Backend Audit

- [ ] **Audit Guest View Endpoint**
  - [ ] File: `apps/backend/src/api/store/orders/[id]/guest-view/route.ts`
  - [ ] Verify token validation uses `modificationTokenService.validateToken()` ✅
  - [ ] Verify order ID match check: `validation.payload?.order_id === id` ✅
  - [ ] Verify 401 response for invalid signature ✅
  - [ ] Verify 403 response for expired token with `TOKEN_EXPIRED` code ✅
  - [ ] Verify PII masking logic (email, address) ✅
  - [ ] Verify `Cache-Control: no-store, private` header ✅
  - [ ] **Missing:** `X-Content-Type-Options: nosniff` header
    - **Action:** Add security header to response

- [ ] **Verify Rate Limiting Configuration**
  - [ ] Check Cloudflare dashboard: Rate limiting rule for `/store/orders/*/guest-view`
  - [ ] Verify limit: 60 req/min per IP
  - [ ] Verify action: Block with 429 (not challenge/log)
  - [ ] **If missing:** Create Cloudflare rate limit rule (infrastructure task)

### Storefront Audit

- [ ] **Audit Order Status Route Loader**
  - [ ] File: `apps/storefront/app/routes/order_.status.$id.tsx`
  - [ ] Verify loader calls `GET /guest-view` endpoint ✅
  - [ ] Verify token passed in `x-modification-token` header ✅
  - [ ] Verify 401 handling → error page redirect ✅
  - [ ] Verify 403 + `TOKEN_EXPIRED` handling → "Link Expired" UI ✅
  - [ ] **Story 4.3 Dependency:** Cookie-first logic not yet implemented
    - **Defer:** Will be added in Story 4.3 (session persistence)
  - [ ] Verify token NOT in client bundle (no `window.token = ...`) ✅

- [ ] **Testing (see Testing Requirements section)**

## Security Audit Checklist

### Backend Endpoint (`GET /store/orders/:id/guest-view`)
- [ ] Token validation uses `modificationTokenService.validateToken()`
- [ ] Order ID in URL matches `order_id` in token payload
- [ ] Returns 401 for invalid signature
- [ ] Returns 403 for expired token (with `TOKEN_EXPIRED` code)
- [ ] Returns 403 for order ID mismatch (with `TOKEN_MISMATCH` code)
- [ ] PII masking applied to response (email, address)
- [ ] `Cache-Control: no-store, private` header set
- [ ] `X-Content-Type-Options: nosniff` header set (ADD THIS)
- [ ] Rate limiting configured (Cloudflare: 60 req/min per IP)

### Storefront Loader (`order_.status.$id.tsx`)
- [ ] Reads token from cookie first (Story 4.3), then URL query param
- [ ] Passes token in `x-modification-token` header to backend
- [ ] Handles 401 → redirect to error page
- [ ] Handles 403 + `TOKEN_EXPIRED` → shows "Link Expired" UI
- [ ] Handles 403 + `TOKEN_MISMATCH` → redirect to error page
- [ ] Does NOT expose token in client-side JavaScript
- [ ] Loader is server-only (not exported to client bundle)

## Testing Requirements

### Integration Tests (Backend - Guest View Endpoint)
- [ ] Valid token in `x-modification-token` header returns 200 + masked order data
- [ ] Valid token in `token` query param returns 200 + masked order data
- [ ] Expired token returns 403 with `TOKEN_EXPIRED` code
- [ ] Invalid signature returns 401 with `TOKEN_INVALID` code
- [ ] Token for Order A accessing Order B returns 403 with `TOKEN_MISMATCH` code
- [ ] PII masking verified: email partially masked, no phone number, no full address
- [ ] `Cache-Control` header present in response
- [ ] `X-Content-Type-Options` header present in response

### Integration Tests (Storefront - Order Status Route)
- [ ] Loader fetches order with valid token from URL
- [ ] Loader fetches order with valid token from cookie (Story 4.3)
- [ ] `TOKEN_EXPIRED` error shows "Link Expired" UI component
- [ ] `TOKEN_INVALID` error redirects to generic error page
- [ ] `TOKEN_MISMATCH` error redirects to error page (not specific message to prevent enumeration)
- [ ] Token not present in client-side page source (view source inspection)
- [ ] Token not in browser DevTools Network tab response body

### Security Tests
- [ ] Rate limit enforcement: 61st request in 1 minute returns 429
- [ ] CSRF protection: POST actions require valid token (not just GET)
- [ ] XSS protection: Malicious token content doesn't execute in error messages

## Dev Notes

### Remix Loader vs Middleware Terminology

**Clarification:**
- **Epic uses "Middleware"** → Refers to Remix loader pattern (data fetching before render)
- **Express Middleware** → NOT applicable (Medusa backend uses Express, but storefront uses Remix)
- **Remix Pattern:** Loaders run server-side, fetch data, return to component

**Implementation:**
- File: `apps/storefront/app/routes/order_.status.$id.tsx`
- Export: `export async function loader({ request, params }) { ... }`
- Runs: Server-side only (Cloudflare Workers or Node.js)

### Rate Limiting Strategy

**Edge-Level (Cloudflare):**
- Path: `/store/orders/*/guest-view`
- Limit: 60 req/min per IP
- Action: Block with 429

**Why Edge vs Application:**
- Blocks abuse before reaching backend (saves compute)
- No code changes required
- Scales automatically with Cloudflare
- Already using Cloudflare for storefront deployment

**Future Enhancement (Epic 7.2):**
- Add server-side Redis-based rate limiting per token (10 req/min)
- Prevent single token from hammering backend (even if IP changes)

### References

- [Story 4.1 (Token Generation)](file:///Users/leonliang/Github%20Repo/gracestowel/docs/sprint/sprint-artifacts/4-1-magic-link-generation.md)
- [Story 4.3 (Session Persistence)](file:///Users/leonliang/Github%20Repo/gracestowel/docs/sprint/sprint-artifacts/4-3-session-persistence.md)
- [Backend Guest View Route](file:///Users/leonliang/Github%20Repo/gracestowel/apps/backend/src/api/store/orders/[id]/guest-view/route.ts)
- [Storefront Order Status Route](file:///Users/leonliang/Github%20Repo/gracestowel/apps/storefront/app/routes/order_.status.$id.tsx)
- [ModificationTokenService](file:///Users/leonliang/Github%20Repo/gracestowel/apps/backend/src/services/modification-token.ts)

## Dev Agent Record

### Verification Results

(To be filled by implementing dev agent)

### Agent Model Used

Antigravity (Google Deepmind)

### Completion Notes

(To be filled by implementing dev agent)

### File List

(To be filled by implementing dev agent)
