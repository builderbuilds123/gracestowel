# Agent Implementation Prompt: E2E Testing Overhaul

## Mission

Implement the **E2E Testing Overhaul** initiative using a **Test-Driven Development (TDD)** approach. The goal is NOT to make all tests pass, but to write correct tests that expose discrepancies between expected and actual system behavior.

**Primary Objective**: Surface existing implementation errors by writing tests that accurately reflect the expected behavior from requirements and specifications.

**Key Deliverable**: A comprehensive discrepancy report documenting all differences between expected behavior (per specs) and actual behavior (per test results), enabling informed decisions about desired behavior and next steps.

## Epic Overview

| Epic | Stories | Goal |
|------|---------|------|
| Epic 1 | 1.1-1.4 | Test Infrastructure Foundation |
| Epic 2 | 2.1-2.3 | Cart Flow Testing |
| Epic 3 | 3.1-3.3 | Payment Intent Flow Testing |
| Epic 4 | 4.1-4.3 | Order Creation Flow Testing |
| Epic 5 | 5.1-5.3 | Order Modification Flow Testing |
| Epic 6 | 6.1-6.2 | Payment Capture Flow Testing |
| Epic 7 | 7.1-7.3 | Payment Error Flow Testing |
| Epic 8 | 8.1-8.2 | UI Smoke Tests & Cross-Browser |
| Epic 9 | 9.1-9.2 | Cleanup & Documentation |

**Total: 25 stories across 9 epics**

## Stories to Implement

Located in `docs/sprint/sprint-artifacts/`:

### Epic 1: Test Infrastructure Foundation
| Story | File | Status | Description |
|-------|------|--------|-------------|
| 1.1 | `e2e-1-1-test-helper-utilities.md` | drafted | Test helpers for orders & webhooks |
| 1.2 | `e2e-1-2-stripe-test-cards.md` | drafted | Stripe test card constants |
| 1.3 | `e2e-1-3-playwright-config.md` | drafted | Playwright config for API-first testing |
| 1.4 | `e2e-1-4-data-factory-fixture.md` | drafted | Data factory for test isolation |

### Epic 2: Cart Flow Testing
| Story | File | Status | Description |
|-------|------|--------|-------------|
| 2.1 | `e2e-2-1-cart-api-tests.md` | drafted | Cart API test suite |
| 2.2 | `e2e-2-2-cart-total-calculation.md` | drafted | Cart total calculation tests |
| 2.3 | `e2e-2-3-cart-state-property-test.md` | drafted | Property test for cart consistency |

### Epic 3: Payment Intent Flow Testing
| Story | File | Status | Description |
|-------|------|--------|-------------|
| 3.1 | `e2e-3-1-payment-intent-api-tests.md` | drafted | PaymentIntent API tests |
| 3.2 | `e2e-3-2-stock-validation-tests.md` | drafted | Stock validation tests |
| 3.3 | `e2e-3-3-payment-intent-property-test.md` | drafted | Property test for amount consistency |

### Epic 4: Order Creation Flow Testing
| Story | File | Status | Description |
|-------|------|--------|-------------|
| 4.1 | `e2e-4-1-webhook-handler-tests.md` | drafted | Webhook handler tests |
| 4.2 | `e2e-4-2-modification-token-tests.md` | drafted | Modification token tests |
| 4.3 | `e2e-4-3-order-creation-property-test.md` | drafted | Property test for order creation |

### Epic 5: Order Modification Flow Testing
| Story | File | Status | Description |
|-------|------|--------|-------------|
| 5.1 | `e2e-5-1-grace-period-tests.md` | drafted | Grace period tests |
| 5.2 | `e2e-5-2-order-cancellation-tests.md` | drafted | Order cancellation tests |
| 5.3 | `e2e-5-3-order-update-tests.md` | drafted | Order update tests |

### Epic 6: Payment Capture Flow Testing
| Story | File | Status | Description |
|-------|------|--------|-------------|
| 6.1 | `e2e-6-1-payment-capture-tests.md` | drafted | Payment capture tests |
| 6.2 | `e2e-6-2-fallback-capture-tests.md` | drafted | Fallback capture tests |

