# Sprint Change Proposal: Checkout Payment Flow Fixes

**Date:** 2025-12-12
**Author:** John (PM Agent) + Big Dick
**Status:** Approved
**Scope:** Moderate
**Trace ID:** gt_scp_checkout_2025_12_12

---

## 1. Issue Summary

### Problem Statement
The checkout payment flow has multiple critical bugs causing payment failures, duplicate charges risk, and poor debuggability:

1. **Multiple PaymentIntents created** — Each cart/shipping change creates a NEW PaymentIntent instead of updating existing one
2. **PaymentIntent not persistent** — No session persistence; `clientSecret` changes break Stripe Elements
3. **Order not propagated to backend** — Webhook failures cause silent order creation failures
4. **Payment capture failures** — No retry logic or structured error handling
5. **No error tracing** — Cannot correlate errors across frontend → backend → Stripe

### Root Cause
The implementation violates Stripe's core best practice: **"create once, update as needed"** for PaymentIntents. The current code creates a new PaymentIntent on every `useEffect` trigger instead of reusing/updating the existing one.

### Evidence
From `apps/storefront/app/routes/checkout.tsx`:
```typescript
// BUG: Creates NEW PaymentIntent on every dependency change
useEffect(() => {
    fetch("/api/payment-intent", { ... })
        .then((data) => setClientSecret(data.clientSecret));
}, [cartTotal, currency, items, ...]);  // Triggers on ANY change
```

### Discovery Context
- Discovered during: Implementation testing of Epic 1 (Stripe Integration)
- Affected Stories: 1.2, 1.4, 6.1, 8.1
- Business Impact: Payment failures, potential duplicate charges, poor customer experience

---

## 2. Impact Analysis

### Epic Impact

| Epic | Impact Level | Details |
|------|--------------|---------|
| Epic 1: Stripe Integration | HIGH | Stories 1.2, 1.4 need rework |
| Epic 2: Grace Period | MEDIUM | Depends on correct PaymentIntent handling |
| Epic 3: Order Editing | MEDIUM | `increment_authorization` requires stable base PI |
| Epic 6: Error Handling | HIGH | Needs expansion for payment-specific flows |
| Epic 8: Operational Excellence | HIGH | Story 8.1 (Structured Logging) critical |

### Artifact Conflicts

| Artifact | Conflict | Resolution |
|----------|----------|------------|
| PRD | Missing PaymentIntent lifecycle requirements | Add requirements for PI reuse pattern |
| Architecture (storefront.md) | Says "creation/updates" but only creation implemented | Update to match new implementation |
| Architecture (backend.md) | Webhook idempotency not specified | Add idempotency requirements |

### Technical Impact
- **Frontend**: `checkout.tsx`, `api.payment-intent.ts` require significant changes
- **Backend**: `stripe-event-worker.ts` needs idempotency checks
- **New Code**: Logger utility for structured tracing

---

## 3. Recommended Approach

**Selected Path:** Direct Adjustment (Option 1)

### Rationale
- Issues are implementation bugs, not architectural problems
- PRD and architecture are sound; code doesn't follow Stripe best practices
- Well-documented Stripe patterns to follow
- No rollback needed — fixes build on existing code

### Effort & Risk Assessment

| Factor | Assessment |
|--------|------------|
| Effort | Medium (2-3 days focused work) |
| Risk | Low — following documented Stripe patterns |
| Timeline Impact | Minimal — fixes enable rather than block future work |
| Team Impact | Positive — better debugging, fewer production issues |

---

## 4. Detailed Change Proposals

### Change 1: PaymentIntent Lifecycle Management ✅ APPROVED

**Files:**
- `apps/storefront/app/routes/api.payment-intent.ts`
- `apps/storefront/app/routes/checkout.tsx`

**Changes:**
- Accept optional `paymentIntentId` parameter for reuse
- CREATE with server-generated idempotency key (deterministic from cart hash)
- UPDATE existing PaymentIntent when `paymentIntentId` provided
- Return both `clientSecret` and `paymentIntentId`
- Frontend stores `paymentIntentId` and reuses it
- Only set `clientSecret` once (prevents Elements breaking)
- Single `useEffect` manages create/update lifecycle

