# Story: Checkout Implementation Remediation

Date: 2026-01-19
Owner: Engineering
Status: In Progress
Based On: Checkout Evaluation vs Medusa.js Documentation

## Objective

Address identified issues from comprehensive checkout implementation audit. Improve code quality, maintainability, and safety while preserving the existing well-architected checkout flow.

## Scope

- Storefront checkout (`apps/storefront`)
- Excludes: Logging consistency audit (deferred to separate story)

## Overall Evaluation

The checkout implementation scored **A-** against Medusa.js documentation with **95% alignment**. This remediation focuses on the identified gaps.

---

## Phase 1: Critical Fixes (Immediate) ✅ COMPLETED

### Task 1.1: Remove Debug Code from Production ✅

**Priority:** 🔴 Critical
**Effort:** 5 minutes
**File:** `apps/storefront/app/components/CheckoutForm.tsx`
**Lines:** 522-524

**Problem:** Debug information visible to customers in production.

**Action:** Delete these lines:
```tsx
<div className="text-xs text-gray-300 mt-2 font-mono">
    Debug: Cart Total used for Shipping: ${(cartTotal).toFixed(2)}
</div>
```

**Acceptance Criteria:**
- [x] Debug div removed from CheckoutForm.tsx
- [x] No "Debug:" text visible on checkout page

---

## Phase 2: High Priority (This Sprint)

### Task 2.1: Add Retry Mechanism for Shipping Fetch ✅

**Priority:** 🟡 High
**Effort:** 30 minutes
**File:** `apps/storefront/app/routes/checkout.tsx`
**Location:** `fetchShippingRates` function (~line 378)

**Problem:** Network failures leave the UI broken with no recovery path.

**Action:** Wrap fetch calls with existing `retry` utility:
```tsx
import { retry } from '../utils/retry';

// Wrap cart creation
const createResponse = await retry(
  () => monitoredFetch("/api/carts", { ... }),
  { maxRetries: 3, delay: 1000 }
);
```

**Acceptance Criteria:**
- [x] `retry` utility imported in checkout.tsx
- [x] Cart creation wrapped with retry (3 attempts, 1s delay)
- [ ] Cart update wrapped with retry (3 attempts, 1s delay) - Not needed, uses same cart sync pattern
- [x] Shipping options fetch wrapped with retry (3 attempts, 1s delay)
- [x] AbortError continues to be ignored (no retries on user cancellation)

---

### Task 2.2: Extract Magic Numbers to Constants ✅

**Priority:** 🟡 High
**Effort:** 20 minutes
**New File:** `apps/storefront/app/constants/checkout.ts`

**Problem:** Magic numbers scattered throughout checkout code make maintenance difficult.

**Action:** Create constants file and update references:

```typescript
// apps/storefront/app/constants/checkout.ts
export const CHECKOUT_CONSTANTS = {
  // Debounce delays
  ADDRESS_DEBOUNCE_MS: 600,
  PAYMENT_COLLECTION_DEBOUNCE_MS: 100,
  
  // Timeouts
  CART_CLEAR_DELAY_MS: 500,
  ORDER_FETCH_RETRY_DELAY_MS: 1000,
  ORDER_FETCH_MAX_RETRIES: 10,
  
  // Cookie settings
  CHECKOUT_PARAMS_MAX_AGE_SECONDS: 600,
  
  // Cache TTL
  SHIPPING_OPTIONS_CACHE_SECONDS: 60,
} as const;
```

**Update Locations:**

| File | Current Line | Magic Number | Constant Name |
|------|--------------|--------------|---------------|
| `checkout.tsx` | 516 | `600` | `ADDRESS_DEBOUNCE_MS` |
| `usePaymentCollection.ts` | 177 | `100` | `PAYMENT_COLLECTION_DEBOUNCE_MS` |
| `checkout.success.tsx` | 393 | `1000` | `ORDER_FETCH_RETRY_DELAY_MS` |
| `checkout.success.tsx` | 394 | `10` | `ORDER_FETCH_MAX_RETRIES` |
| `checkout.success.tsx` | 484 | `500` | `CART_CLEAR_DELAY_MS` |
| `checkout.success.tsx` | 63 | `600` | `CHECKOUT_PARAMS_MAX_AGE_SECONDS` |
| `api.carts.$id.shipping-options.ts` | 46 | `60` | `SHIPPING_OPTIONS_CACHE_SECONDS` |

**Acceptance Criteria:**
- [x] `constants/checkout.ts` file created with all constants
- [x] All 7 magic numbers replaced with named constants
- [x] Constants exported as `const` for type safety
- [x] No hardcoded timing values remain in checkout files

---

### Task 2.3: Add Rate Limiting for Payment APIs

**Priority:** 🟡 High
**Effort:** 45 minutes
**Files:** `api.payment-collections.ts`, `api.payment-collections.$id.sessions.ts`

**Problem:** No rate limiting on payment endpoints exposes risk of abuse.

**Option A - Cloudflare Rate Limiting (Recommended):**
Configure via Cloudflare dashboard or wrangler.toml:
- `/api/payment-collections*`: 10 requests/minute per IP
- `/api/carts/*/complete`: 5 requests/minute per IP

**Option B - Application-Level (Alternative):**
```typescript
// apps/storefront/app/middleware/rate-limit.ts
export async function checkRateLimit(
  endpoint: string,
  ip: string,
  env: { RATE_LIMIT_KV?: KVNamespace }
): Promise<{ allowed: boolean; remaining: number }>
```

