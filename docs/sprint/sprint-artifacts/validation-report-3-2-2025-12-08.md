# Validation Report

**Document:** docs/sprint/sprint-artifacts/3-2-increment-authorization-logic.md
**Checklist:** create-story checklist (bmad/bmm/workflows/4-implementation/create-story/checklist.md)
**Date:** 2025-12-08

## Summary
- Overall: 2/10 passed (20%)
- Critical Issues: 7

## Section Results

### Story Foundation & Scope
⚠ PARTIAL — Story mentions workflow + totals + Stripe increment, but omits rollback posture, idempotency, concurrency, and token/auth preconditions. Evidence: lines 5-15.

### Acceptance Criteria Completeness
✗ FAIL — AC lacks rollback requirement (DB + Stripe), concurrency handling, idempotency key use, input validation, and explicit error responses. Evidence: lines 17-29 focus on happy path and high-level failure.

### Architecture & API Linkage
✗ FAIL — No detailed contract for route (payload schema, token auth, response codes), nor linkage to existing order edit/tax/shipping services. Evidence: tasks lines 33-40 only mention files.

### Reuse & Anti-duplication
⚠ PARTIAL — Points to `cancel-order-with-refund.ts` as template but gives no mapping of reused utilities, DI tokens, or shared steps; risk of reimplementation. Evidence: line 54 reference without specifics.

### Error Handling & Edge Cases
✗ FAIL — No guidance for Stripe partial failures, idempotency collisions, retry vs no-retry, max increment rules, tax/shipping calc failures, or partial DB persistence. Evidence: AC and tasks omit.

### Data & Security
✗ FAIL — Missing token validation rules, authz, input validation (line items), fraud/PCI considerations, and logging/audit requirements. Evidence: request spec line 17 lacks detail.

### Performance & UX
⚠ PARTIAL — No timeout/backoff guidance for Stripe call; no observability/metrics; no mention of rate limiting. Evidence: absent in tasks.

### Testing Requirements
✗ FAIL — No unit/integration/contract tests listed (workflow success/failure, rollback, Stripe mock). Evidence: none in file.

### File Structure & Ownership
⚠ PARTIAL — Files listed but no structure for shared steps, types, or mocks; no DI registration guidance. Evidence: lines 33-40.

### LLM Optimization & Clarity
⚠ PARTIAL — Instructions concise but under-specified; lacks do/don’t to prevent skipping rollback/idempotency.

## Failed Items
1. Missing rollback semantics across DB and Stripe (must specify compensating steps and transaction boundaries).
2. No explicit API contract for `POST /store/orders/:id/line-items` (payload schema, headers, auth/token rules, status codes, error bodies).
3. No idempotency/concurrency guidance (Medusa idempotency keys, lock around order edits, dedup on Stripe increment).
4. No validation rules for items/totals (tax/shipping provider errors, stock checks, currency rounding).
5. No error handling paths for Stripe failures, network timeouts, or partial DB writes.
6. No testing matrix (unit for steps, integration for workflow, contract for route, Stripe mock scenarios including failure/timeout).
7. No observability/metrics or audit logging requirements.

## Partial Items
1. Template reuse mentioned but lacks mapping; risk of reinvention.
2. File locations stated but no guidance on shared types/config registration.
3. Performance/resilience hints absent (timeouts/backoff), leaving ambiguity.
4. Clarity ok but missing guardrails to avoid cutting rollback.

## Recommendations
1. **Must Fix:** Define full API contract (payload shape, token/auth rules, idempotency key handling, responses, error codes) and workflow step contract (inputs/outputs).
2. **Must Fix:** Specify rollback plan: database transaction boundaries, compensating actions when Stripe increment fails after DB work, and how to avoid double increments.
3. **Must Fix:** Add concurrency/idempotency guidance (locks on order id, Medusa idempotency keys, Stripe idempotency key per attempt).
4. **Should Add:** Validation + calculation details (tax/shipping provider calls, currency rounding, zero/negative totals) and logging/metrics for increment attempts.
5. **Should Add:** Testing plan: unit for each step, integration for workflow including failure path, contract tests for route, Stripe mocked failure/timeout, race condition test.
6. **Nice:** Performance/backoff parameters and alerts for repeated increment failures.