### Epic 7: Payment Error Flow Testing
| Story | File | Status | Description |
|-------|------|--------|-------------|
| 7.1 | `e2e-7-1-payment-decline-tests.md` | drafted | Payment decline tests |
| 7.2 | `e2e-7-2-3ds-tests.md` | drafted | 3D Secure tests |
| 7.3 | `e2e-7-3-network-error-tests.md` | drafted | Network error tests |

### Epic 8: UI Smoke Tests & Cross-Browser
| Story | File | Status | Description |
|-------|------|--------|-------------|
| 8.1 | `e2e-8-1-minimal-smoke-tests.md` | drafted | Minimal UI smoke tests |
| 8.2 | `e2e-8-2-cross-browser-tests.md` | drafted | Cross-browser & viewport tests |

### Epic 9: Cleanup & Documentation
| Story | File | Status | Description |
|-------|------|--------|-------------|
| 9.1 | `e2e-9-1-archive-legacy-tests.md` | drafted | Archive legacy tests |
| 9.2 | `e2e-9-2-update-readme.md` | drafted | Update README documentation |

## Critical Context Files

**MUST READ before implementation:**

1. **Epic Overview**: `docs/epics-e2e-testing.md`
2. **Project Context**: `docs/project_context.md`
3. **Sprint Status**: `docs/sprint/sprint-artifacts/e2e-testing-sprint-status.yaml`
4. **Design Spec**: `.kiro/specs/e2e-testing-overhaul/design.md`
5. **Requirements**: `.kiro/specs/e2e-testing-overhaul/requirements.md`

## Architecture Overview

```
Test Layer → Page Objects → Fixtures → Helpers → External Services

apps/e2e/
├── tests/                    # Test files (*.spec.ts)
│   ├── cart/                 # Epic 2: Cart tests
│   ├── payment/              # Epic 3, 6, 7: Payment tests
│   ├── order/                # Epic 4, 5: Order tests
│   └── smoke/                # Epic 8: Smoke tests
├── fixtures/                 # Playwright fixtures
│   ├── index.ts              # Combined fixtures export
│   ├── data-factory.fixture.ts
│   └── payment.fixture.ts
├── helpers/                  # Test utilities
│   ├── test-cards.ts         # Stripe test cards
│   ├── payment.helper.ts     # Payment simulation
│   ├── webhook.helper.ts     # Webhook simulation
│   ├── data-factory.ts       # Test data generation
│   └── id-generator.ts       # Unique ID generation
├── types/                    # TypeScript types
│   └── test-data.types.ts
├── playwright.config.ts      # Playwright configuration
├── global-setup.ts           # Pre-test setup
└── global-teardown.ts        # Post-test cleanup
```

## Key Design Decisions

### API-First Testing Strategy
> Instead of automating Stripe's hosted checkout pages, tests will:
> 1. Intercept the PaymentIntent creation API call
> 2. Mock the payment confirmation response
> 3. Simulate webhook delivery by calling the webhook endpoint directly
> 4. Verify order creation and state transitions

### Stripe Test Cards
```typescript
const TEST_CARDS = {
  SUCCESS: '4242424242424242',
  DECLINE_GENERIC: '4000000000000002',
  DECLINE_INSUFFICIENT_FUNDS: '4000000000009995',
  REQUIRES_3DS: '4000002760003184',
  REQUIRES_3DS_FAIL: '4000008260003178',
} as const;
```

### Property-Based Testing
Use `fast-check` library for property tests:
- Property 1: Cart State Consistency
- Property 2: PaymentIntent Amount Consistency
- Property 5: Order Creation from Webhook

### Timeout Configuration
- Test timeout: 60s
- Action timeout: 15s
- Navigation timeout: 30s
- CI retries: 2

## Implementation Requirements

### NFR Targets
- NFR1: Test suite completes in <10 minutes
- NFR2: <5% flakiness rate
- NFR3: Retry failed tests up to 2 times in CI
- NFR5: Support Chromium, Firefox, WebKit
- NFR6: Support desktop (1280×720) and mobile (375×667) viewports

