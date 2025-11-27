# Test Automation Implementation Plan

## Goal Description
Establish a robust, scalable, and maintainable test automation framework for the Grace Stowel monorepo. This strategy covers the entire testing pyramid, from unit tests to full-stack E2E scenarios, ensuring high confidence in deployments for both the Medusa backend and the Remix storefront.

## Proposed Changes

### 1. Backend (`apps/backend`)
The backend utilizes Jest and `@medusajs/test-utils`.
-   **Integration Tests**:
    -   Expand coverage for custom API routes, ensuring all new endpoints have corresponding tests.
    -   **Transaction Isolation**: Ensure all integration tests run within database transactions that are rolled back after execution to maintain a clean state and allow parallel execution.
-   **Unit Tests**:
    -   Mandatory unit tests for all complex business logic in Services and Subscribers.
    -   Mock external dependencies (e.g., Stripe, SendGrid) to test logic in isolation.

### 2. Storefront (`apps/storefront`)
Currently lacks a dedicated test runner. We will introduce a modern testing stack centered around Vitest.
-   **Core Setup**:
    -   **Vitest**: Fast, Vite-native test runner.
    -   **React Testing Library**: For testing components in a way that resembles user interaction.
    -   **User Event**: `@testing-library/user-event` for realistic event simulation.
-   **Mocking Strategy**:
    -   **MSW (Mock Service Worker)**: Intercept network requests at the network layer. This allows us to test storefront components and loaders in complete isolation from the backend, simulating various API states (success, error, loading) deterministically.
-   **Quality & Accessibility**:
    -   **Vitest-Axe**: Integrate `vitest-axe` to automatically catch accessibility violations (a11y) during component testing.
-   **Scripts**: Add `test`, `test:ui`, and `test:coverage` to `package.json`.

### 3. End-to-End (E2E)
A dedicated workspace `apps/e2e` will be created to validate critical user flows across the integrated system.
-   **Tooling**: **Playwright** for its speed, reliability, and powerful debugging tools.
-   **Data Management**:
    -   **Seeding Scripts**: Develop scripts to seed the backend with known test data (products, shipping options, test users) before the test suite runs. This ensures tests run against a predictable state.
    -   **Environment Isolation**: Tests should run against a dedicated test environment (e.g., a local Dockerized stack or ephemeral CI environment) to prevent data pollution.
-   **Critical Flows**:
    -   Guest Checkout Flow (Browse -> Add to Cart -> Checkout -> Payment).
    -   Customer Login and Order History.
    -   Admin workflows (if applicable/customized).
-   **Visual Regression**:
    -   Utilize Playwright's visual comparison capabilities for critical pages (Homepage, Product Page, Checkout) to catch unintended UI regressions.

### 4. CI/CD Integration Strategy
Automated tests will be the gatekeepers of our deployment pipeline. We will use **GitHub Actions** for our CI/CD workflow.

-   **Pipeline Stages**:
    1.  **Validation & Security**:
        -   Linting (ESLint) & Type Checking (TypeScript).
        -   **Dependency Audit**: Run `npm audit` or use tools like Snyk to catch security vulnerabilities in dependencies.
    2.  **Build & Unit Tests**:
        -   Build backend and storefront in parallel.
        -   Run Unit & Integration tests (Jest/Vitest) in parallel.
    3.  **E2E Tests**:
        -   Deploy to an **ephemeral environment** (defined via Docker Compose).
        -   Run Playwright tests.
    4.  **Chaos/Resilience Tests**:
        -   Execute resilience tests against the ephemeral environment.
        -   Inject controlled failures (database latency, API timeouts, network partitions).
        -   Validate recovery mechanisms, error handling, and graceful degradation.
        -   Use Toxiproxy for network chaos injection.
-   **Optimization**:
    -   **Caching**: Implement caching for `node_modules` and build artifacts (e.g., Next.js `.next` cache) to speed up pipeline execution.
    -   **Sharding**: Configure Playwright sharding to distribute E2E tests across multiple CI workers to reduce total runtime.
-   **Artifacts**: Configure CI to upload Playwright traces, videos, screenshots, and chaos experiment reports upon test failure for rapid debugging.
-   **Flakiness Management**: Configure retries (e.g., 1 retry) for E2E tests in CI to handle transient network issues, while monitoring for genuine instability.

### 5. Infrastructure & Environment
To ensure consistency between development and CI environments, we will treat our test infrastructure as code.

-   **Containerization**:
    -   Use **Docker Compose** to define the test stack (Backend, Postgres, Redis, Storefront).
    -   Create a `docker-compose.test.yml` optimized for CI (minimal resources, no unnecessary services).