**Validates:** FR4 (Auth-Only Flow), Story 1.2, Story 1.4

---

### Change 2: Structured Error Logging ✅ APPROVED

**Files:**
- `apps/storefront/app/lib/logger.ts` (NEW)
- Updates to payment routes

**Changes:**
- Create `createLogger()` utility with trace ID generation
- JSON-structured log output with timestamp, level, context
- Trace ID propagation via `x-trace-id` header
- Return trace ID in error responses for support reference
- Display trace ID to users on payment errors

**Log Format:**
```json
{"timestamp":"...","level":"info","message":"PaymentIntent success","context":{"traceId":"gt_xxx","paymentIntentId":"pi_xxx"}}
```

**Validates:** Story 8.1 (Structured Logging)

---

### Change 3: Backend Order Propagation Fix ✅ APPROVED

**Files:**
- `apps/backend/src/loaders/stripe-event-worker.ts`

**Changes:**
- Add idempotency check before order creation
- Query for existing order with same `stripe_payment_intent_id`
- Skip creation if order already exists
- Add structured logging to webhook handler
- Re-throw errors so Stripe retries webhook

**Validates:** Bug #3 (order not propagated), Story 6.1

---

## 5. Implementation Handoff

### Scope Classification: **Moderate**
Requires backlog reorganization and development coordination.

### Responsibilities

| Role | Responsibility |
|------|----------------|
| **Development Team** | Implement all 3 approved changes |
| **QA** | Test PaymentIntent lifecycle, verify no duplicates |
| **DevOps** | Verify structured logs appear in monitoring |

### Implementation Order
1. **Change 2** (Logger utility) — No dependencies, enables others
2. **Change 1** (PaymentIntent lifecycle) — Core fix
3. **Change 3** (Backend idempotency) — Completes the fix

### Success Criteria
- [ ] Single PaymentIntent per checkout session (verify in Stripe Dashboard)
- [ ] Cart/shipping changes UPDATE existing PI, not create new
- [ ] Structured JSON logs with trace IDs in production
- [ ] Webhook retries don't create duplicate orders
- [ ] Error messages include trace ID for support

### Testing Requirements
- E2E test: Complete checkout, verify single PI created
- E2E test: Change cart during checkout, verify PI updated (not new)
- E2E test: Simulate webhook retry, verify no duplicate order
- Manual: Check Stripe Dashboard for orphaned PaymentIntents (should be none)

---

## 6. PRD/Architecture Updates Needed

### PRD Additions (docs/prd/payment-integration.md)

Add to Section 4.2 (Authorization & Payment Flow):
```markdown
### 4.2.1 PaymentIntent Lifecycle
- **Single Intent Per Session**: The system SHALL create exactly one PaymentIntent per checkout session
- **Reuse Pattern**: WHEN cart or shipping changes, THE system SHALL UPDATE the existing PaymentIntent rather than creating a new one
- **Idempotency**: THE system SHALL use deterministic idempotency keys for PaymentIntent creation to prevent duplicates on network retries
```

Add to Section 5 (Non-Functional Requirements):
```markdown
### 5.2 Observability
- **Structured Logging**: All payment operations SHALL emit JSON-structured logs with trace IDs
- **Trace Correlation**: Trace IDs SHALL be propagated from frontend through backend to enable end-to-end debugging
- **Error References**: User-facing errors SHALL include trace IDs for support escalation
```

### Architecture Updates (docs/architecture/storefront.md)

Update API Proxying section:
```markdown
- `api.payment-intent.ts`: Manages Stripe PaymentIntent lifecycle (create OR update). 
  Accepts optional `paymentIntentId` for updates. Returns both `clientSecret` and `paymentIntentId`.
```

---

## Approval

**Proposal Status:** ✅ All changes approved by Big Dick

**Next Steps:**
1. Create implementation tasks in backlog
2. Assign to development team
3. Schedule for current sprint

---

_Generated by PM Agent (John) during Course Correction workflow_
_Stripe Power used for best practices research_
