# Story 4.3: Session Persistence

Status: ready-for-dev

## Story

As a Shopper,
I want my order session to persist if I refresh the page,
so that I don't lose my edit access immediately and can perform actions without clicking the link again.

## Implementation Status

### ✅ Already Completed (Prior Stories)
- JWT token generation (`ModificationTokenService`) - Story 3.1
- Token validation in backend endpoints - Story 3.1, 3.2, 3.4
- Order status route loader (`order_.status.$id.tsx`) - Story 3.1
- Guest view endpoint (`GET /store/orders/:id/guest-view`) - Story 3.1

### 🎯 This Story Scope
- **New code:** Cookie persistence utilities for Cloudflare Workers
- **Updates:** Loader/action logic to check cookies FIRST, then URL param
- **Testing:** Cookie-based session flow validation

## Acceptance Criteria

### Cookie Specification

1. **Given** I have accessed an order via Magic Link (validated per Story 4.2)
   **When** the page loads
   **Then** a secure `HttpOnly` cookie must be set with:
   - **Name:** `guest_order_{order_id}` (scoped to specific order)
   - **Value:** The JWT token string
   - **maxAge:** Dynamically calculated from token's `exp` claim (remaining TTL, not hardcoded 3600)
   - **httpOnly:** `true`
   - **secure:** `true` (production only)
   - **sameSite:** `"strict"`
   - **path:** `/order/status/{order_id}` (scoped to this order's routes)

2. **Cookie Lifecycle:**
   - **Set:** When URL token is valid (first visit via magic link)
   - **Read:** On subsequent page loads/refreshes (cookie-first, then URL fallback)
   - **Clear:** Automatically on browser close OR when backend returns 401/403 (token expired/invalid)
   - **Update:** Never (tokens are immutable, cookie expires with token)

### Loader Logic (Cookie-First Pattern)

3. **Given** user visits `/order/status/:id`
   **When** the loader executes
   **Then** it must:
   1. **Check Cookie FIRST:** Read `guest_order_{id}` cookie from request headers
   2. **Fallback to URL:** If cookie missing, read `?token=` query param
   3. **Validate with Backend:** Pass token (from cookie OR URL) to `GET /guest-view` with `x-modification-token` header
   4. **Handle Responses:**
      - **200 OK:** Return order data + Set-Cookie header (if token was from URL, to persist it)
      - **401/403:** Return error + Clear-Cookie header (token invalid/expired)
      - **No token found:** Redirect to "Link Expired" page

### Action Logic (Cookie Token Propagation)

4. **Given** guest performs order modification (Add Item, Cancel Order)
   **When** the Remix action executes
   **Then** it must:
   1. Extract token from `guest_order_{id}` cookie
   2. Pass token in `x-modification-token` header to backend API
   3. Handle 401/403 by clearing cookie and showing error
   4. Return updated order data on success

## Technical Contracts

### Deployment Constraint: Cloudflare Workers Compatibility

**Critical:** Storefront deploys to Cloudflare Workers (edge runtime).

**Implications:**
- ❌ **Cannot use:** `createCookieSessionStorage` (requires Node.js `crypto`)
- ✅ **Must use:** `createCookie` from `@remix-run/cloudflare` (Web API only)
- ✅ **Pattern:** Manual cookie parsing/serialization

**Cookie Utility Implementation:**
- File: `apps/storefront/app/utils/guest-session.server.ts`
- Must use `createCookie()` not `createCookieSessionStorage()`
- Must calculate `maxAge` from JWT `exp` claim dynamically

### Token vs Session Semantics

**Clarification:**
- **Token** = Stateless JWT (signed by backend)
- **Session** = Cookie storage of that same JWT (no server-side session store)
- **Cookie Name Pattern:** `guest_order_{order_id}` allows multi-order support

**Security Implications:**
- Cookie is `HttpOnly` → not accessible to JavaScript (XSS protection)
- Cookie is `SameSite=Strict` → not sent on cross-site requests (CSRF protection)
- JWT payload is READABLE by anyone with token → don't add PII beyond order_id

### Backend Validation Always Required

**Important:** Even though JWT signature is cryptographically valid, loader MUST validate with backend:
- Ensures order still exists
- Ensures order not captured/canceled since token issued
- Applies PII masking
- Rate limiting enforcement

## Tasks / Subtasks

- [ ] **Storefront: Create Cookie Utilities (Cloudflare-Compatible)**
  - [ ] File: `apps/storefront/app/utils/guest-session.server.ts`
  - [ ] Use `createCookie` from `@remix-run/cloudflare` (NOT `createCookieSessionStorage`)
  - [ ] Implement `getGuestToken(request, orderId)` - reads cookie OR URL param (cookie FIRST)
  - [ ] Implement `setGuestToken(token, orderId)` - returns Set-Cookie header string
  - [ ] Implement `clearGuestToken(orderId)` - returns Clear-Cookie header string
  - [ ] Calculate `maxAge` dynamically from JWT `exp` claim using `jwt.decode()` (no verification needed for expiry reading)
  
- [ ] **Storefront: Update Loader - Cookie-First Pattern**
  - [ ] File: `apps/storefront/app/routes/order_.status.$id.tsx`
  - [ ] **Logic Order (CRITICAL):**
    1. Extract orderId from params
    2. Call `getGuestToken(request, orderId)` (checks cookie FIRST, then URL)
    3. If no token → redirect to error page with "Link expired or invalid"
    4. Call `GET /guest-view` with `x-modification-token` header
    5. Handle success (200):
       - If token was from URL (not cookie) → add Set-Cookie header to response
       - Return order data
    6. Handle error (401/403):
       - Add Clear-Cookie header to response
       - Redirect to "Link Expired" page with appropriate message
  - [ ] Remove old token-only-from-URL logic

- [ ] **Storefront: Update Actions - Cookie Token Propagation**
  - [ ] Files: Add Item action, Cancel Order action
  - [ ] Extract token using `getGuestToken(request, orderId)`
  - [ ] Pass token in `x-modification-token` header to backend APIs
  - [ ] Clear cookie on 401/403 responses

- [ ] **Testing (See Testing Requirements section)**

## Testing Requirements

### Unit Tests (Cookie Utilities)
- [ ] `setGuestToken()` creates cookie with correct name `guest_order_{id}`
- [ ] `setGuestToken()` calculates `maxAge` from JWT `exp` claim (not hardcoded 3600)
- [ ] `setGuestToken()` sets `httpOnly`, `secure`, `sameSite=strict`
- [ ] `setGuestToken()` scopes cookie path to `/order/status/{id}`
- [ ] `getGuestToken()` reads cookie BEFORE checking URL param
- [ ] `getGuestToken()` falls back to URL `?token=` if cookie missing
- [ ] `clearGuestToken()` returns Clear-Cookie header with correct name

### Integration Tests (Loader)
- [ ] **Cookie-First:** Visit with cookie set → loader uses cookie token, NOT URL param
- [ ] **URL Fallback:** Visit with URL token, no cookie → Sets cookie for next visit
- [ ] **Cookie Persistence:** Reload page → Uses cookie, no URL param needed
- [ ] **Expired Token in Cookie:** Backend returns 403 → Cookie cleared, redirect to error
- [ ] **Invalid Token in Cookie:** Backend returns 401 → Cookie cleared, redirect to error
- [ ] **No Token (cookie or URL):** Redirect to error immediately

### Integration Tests (Actions)
- [ ] **Add Item with Cookie:** Action reads token from cookie, passes to backend
- [ ] **Cancel Order with Cookie:** Action reads token from cookie, passes to backend
- [ ] **Action Token Expired:** Backend 403 → Cookie cleared, error shown
- [ ] **Cookie Scoping:** Token for Order A doesn't grant access to Order B's actions

## Dev Notes

### Multi-Order Edge Case

**Scenario:** User has multiple orders in grace period simultaneously.

**Design:**
- Cookie names include `order_id`: `guest_order_123`, `guest_order_456`
- Each order has independent cookie with independent expiry
- Accessing Order A, then Order B → both cookies persist
- Cookies expire independently based on each token's TTL

**Cookie Size:** Not a concern (each cookie ~200 bytes for JWT)

### Example Implementation Pattern

```typescript
// apps/storefront/app/utils/guest-session.server.ts
import { createCookie } from "@remix-run/cloudflare";
import jwt from "jsonwebtoken";

function createGuestCookie(orderId: string, maxAge: number) {
  return createCookie(`guest_order_${orderId}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge, // Dynamic, from JWT exp
    path: `/order/status/${orderId}`,
  });
}