-   **Data Management**:
    -   **Seeding**: Use a dedicated seed script to populate the database with a known state before tests run.
    -   **Reset**: Ensure the database is reset or rolled back between test runs (or suites) to prevent data pollution.

### 6. Observability & Reporting
-   **Test Reports**: Generate JUnit XML reports for integration with CI dashboards to track test trends over time.
-   **Notifications**: Integrate with Slack/Teams to notify the team of build failures immediately.
-   **Resilience Metrics**: Track MTTR (Mean Time to Recovery), error budgets, blast radius, and graceful degradation scores.

### 7. Resilience Testing Layer

Validate system behavior under real-world failure conditions through controlled chaos experiments.

#### 7.1 Backend Resilience Tests (`apps/backend/tests/resilience/`)

**Objective**: Ensure the Medusa backend maintains critical functionality and degrades gracefully under infrastructure and dependency failures.

##### Database Chaos
-   **Connection Pool Exhaustion**: Verify request queuing and timeout handling when all DB connections are consumed.
-   **Database Restart Recovery**: Test connection retry logic and transaction rollback when database restarts mid-transaction.
-   **Replication Lag**: Validate stale data handling and eventual consistency if using read replicas.
-   **Partial Database Failures**: Test read-only mode handling and graceful degradation.

##### External Service Chaos
-   **Stripe API Failures**:
    -   Timeout handling (30s+) without order corruption.
    -   Webhook delivery delays and idempotency validation.
    -   Complete Stripe outage fallback (checkout blocked with clear messaging).
-   **SendGrid Failures**:
    -   Email queuing when SendGrid returns 503 errors.
    -   Order processing continues despite email delivery failures.
-   **Redis Cache Failures**:
    -   Session management degradation.
    -   Graceful fallback to database-backed sessions.

##### Resource Exhaustion
-   **Memory Pressure**: Verify request throttling and no OOM crashes at 90%+ memory usage.
-   **Rate Limiting**: Test abuse protection (1000+ req/s) without impacting legitimate traffic.
-   **CPU Saturation**: Validate response time degradation and circuit breaker activation.

#### 7.2 Storefront Resilience Tests (`apps/storefront/tests/resilience/`)

**Objective**: Ensure excellent customer UX even when backend services degrade.

##### Backend Failure Scenarios (using MSW)
-   **Slow API Responses**: Show cached/stale data with loading indicators for 5s+ delays.
-   **500/503 Errors**: Display error states while preserving navigation and cart data.
-   **Partial API Failures**: Handle mixed success/failure states gracefully.
-   **Payment API Failures**: Prevent checkout with clear error messages and retry options.

##### Browser/Client Chaos
-   **Network Disconnection**: Preserve cart in localStorage and recover on reconnection.
-   **JavaScript Errors**: Error boundaries display fallback UI instead of white screens.
-   **Offline Mode**: Core browsing functionality available without backend.

#### 7.3 End-to-End Chaos Tests (`apps/e2e/resilience/`)

**Objective**: Validate critical user flows under real-world failure conditions in an integrated environment.

##### Chaos E2E with Playwright + Toxiproxy
-   **Network Latency**: Complete checkout despite intermittent 500ms latency spikes.
-   **Transient Failures**: Verify retry logic when payment API fails once then succeeds.
-   **Database Connection Drops**: Order completes with automatic reconnection and retry.
-   **Webhook Delays**: Order status reconciliation after delayed webhook delivery.
-   **CDN Failures**: Critical flows work with fallback asset loading.

### 8. Chaos Automation & Game Days

#### 8.1 Automated Chaos in CI/CD

Integrate automated resilience testing as Stage 4 in the CI/CD pipeline:

```yaml
# .github/workflows/chaos-tests.yml
chaos-tests:
  needs: e2e-tests
  runs-on: ubuntu-latest
  steps:
    - name: Setup Chaos Environment
      run: docker-compose -f docker-compose.chaos.yml up -d
    
    - name: Run Toxiproxy
      run: docker run -d -p 8474:8474 shopify/toxiproxy
    
    - name: Execute Resilience Tests
      run: npm run test:resilience
    
    - name: Generate Chaos Report
      run: npm run chaos:report
```

**Safety Controls**:
-   Only run in isolated test environments (ephemeral containers).
-   Blast radius limited to CI infrastructure.
-   Automatic experiment termination after 30s timeout.
-   No access to production data or systems.

#### 8.2 Monthly Game Days

