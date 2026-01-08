# Implementation Readiness Assessment Report

**Date:** 2026-01-07
**Project:** gracestowel

## Document Discovery Findings

**Whole Documents:**
- **PRDs:**
  - `docs/prd/payment-integration.md`
  - `docs/prd/transactional-email.md`
  - `docs/prd/e2e-testing-overhaul.md`
- **Architecture:**
  - `docs/architecture/backend.md`
  - `docs/architecture/storefront.md`
  - `docs/architecture/integrations.md`
- **Epics:**
  - `docs/product/epics/payment-integration.md`
  - `docs/product/epics/transactional-email-epics.md`
  - `docs/product/epics/cart-based-shipping.md`

**Target Story for Review:**
- `docs/sprint/sprint-artifacts/fix-CHK-02-cart-payment-collection.md`

**Issues Found:**
- **Path Configuration:** `planning_artifacts` path in config was set to `docs/planning-artifacts` but directory does not exist. Found artifacts in `docs/prd`, `docs/architecture`, `docs/product`.
- **Target Context:** Reviewing specific story `fix-CHK-02` against `payment-integration` Epic and PRD.

**Ready to proceed?** [C] Continue to Story Validation

## PRD Analysis

### Functional Requirements

**From `docs/prd/payment-integration.md`:**

- **FR1:** Implement `<ExpressCheckoutElement />` at the top of checkout (Apple Pay, Google Pay, PayPal, Link).
- **FR2:** Implement `<PaymentElement />` for Credit Cards and BNPL.
- **FR3:** Full support for Guest Checkout (no account required to pay).
- **FR4:** Payments must be **Authorized Only** (`capture_method: manual`).
- **FR5:** System must validly hold funds for 1-hour grace period.
- **FR6:** **Single Intent Per Session**: Create exactly one PaymentIntent per session; update existing on changes.
- **FR7:** Use deterministic idempotency keys for PaymentIntent creation.
- **FR8:** Do NOT change `clientSecret` after initial creation.
- **FR9:** Persist `order_id` and `edit_token` in HttpOnly Cookie/LocalStorage.
- **FR10:** Generate Redis Token (`capture_intent:{order_id}`) with 1-hour TTL.
- **FR11:** Order Confirmation emails must contain Magic Link for guest access.
- **FR12:** "Edit Order" button visible only with active token.
- **FR13:** Add Item triggers `increment_authorization`; Block if failed.
- **FR14:** Auto-capture on Redis Key Expiration event.
- **FR15:** Fallback cron job for stuck authorizations.
- **FR16:** **Edit Freeze**: Block updates if Redis key missing or order captured.

### Non-Functional Requirements

**From `docs/prd/payment-integration.md`:**

- **NFR1 (Security):** All payment inputs must use hosted iframes (Stripe Elements).
- **NFR2 (Compliance):** Full SAQ-A PCI Compliance.
- **NFR3 (Performance):** Webhook processing must use **Redis Event Bus**.
- **NFR4 (Reliability):** Redis Keyspace Notifications enabled (`notify-keyspace-events Ex`).
- **NFR5 (Observability):** JSON-structured logs with `timestamp`, `level`, `message`, `context`.
- **NFR6 (Observability):** Trace IDs (`gt_{timestamp}_{random}`) propagated via headers.
- **NFR7 (Observability):** User-facing errors include `traceId`.
- **NFR8 (Reliability):** Webhook idempotency (check existing orders).

### PRD Completeness Assessment

The PRD `payment-integration.md` is comprehensive regarding the payment lifecycle, including specific rules for PaymentIntent management (FR6-FR8) which are directly relevant to the target story `fix-CHK-02`. It explicitly calls out the need for updating existing intents and not changing client secrets, which addresses the root cause issues mentioned in the story.

## Epic Coverage Validation

### Coverage Matrix

| FR ID | Requirement | Covered By | Status |
| :--- | :--- | :--- | :--- |
| **FR1** | Express Checkout | Epic 1 / Story 1.3 | ✓ Covered |
| **FR2** | Standard Payment | Epic 1 / Story 1.2 | ✓ Covered |
| **FR3** | Guest Checkout | Epic 1 / Story 1.2, 4.1, 4.2 | ✓ Covered |
| **FR4** | Auth-Only Flow | Epic 1 / Story 1.4 | ✓ Covered |
| **FR5** | 1-Hour Grace Period | Epic 2 / Story 2.1 | ✓ Covered |
| **FR6** | **Single Intent Per Session** | **NOT FOUND** | ❌ MISSING |
| **FR7** | Deterministic Idempotency | **NOT FOUND** | ❌ MISSING |
| **FR8** | Stable `clientSecret` | **NOT FOUND** | ❌ MISSING |
| **FR9** | Session Persistence | Epic 4 / Story 4.3 | ✓ Covered |
| **FR10** | Redis Token | Epic 2 / Story 2.1 | ✓ Covered |
| **FR11** | Magic Link | Epic 4 / Story 4.1 | ✓ Covered |
| **FR12** | Edit Order Visibility | Epic 3 / Story 3.1 | ✓ Covered |
| **FR13** | Increment Authorization | Epic 3 / Story 3.2 | ✓ Covered |
| **FR14** | Auto Capture | Epic 2 / Story 2.2, 2.3 | ✓ Covered |
| **FR15** | Fallback Cron | Epic 2 / Story 2.4 | ✓ Covered |
| **FR16** | Edit Freeze | Epic 6 / Story 6.3 | ✓ Covered |