export async function getGuestToken(
  request: Request,
  orderId: string
): Promise<string | null> {
  // 1. Cookie FIRST
  const cookie = createGuestCookie(orderId, 3600); // maxAge placeholder for parsing
  const cookieHeader = request.headers.get("Cookie");
  let token = await cookie.parse(cookieHeader);
  
  // 2. URL fallback
  if (!token) {
    const url = new URL(request.url);
    token = url.searchParams.get("token");
  }
  
  return token || null;
}

export async function setGuestToken(
  token: string,
  orderId: string
): Promise<string> {
  // Decode JWT to get expiry (no verification needed, just reading exp)
  const decoded = jwt.decode(token) as { exp: number } | null;
  const now = Math.floor(Date.now() / 1000);
  const maxAge = decoded?.exp ? Math.max(0, decoded.exp - now) : 3600;
  
  const cookie = createGuestCookie(orderId, maxAge);
  return await cookie.serialize(token);
}

export async function clearGuestToken(orderId: string): Promise<string> {
  const cookie = createGuestCookie(orderId, 0); // maxAge 0 = clear
  return await cookie.serialize("", { maxAge: 0 });
}
```

### References

- [Story 4.2 (Guest Auth)](file:///Users/leonliang/Github%20Repo/gracestowel/docs/sprint/sprint-artifacts/4-2-guest-auth-middleware.md)
- [Story 3.1 (Order Status Route)](file:///Users/leonliang/Github%20Repo/gracestowel/docs/sprint/sprint-artifacts/3-1-storefront-timer-edit-ui.md)
- [ModificationTokenService](file:///Users/leonliang/Github%20Repo/gracestowel/apps/backend/src/services/modification-token.ts)
- [Cloudflare Workers Compatibility](https://developers.cloudflare.com/workers/runtime-apis/web-standards/)

## Dev Agent Record

### Implementation Checklist
- [ ] Verify Cloudflare Workers deployment config (wrangler.toml)
- [ ] Test cookie utilities in local dev (Vite) AND staging (Cloudflare)
- [ ] Ensure `jsonwebtoken` package available in storefront for `jwt.decode()`
- [ ] Confirm cookie paths don't conflict with authenticated user sessions

### Agent Model Used

Antigravity (Google Deepmind)

### Completion Notes

(To be filled by implementing dev agent)

### File List

(To be filled by implementing dev agent)
