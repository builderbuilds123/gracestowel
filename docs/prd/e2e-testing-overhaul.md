---
stepsCompleted: [1]
inputDocuments:
  - .kiro/specs/e2e-testing-overhaul/requirements.md
  - .kiro/specs/e2e-testing-overhaul/design.md
  - .kiro/specs/e2e-testing-overhaul/tasks.md
documentCounts:
  briefs: 0
  research: 0
  brainstorming: 0
  projectDocs: 1
  specs: 3
workflowType: 'prd'
lastStep: 1
specReference: '.kiro/specs/e2e-testing-overhaul/'
---

# Product Requirements Document - E2E Testing Overhaul

**Author:** Big Dick  
**Date:** December 14, 2025  
**Project:** gracestowel  
**Status:** Draft

---

## 1. Executive Summary

This PRD defines the requirements for overhauling the Grace Stowel E2E testing suite. The current test suite has significant issues including failing tests, missing coverage, hardcoded dependencies, and lack of proper architecture patterns. This initiative transforms the fragmented test suite into a robust, maintainable framework using Playwright with an API-first testing approach.

**Detailed Specification:** See `.kiro/specs/e2e-testing-overhaul/requirements.md`

---

## 2. Problem Statement

### Current State
- E2E tests are failing and unreliable
- Hardcoded product handles and test data cause brittleness
- No proper Page Object Model architecture
- Missing coverage for critical payment and order flows
- Visual regression tests are flaky and hard to maintain
- Tests depend on specific database state

### Impact
- Developers lack confidence in deployments
- Bugs reach production that should be caught by E2E tests
- CI/CD pipeline is unreliable due to flaky tests
- Manual testing burden increases release cycle time

---

## 3. Goals & Success Metrics

### Primary Goals
1. **Reliability**: Achieve <5% test flakiness rate
2. **Coverage**: 100% coverage of critical user journeys (checkout, order modification, payment)
3. **Maintainability**: Page Object Model architecture for all major pages
4. **Speed**: API-first testing approach for faster execution

### Success Metrics
| Metric | Current | Target |
|--------|---------|--------|
| Test Pass Rate | ~60% | >95% |
| Flakiness Rate | ~30% | <5% |
| Critical Flow Coverage | Partial | 100% |
| Test Execution Time | N/A | <10 min |

---

## 4. User Personas

### QA Engineer
- Needs maintainable, reusable test architecture
- Wants clear test organization by feature domain
- Requires comprehensive reporting and debugging tools

### Developer
- Needs reliable tests that catch real bugs
- Wants fast feedback in CI/CD pipeline
- Requires easy local debugging (headed mode, traces)

### CI/CD Engineer
- Needs stable tests for deployment gates
- Wants comprehensive reporting (HTML, JSON, JUnit)
- Requires retry mechanisms for transient failures

---

## 5. Scope

### In Scope
- Test architecture foundation (Page Objects, Fixtures, Helpers)
- Cart flow testing via API
- Payment intent lifecycle testing
- Order creation and modification testing
- Grace period feature testing
- Payment error and recovery testing
- Minimal UI smoke tests
- Stripe webhook mocking

### Out of Scope
- Full UI testing (UI may be revamped)
- Visual regression testing (deferred)
- Performance/load testing
- Mobile app testing

---

## 6. Functional Requirements

**Full Requirements:** See `.kiro/specs/e2e-testing-overhaul/requirements.md`

### Summary (15 Requirements)

| ID | Requirement | Priority |
|----|-------------|----------|
| R1 | Test Architecture Foundation | P0 |
| R2 | Critical User Journey Coverage | P0 |
| R3 | Test Data Management | P0 |
| R4 | Network and Error Handling | P1 |
| R5 | Visual Regression Testing | P2 (deferred) |
| R6 | Test Execution and Reporting | P0 |
| R7 | Cross-Browser and Device Testing | P1 |
| R8 | Grace Period Feature Testing | P0 |
| R9 | Stripe Payment Integration Testing | P0 |
| R10 | Playwright MCP Integration | P1 |
| R11 | Test Stability and Flakiness Prevention | P0 |
| R12 | Complete Checkout Flow Testing | P0 |
| R13 | Order Lifecycle Testing | P0 |
| R14 | Payment Failure and Recovery Testing | P0 |
| R15 | Price Calculation and Discount Testing | P1 |