### Environment Variables
```env
STOREFRONT_URL=http://localhost:3000
BACKEND_URL=http://localhost:9000
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_test_...
JWT_SECRET=test-jwt-secret
```

## Story Dependencies

```
Epic 1 (Infrastructure) ──► Epic 2 (Cart) ──► Epic 3 (Payment Intent)
                                    │
                                    ▼
                              Epic 4 (Order Creation)
                                    │
                                    ▼
                              Epic 5 (Order Modification)
                                    │
                                    ▼
                              Epic 6 (Payment Capture)
                                    │
                                    ▼
                              Epic 7 (Payment Errors)
                                    │
                                    ▼
                              Epic 8 (Smoke Tests)
                                    │
                                    ▼
                              Epic 9 (Cleanup)
```

**Implementation Order**: Epic 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9

## Iteration Protocol

For each story, follow this cycle:

### 1. Read & Understand
- Read the story file completely
- Understand acceptance criteria and technical context
- Note dependencies on previous stories

### 2. Implement
- Follow patterns from existing test infrastructure
- Use Playwright fixtures for test isolation
- Implement helpers and utilities as specified

### 3. Test
- Run the specific test file: `pnpm --filter e2e test <test-file>`
- Ensure all tests pass
- Verify no flakiness (run 3x)

