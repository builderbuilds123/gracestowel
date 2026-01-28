# Testing Strategy Design (PR Fast-Fail + Nightly Full)

**Date:** 2026-01-28  
**Status:** Approved  
**Owner:** Engineering  

## Goal

Keep PRs fast and deterministic while preserving high assurance for critical flows. Reduce CI time by replacing full E2E runs on every PR with a small smoke suite, and move staging‑dependent contract checks to nightly/manual workflows.

## Current State

- PRs run: lint/typecheck/audit, backend tests, storefront tests, E2E (full), Postman/Newman contract tests (staging).
- E2E sometimes exceeds 15 minutes and is the primary PR bottleneck.
- Postman runs against staging, so it validates environment health, not PR code.

## Decision

1. **PR suite (fast‑fail)**  
   - Keep lint/typecheck, backend tests, storefront tests.  
   - Run **E2E smoke** only (3 critical flows).  
   - Remove Postman from PR gating (move to nightly/manual).

2. **Nightly/Release**  
   - Run **full E2E** suite.  
   - Run Postman/Newman contract tests against staging.  

## E2E Smoke Suite (PR)

Smoke tests are limited to the most critical flows:

- `apps/e2e/tests/full-checkout.happy.spec.ts`
- `apps/e2e/tests/storefront/homepage-navigation.spec.ts`
- `apps/e2e/tests/backend/api-workflows.spec.ts`

## CI Workflow Changes

- Update `.github/workflows/ci.yml`:
  - Replace full E2E job with **E2E Smoke Tests** job.
- Add `.github/workflows/e2e-full.yml`:
  - Nightly + manual **full E2E** runs (sharded).
- Update `.github/workflows/api-contract-tests.yml`:
  - Nightly + manual runs (remove PR trigger).

## Success Criteria

- PR CI wall‑clock drops significantly (target < 6 minutes).
- E2E remains reliable for critical flows on PRs.
- Full coverage retained via nightly runs.