---

## 7. Non-Functional Requirements

### Performance
- Test suite completes in <10 minutes
- Individual tests timeout at 60s (test), 15s (action), 30s (navigation)

### Reliability
- <5% flakiness rate
- Retry failed tests up to 2 times in CI

### Maintainability
- Page Object Model for all major pages
- Consistent file naming (`*.spec.ts`)
- Tests grouped by feature domain

### Compatibility
- Chromium, Firefox, WebKit browsers
- Desktop (1280×720) and mobile (375×667) viewports

---

## 8. Technical Approach

**Full Design:** See `.kiro/specs/e2e-testing-overhaul/design.md`

### Key Design Decisions

1. **API-First Testing**: Test business logic via API, not UI (UI may be revamped)
2. **Webhook Mocking**: Simulate Stripe webhooks instead of automating hosted pages
3. **Property-Based Testing**: Use fast-check for correctness properties
4. **Network-First Pattern**: Intercept requests before navigation

### Architecture
```
Test Layer → Page Objects → Fixtures → Helpers → External Services
```

### Correctness Properties (15 total)
- Cart State Consistency
- PaymentIntent Amount Consistency
- Stock Validation Error Display
- Payment Authorization State
- Order Creation from Webhook
- Modification Token Generation
- Grace Period Modification Availability
- Grace Period Expiration Behavior
- Order Cancellation During Grace Period
- Payment Decline Error Display
- 3D Secure Challenge Handling
- Idempotency Key Duplicate Prevention
- Fallback Capture Recovery
- Cart Persistence Across Sessions
- Responsive Viewport Behavior

---

## 9. Implementation Plan

**Full Task List:** See `.kiro/specs/e2e-testing-overhaul/tasks.md`

### Phases

| Phase | Tasks | Effort |
|-------|-------|--------|
| 1. Infrastructure | Test helpers, Stripe cards, config | 1-2 days |
| 2. Cart Flow | Cart API tests, property tests | 1-2 days |
| 3. Payment Intent | PI creation, stock validation | 2-3 days |
| 4. Order Creation | Webhook handlers, mod tokens | 2-3 days |
| 5. Order Modification | Grace period, cancellation | 2-3 days |
| 6. Payment Capture | Capture flow, fallback | 1-2 days |
| 7. Payment Errors | Decline handling, 3DS | 1-2 days |
| 8. UI Smoke Tests | Minimal page load tests | 0.5 days |
| 9. Cleanup | Archive legacy, documentation | 0.5 days |

**Total Estimated Effort:** 12-18 days

---

## 10. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Stripe API changes | Tests break | Pin Stripe SDK version, monitor changelog |
| Backend API changes | Tests break | Use API contracts, coordinate with backend team |
| Flaky network in CI | False failures | Retry mechanism, deterministic waits |
| Test data collisions | Parallel test failures | Unique identifiers (UUID, timestamps) |

---

## 11. Dependencies

- **Playwright**: Test framework
- **fast-check**: Property-based testing library
- **Stripe Test Mode**: Payment testing
- **Backend API**: Order and payment endpoints
- **Redis/BullMQ**: Job queue for capture testing

---

## 12. Open Questions

1. Should we include visual regression tests in MVP or defer entirely?
2. What's the acceptable test execution time budget for CI?
3. Do we need to test against staging Stripe or is test mode sufficient?

---

## 13. References

- **Requirements Spec:** `.kiro/specs/e2e-testing-overhaul/requirements.md`
- **Design Spec:** `.kiro/specs/e2e-testing-overhaul/design.md`
- **Implementation Tasks:** `.kiro/specs/e2e-testing-overhaul/tasks.md`
- **Existing E2E Tests:** `apps/e2e/`
- **Stripe Testing Docs:** https://stripe.com/docs/testing