**Purpose**: Practice incident response and discover unknown failure modes in controlled staging environment.

**Game Day Scenarios**:
1.  **Database Failover Drill**: Manually fail primary database, verify replica promotion and application recovery.
2.  **Payment Provider Outage**: Disable Stripe, verify fallback messaging and order queuing.
3.  **Deployment Rollback**: Deploy intentionally broken version, practice automated rollback procedures.
4.  **Load-Induced Failure**: Simulate Black Friday traffic (10x normal), identify breaking points.

**Cadence**: Monthly, 4-hour sessions with full engineering team participation.

**Documentation**: Maintain game day runbooks in `/docs/operations/gamedays/`.

### 9. Resilience Metrics Dashboard

#### Key Resilience Metrics

| Metric | Definition | Target |
|--------|------------|--------|
| **MTTR** (Mean Time to Recovery) | Time from failure detection to full recovery | < 10 minutes |
| **Error Budget** | Acceptable failure rate before alerting | 0.1% of requests |
| **Blast Radius** | % of users affected by typical failure | < 5% |
| **Recovery Rate** | % of failures recovered automatically | > 95% |
| **Graceful Degradation Score** | % of features operational during partial outage | > 75% |

#### Implementation

-   **Backend Metrics**: Emit failure/recovery events to monitoring (DataDog, CloudWatch).
-   **Dashboards**: Create Grafana/DataDog dashboards visualizing:
    -   Error rates by service component
    -   Recovery time distributions
    -   Circuit breaker states (open/half-open/closed)
    -   Retry attempt success rates
-   **Alerting**: Configure alerts for MTTR > 10min, error budget depletion, blast radius > 5%.

### 10. Failure Mode Documentation

Maintain **Failure Mode and Effects Analysis (FMEA)** in `/docs/operations/failure-modes.md`:

| Component | Failure Mode | Impact | Probability | Mitigation | Detection |
|-----------|--------------|--------|-------------|------------|-----------||
| PostgreSQL | Connection pool exhausted | Checkout fails | Medium | Connection pooling, queue requests | Connection metrics alert |
| Stripe API | Timeout on payment capture | Order stuck in pending | Low | Retry with exponential backoff | Webhook reconciliation job |
| SendGrid | Email delivery failure | Customers miss confirmation | Medium | Queue for retry, fallback SMS | Delivery status tracking |
| Redis | Cache eviction | Increased DB load | High | Graceful degradation, TTL tuning | Cache hit rate metrics |

## Verification Plan

### Automated Verification
-   **Backend**: `npm run test:integration -w apps/backend` (Passes with transaction rollbacks).
-   **Storefront**: `npm run test -w apps/storefront` (Passes with MSW mocks and a11y checks).
-   **E2E**: `npx playwright test` (Passes full user flows against seeded local environment).
-   **Resilience Tests**:
    -   **Backend Chaos**: `npm run test:resilience -w apps/backend` (Validates database, external service, and resource exhaustion handling).
    -   **Storefront Chaos**: `npm run test:resilience -w apps/storefront` (Validates backend failure scenarios and client-side chaos).
    -   **E2E Chaos**: `npm run test:chaos:e2e` (Validates critical flows under network latency, failures, and recovery).

### Manual Verification
-   Review CI pipeline logs to ensure all 4 stages (Validation → Unit Tests → E2E → Chaos) execute correctly.
-   Verify chaos experiment reports are generated and uploaded as artifacts on failure.
-   Validate resilience metrics dashboard displays MTTR, error budget, and recovery rates.

## Implementation Phases

> [!IMPORTANT]
> **Strategy Simplified**: Based on project size (2-app e-commerce monorepo), we've prioritized critical business flows and basic resilience over advanced chaos engineering. Phases 1-4 deliver 80% of testing value in 6-8 weeks. Advanced chaos (Phase 5) is optional and should only be implemented if experiencing production issues.

### Phase 0: Audit & Baseline (Week 1)

**Prerequisites - Complete Before Starting Implementation**

- [ ] **Audit Existing Tests**: Document current backend test coverage (Jest integration tests)
- [ ] **Research Medusa v2 Test Utils**: Verify `@medusajs/test-utils@2.11.3` supports:
  - Database transaction-based test isolation
  - External service mocking (Stripe, Resend)
  - Jest ESM mode compatibility
- [ ] **Create E2E Workspace**: 
  - `mkdir -p apps/e2e`
  - Initialize `apps/e2e/package.json` with Playwright dependencies
  - Add `test:e2e` script to root `package.json`