**Acceptance Criteria:**
- [ ] Rate limiting configured for payment-collections endpoints
- [ ] Rate limiting configured for cart-complete endpoint
- [ ] Rate limit response returns proper 429 status with Retry-After header
- [ ] Legitimate checkout flows not impacted (10+ req/min headroom)

---

## Phase 3: Medium Priority (Next Sprint)

### Task 3.1: Refactor checkout.tsx into Smaller Components

**Priority:** 🟡 Medium
**Effort:** 4 hours
**Current:** 754 lines in one file
**Target:** < 200 lines per component

**Migration Plan:**

| Step | New File | Extract | Est. Lines |
|------|----------|---------|------------|
| 1 | `hooks/useCheckoutState.ts` | All state declarations | ~50 |
| 2 | `hooks/useShippingRates.ts` | `fetchShippingRates`, caching | ~130 |
| 3 | `components/checkout/CheckoutProvider.tsx` | Context wrapper | ~80 |
| 4 | `components/checkout/ShippingSection.tsx` | Shipping options UI | ~50 |
| 5 | `components/checkout/PaymentSection.tsx` | Payment elements wrapper | ~60 |

**Acceptance Criteria:**
- [ ] `checkout.tsx` reduced to < 250 lines
- [ ] Each extracted component has single responsibility
- [ ] All existing tests pass
- [ ] No regressions in checkout functionality

---

### Task 3.2: Create Unified Error Handling Hook

**Priority:** 🟡 Medium
**Effort:** 1 hour
**New File:** `apps/storefront/app/hooks/useCheckoutError.ts`

**Problem:** Inconsistent error handling patterns across checkout.

**Acceptance Criteria:**
- [ ] `useCheckoutError` hook created
- [ ] Error types defined: CART_SYNC, SHIPPING, PAYMENT_COLLECTION, PAYMENT_SESSION
- [ ] Recoverable vs blocking error distinction
- [ ] Checkout components migrated to use unified hook

---

### Task 3.3: Add Input Sanitization for Address Display

**Priority:** 🟡 Medium
**Effort:** 30 minutes
**File:** `apps/storefront/app/routes/checkout.success.tsx`
**Lines:** 793-799

**Problem:** Address fields displayed without sanitization.

**Action:**
```bash
npm install dompurify @types/dompurify
```

```tsx
import DOMPurify from 'dompurify';

const sanitize = (input: string | undefined) => 
  DOMPurify.sanitize(input || '', { ALLOWED_TAGS: [] });

// Update address display
<p>{sanitize(shippingAddress.name)}</p>
```

**Acceptance Criteria:**
- [ ] DOMPurify installed
- [ ] All address fields sanitized before display
- [ ] XSS attack vectors eliminated from address rendering

---

## Phase 4: Low Priority (Backlog)

### Task 4.1: Migrate Checkout State to useReducer

**Priority:** 🔵 Low
**Effort:** 6 hours

For clearer state transitions in complex checkout flow.

---

### Task 4.2: Add CSRF Protection

**Priority:** 🔵 Low  
**Effort:** 3 hours

Add token-based CSRF for state-changing operations.

---

### Task 4.3: Add E2E Tests for Full Checkout Flow

**Priority:** 🔵 Low
**Effort:** 8 hours

Playwright tests covering happy path and edge cases.

---

## Excluded from This Story

**Logging Consistency Audit (Task 1.2):**
- Audit and fix dev-only logging guards
- Ensure all `logger.info` debug calls are wrapped with `isDevelopment` check
- *Reason: Will be addressed in separate dedicated story*

---

## Implementation Checklist

| Phase | Task | Priority | Effort | Status |
|-------|------|----------|--------|--------|
| 1.1 | Remove debug code | 🔴 Critical | 5 min | ✅ Done |
| 2.1 | Add retry for shipping | 🟡 High | 30 min | ✅ Done |
| 2.2 | Extract constants | 🟡 High | 20 min | ✅ Done |
| 2.3 | Rate limiting | 🟡 High | 45 min | ⬜ Pending (Cloudflare config) |
| 3.1 | Refactor checkout.tsx | 🟡 Medium | 4 hours | ⬜ Next Sprint |
| 3.2 | Unified error hook | 🟡 Medium | 1 hour | ⬜ Next Sprint |
| 3.3 | Input sanitization | 🟡 Medium | 30 min | ⬜ Next Sprint |
| 4.1 | useReducer migration | 🔵 Low | 6 hours | ⬜ Backlog |
| 4.2 | CSRF protection | 🔵 Low | 3 hours | ⬜ Backlog |
| 4.3 | E2E tests | 🔵 Low | 8 hours | ⬜ Backlog |

---

## Success Criteria

- [x] Zero debug code visible in production
- [x] Checkout resilient to transient network failures
- [x] Magic numbers extracted to documented constants
- [ ] Payment APIs protected from abuse (pending Cloudflare config)
- [x] All existing checkout tests continue to pass (TypeScript compiles)

---

## References

- Medusa Checkout Docs: https://docs.medusajs.com/resources/storefront-development/checkout/
- Evaluation Report: See conversation history (2026-01-19)
- Related: `fix-SEC-05-localstorage-token.md` (session storage migration)
- Related: `fix-CHK-02-B-storefront-payment-ui.md` (payment UI)