### 4. Validate
- Check for TypeScript errors: `pnpm --filter e2e typecheck`
- Check for lint errors: `pnpm --filter e2e lint`
- Verify test isolation (parallel runs don't conflict)

### 5. Iterate
- If any check fails, fix and re-validate
- Continue until all criteria met

### 6. Update Story Status
- Update the story file's `Status:` field to `done`
- Update `e2e-testing-sprint-status.yaml` with new status
- Add implementation notes to story file

## Success Criteria

Implementation is complete when:

### Test Infrastructure
- [ ] All 25 stories have `Status: done`
- [ ] Playwright config supports API-first testing with proper timeouts
- [ ] Test helpers created: webhook simulation, payment helpers, data factory
- [ ] Stripe test cards constants available

### Test Coverage (tests written, NOT necessarily passing)
- [ ] Cart API tests written (add, update, remove, totals)
- [ ] PaymentIntent tests written (create, update, idempotency)
- [ ] Webhook handler tests written (order creation, signature validation)
- [ ] Grace period tests written (timing, modifications, cancellation)
- [ ] Payment capture tests written (normal + fallback)
- [ ] Payment error tests written (declines, 3DS, network errors)
- [ ] Smoke tests written for Chromium, Firefox, WebKit
- [ ] Mobile viewport tests written

### Documentation & Cleanup
- [ ] Legacy tests archived
- [ ] README updated with testing documentation
- [ ] **Discrepancy Report created** at `docs/e2e-discrepancy-report.md`

### Quality Gates
- [ ] Test suite executes without crashes (tests may fail, but must run)
- [ ] All changes committed to branch `feature/e2e-testing-overhaul`
- [ ] Commit messages follow conventional commits format

## TDD Approach

### Philosophy
Tests are written to reflect **expected behavior from specifications**, not current implementation. Failing tests are valuable — they expose gaps between spec and reality.

### Workflow for Each Test
1. **Read the spec** — Understand what the system SHOULD do
2. **Write the test** — Assert the expected behavior
3. **Run the test** — Observe pass/fail
4. **Document discrepancies** — If test fails, record in discrepancy report
5. **Do NOT fix the implementation** — That's a separate task

### Handling Test Failures
When a test fails:
1. Verify the test logic is correct (test is testing the right thing)
2. Confirm the expected behavior matches the spec
3. Add entry to `docs/e2e-discrepancy-report.md`
4. Mark test with `test.fixme()` or `test.skip()` with reason comment
5. Continue to next test

## Discrepancy Report

Create and maintain `docs/e2e-discrepancy-report.md` with the following structure:

```markdown
# E2E Test Discrepancy Report

Generated: [DATE]
Test Suite Version: [COMMIT HASH]

## Summary

| Category | Tests Written | Passing | Failing | Skipped |
|----------|---------------|---------|---------|---------|
| Cart Flow | X | X | X | X |
| Payment Intent | X | X | X | X |
| Order Creation | X | X | X | X |
| ... | ... | ... | ... | ... |
| **Total** | **X** | **X** | **X** | **X** |

## Critical Discrepancies (P0)

### [DISC-001] PaymentIntent amount mismatch
- **Test**: `payment-intent.spec.ts > creates PaymentIntent with correct amount`
- **Expected**: Amount = (cartTotal + shipping) × 100 cents
- **Actual**: Amount = cartTotal × 100 (shipping not included)
- **Spec Reference**: FR12.4, design.md section 3.2
- **Impact**: Customers undercharged for shipping
- **Recommendation**: Fix implementation OR update spec if intentional

### [DISC-002] ...

## High Priority Discrepancies (P1)

### [DISC-003] ...

## Medium Priority Discrepancies (P2)

### [DISC-004] ...

## Low Priority / Cosmetic (P3)

### [DISC-005] ...

## Passing Tests (Behavior Confirmed)

List of behaviors that match specifications:
- Cart add/remove operations work correctly
- Webhook signature validation rejects invalid signatures
- ...

## Open Questions

Behaviors where spec is ambiguous or missing:
1. What should happen when cart item quantity exceeds stock during checkout?
2. Should 3DS failures allow retry or require new PaymentIntent?
3. ...

## Next Steps

Based on this report, the team should:
1. Review each discrepancy and decide: Fix implementation OR update spec
2. Prioritize fixes based on impact (P0 first)
3. Create implementation stories for approved fixes
4. Update specs where behavior change is intentional
```

## Discrepancy Classification

| Priority | Definition | Example |
|----------|------------|---------|
| P0 - Critical | Money/security/data integrity issues | Wrong payment amounts, missing auth |
| P1 - High | Core flow broken, bad UX | Order not created, wrong status |
| P2 - Medium | Feature partially broken | Grace period timing off by minutes |
| P3 - Low | Cosmetic, edge cases | Wrong error message text |

## Commands Reference

```bash
# Create feature branch
git checkout -b feature/e2e-testing-overhaul

# Install dependencies
pnpm install

# Run all E2E tests
pnpm --filter e2e test

# Run tests with UI
pnpm --filter e2e test:ui

# Run specific test file
pnpm --filter e2e test tests/cart/cart-api.spec.ts

# Run tests for specific browser
pnpm --filter e2e test:chromium
pnpm --filter e2e test:firefox
pnpm --filter e2e test:webkit

# Run API-only tests (no browser)
pnpm --filter e2e test:api

# Run mobile viewport tests
pnpm --filter e2e test:mobile

# View test report
pnpm --filter e2e report

# Type check
pnpm --filter e2e typecheck

# Lint
pnpm --filter e2e lint
```

## Key Interfaces

```typescript
// Webhook Mock Fixture
interface WebhookMockFixture {
  mockWebhookEvent(eventType: string, payload: object): Promise<void>;
  mockPaymentIntentAuthorized(paymentIntentId: string, amount: number): Promise<void>;
  mockPaymentIntentCaptured(paymentIntentId: string): Promise<void>;
  mockPaymentIntentFailed(paymentIntentId: string, error: string): Promise<void>;
}

// Data Factory Fixture
interface DataFactoryFixture {
  createProduct(overrides?: Partial<Product>): Promise<Product>;
  createCustomer(overrides?: Partial<Customer>): Promise<Customer>;
  createOrder(overrides?: Partial<Order>): Promise<Order>;
  cleanup(): Promise<void>;
}

// Payment Simulation Result
interface PaymentSimulationResult {
  success: boolean;
  paymentIntentId: string;
  status: Stripe.PaymentIntent.Status;
  error?: string;
  requires3DS?: boolean;
}
```

## Begin

1. First, create the feature branch: `git checkout -b feature/e2e-testing-overhaul`
2. Start with Epic 1, Story 1.1 (Test Helper Utilities)
3. Read the story file, implement, test, validate, iterate until done
4. Proceed through stories in order: 1.1 → 1.2 → 1.3 → 1.4 → 2.1 → ...
5. Complete all 25 stories across 9 epics