- [ ] **Docker Infrastructure**:
  - Create `docker-compose.yml` (dev environment: Postgres, Redis, Backend, Storefront)
  - Create `docker-compose.test.yml` (CI-optimized for GitHub Actions)
- [ ] **GitHub Actions Setup**: Create skeleton workflow file `.github/workflows/ci.yml`
- [ ] **Install Vitest in Storefront**: Add Vitest + React Testing Library to `apps/storefront`

### Phase 1: Critical Path E2E Tests (Weeks 2-3)

**Focus: Highest business value & risk areas**

- [ ] **Guest Checkout Flow**:
  - Browse products → Add to cart → Checkout → Payment
  - Test with valid Stripe test card
  - Verify order confirmation
- [ ] **Payment Integration Tests**:
  - Stripe payment successful
  - Stripe payment declined (test error handling)
  - Card validation errors
- [ ] **Basic Resilience**:
  - Stripe API timeout handling (30s+ delay)
  - Backend 500 error during checkout (retry logic)
  - Cart persistence in localStorage during failures
- [ ] **Visual Regression**: Playwright screenshots for Homepage, Product Page, Checkout

### Phase 2: Backend Integration & Unit Tests (Weeks 4-5)

**Focus: API coverage & external service mocking**

- [ ] **Custom API Routes**: Expand coverage for all custom endpoints
- [ ] **Transaction Isolation**: Ensure all integration tests use database transaction rollbacks
- [ ] **External Service Mocking**:
  - Mock Stripe API calls in integration tests
  - Mock Resend email API (not SendGrid)
  - Test business logic in isolation
- [ ] **Unit Tests**: Add unit tests for complex Services and Subscribers
- [ ] **CI Integration**: Add backend tests to GitHub Actions workflow

### Phase 3: Storefront Component Tests & Basic Resilience (Week 6)

**Focus: Component testing with MSW**

- [ ] **Core Setup**:
  - Configure Vitest with `happy-dom` environment (Cloudflare Workers compatibility)
  - Set up MSW (Mock Service Worker) for API mocking
  - Install `@testing-library/react` + `@testing-library/user-event`
  - Add `vitest-axe` for accessibility testing
- [ ] **Component Tests**:
  - Cart functionality (add, remove, update quantities)
  - Product display components
  - Checkout form validation
- [ ] **MSW-based Resilience**:
  - Backend 500 errors → Display error state
  - Slow API responses (5s+ delay) → Show loading indicators
  - Network disconnection → Preserve cart data
- [ ] **Accessibility**: Run a11y tests on all components
- [ ] **CI Integration**: Add storefront tests to GitHub Actions

### Phase 4: Production Monitoring & Basic Observability (Week 7-8)

**Focus: Real-world monitoring before advanced chaos**

- [ ] **Error Tracking**: Set up Sentry or Rollbar in both backend and storefront
- [ ] **Uptime Monitoring**: Configure external monitoring (UptimeRobot, Checkly)
- [ ] **Performance Monitoring**:
  - Add Lighthouse CI to GitHub Actions (enforce performance budgets)
  - Set budget: LCP < 2.5s, FID < 100ms, CLS < 0.1
- [ ] **Runbooks**: Create incident response documentation in `/docs/operations/runbooks/`
- [ ] **Deployment Automation**: Verify Railway + Cloudflare Workers deploy automatically after GitHub push

---

### Phase 5: Advanced Chaos Engineering (Optional - Weeks 9+)

> [!CAUTION]
> **Only implement if**: (1) experiencing production reliability issues, or (2) scaling to high traffic (10k+ daily orders). For most e-commerce sites, production monitoring (Phase 4) is sufficient.

#### Week 9-10: Toxiproxy & Network Chaos
- [ ] Add Toxiproxy to `docker-compose.chaos.yml`
- [ ] Configure proxy for Postgres, Redis, backend API
- [ ] Network latency injection tests (500ms+ spikes)
- [ ] Connection drop and reconnection tests

#### Week 11-12: Resilience Metrics & Game Days
- [ ] Implement resilience metrics dashboard (MTTR, error budget, blast radius)
- [ ] Document Failure Mode and Effects Analysis (FMEA) in `/docs/operations/failure-modes.md`
- [ ] Execute first game day (database failover drill)
- [ ] Establish monthly game day cadence

#### Week 13+: Continuous Chaos Automation
- [ ] Integrate chaos tests into CI/CD pipeline (Stage 4)
- [ ] Weekly automated chaos experiments
- [ ] Load testing with k6 or artillery (100+ concurrent users)