### Missing Requirements

The following Functional Requirements from the PRD are **NOT** explicitly covered in the existing `docs/product/epics/payment-integration.md` stories:

- **FR6 (Single Intent Per Session):** The Epic does not explicitly mandate the "Payment Collection" architecture or the rule to reuse existing intents.
- **FR7 (Deterministic Idempotency):** Not explicitly detailed in the Epic stories.
- **FR8 (Stable `clientSecret`):** Not explicitly mentioned.

**Impact:** These missing requirements are the **exact root cause** of the issues `fix-CHK-02` aims to solve ("Payment collection has not been initiated for cart"). The existing Epic implies a simpler direct-to-Stripe flow that is currently broken.

**Recommendation:** The target story `fix-CHK-02-cart-payment-collection.md` **IS** the remediation for these missing requirements. It directly addresses FR6, FR8, and implicitly FR7 by implementing the Medusa Payment Collection flow.

### Coverage Statistics

- Total PRD FRs: 16
- FRs covered in epics: 13
- Coverage percentage: 81%

## UX Alignment Assessment

### UX Document Status

**Not Found**
- The file `docs/product/ux-specs.md` exists but it is for a different feature ("Transparent Impact") and contains template placeholders.
- No specific UX specification found for "Payment Integration" or "Checkout".

### Warnings

**⚠️ MISSING UX DOCUMENTATION**
- The Epic `payment-integration.md` explicitly notes: "UX Design: Not available (Will infer standard patterns)".
- **Implied UI:** The PRD requires specific UI elements (`<ExpressCheckoutElement>`, `<PaymentElement>`, "Edit Order" button, Timer).
- **Risk:** Without clear UX specs, there is a risk of inconsistent implementation or poor user experience for the "1-Hour Grace Period" timer and edit flow.
- **Mitigation:** Rely on standard Stripe Elements patterns and inferred designs as noted in the Epic.

## Epic Quality Review

### Target Story Analysis: `fix-CHK-02-cart-payment-collection.md`

**1. Structure & Sizing**
- **Type:** Implementation Story (Fix).
- **Sizing:** Medium (1-2 days).
- **Structure:** Contains 5 distinct Phases (Backend API, Storefront, Refactor, Cart Completion, Testing).
- **Observation:** This is a **complex story** that borders on being an Epic itself. The "Phases" typically map to individual stories in a standard workflow (e.g., Phase 1: Backend API, Phase 2: React Component).
- **Recommendation:** Proceed as is for a "Fix", but treat strictly as a multi-step task.

**2. User Value**
- **Clear:** "As a customer... I want my payment tracked... So that my order is created."
- **Aligned:** Directly addresses the critical breakage in checkout.

**3. Dependencies**
- **Pre-requisites:** `fix-PAY-01` (Done), `fix-SHP-01` (Done).
- **Blocking:** `fix-RET-02`.
- **Status:** Dependencies are clear and resolved.

**4. Best Practices Compliance**
- [x] User Value defined
- [x] Acceptance Criteria clear and measurable (AC1-AC7)
- [x] Dependencies identified
- [ ] Atomic Sizing (Contains 5 implementation phases in one file)

**Critical Quality Note:**
The story is well-defined but large. It essentially refactors the entire payment flow. 
- **Risk:** High complexity in a single work unit.
- **Mitigation:** Ensure rigorous testing of each phase.

## Summary and Recommendations

### Overall Readiness Status

**READY (With Cautions)**

The story `fix-CHK-02-cart-payment-collection.md` is **CRITICAL** to resolving fundamental architecture defects in the current implementation. It correctly identifies and remediates the "Single Intent" and "Payment Collection" gaps found in the existing Epic.

### Critical Issues Requiring Immediate Action

1.  **Missing UX Specs:** No visual design exists for the "1-Hour Timer" or "Edit Order" flow. Developers must rely on Stripe Elements and standard constraints.
2.  **Story Complexity:** The story is very large (5 phases). It requires high focus to avoid regression.

### Recommended Next Steps

1.  **Approve Story:** The story content is high quality and necessary.
2.  **Clarify UX:** Before starting Phase 2 (Storefront), briefly sketch/confirm the "Edit Order" UI state (where does the timer go? what does the button look like?).
3.  **Split if Needed:** If Phase 1 (Backend) drags on, consider splitting Phase 2+ into a separate story `feat-CHK-03-order-editing-ui`.

### Final Note

This assessment identified **3** missing FRs in the original Epic which this story **solves**. The story is a necessary "Fix" to bring the system inline with Medusa v2 best practices. Proceed with implementation, but keep a close eye on the UI/UX decisions.

**Update (2026-01-07):**
Per user request, the original story `fix-CHK-02` was split into 3 atomic stories to reduce complexity:
1. `fix-CHK-02-A-backend-payment-collection.md`
2. `fix-CHK-02-B-storefront-payment-ui.md`
3. `fix-CHK-02-C-order-completion-flow.md`






