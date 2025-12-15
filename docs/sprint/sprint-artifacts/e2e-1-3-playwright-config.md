# Story 1-3: Update Playwright Config for API-First Testing

**Epic:** Epic 1 - Test Infrastructure Foundation  
**Status:** drafted  
**Created:** 2025-12-14  
**Requirements:** FR6.1, FR6.2, FR6.3, FR6.5

---

## User Story

As a **CI/CD engineer**,  
I want **Playwright configured for API-first testing with proper timeouts and retries**,  
So that **tests run reliably in CI with comprehensive reporting**.

---

## Acceptance Criteria

### AC1: CI Retry Configuration
**Given** the Playwright config is updated  
**When** tests run in CI  
**Then** failed tests are retried up to 2 times

### AC2: Comprehensive Reporting
**Given** the Playwright config is updated  
**When** tests complete  
**Then** HTML, JSON, and JUnit XML reports are generated

### AC3: Timeout Configuration
**Given** the Playwright config is updated  
**When** a test times out  
**Then** the timeout values are 60s (test), 15s (action), 30s (navigation)

### AC4: Debug Artifacts
**Given** the Playwright config is updated  
**When** tests fail  
**Then** screenshots, videos, and traces are captured for debugging

---

## Technical Context

### Architecture Reference
From `.kiro/specs/e2e-testing-overhaul/design.md`:

> **Network-first pattern** for deterministic test execution
> **API-based setup** for fast, reliable test data preparation

### NFR Requirements
- NFR1: Performance - Test suite completes in <10 minutes
- NFR2: Reliability - <5% flakiness rate
- NFR3: Reliability - Retry failed tests up to 2 times in CI
- NFR4: Timeouts - 60s test, 15s action, 30s navigation
- NFR5: Compatibility - Chromium, Firefox, WebKit browsers
- NFR6: Compatibility - Desktop (1280×720) and mobile (375×667) viewports

---

## Implementation Tasks

### Task 1: Update Playwright Config
**File:** `apps/e2e/playwright.config.ts`

```typescript
import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.test' });

export default defineConfig({
  // Test directory
  testDir: './tests',
  
  // Test file pattern
  testMatch: '**/*.spec.ts',
  
  // Parallel execution
  fullyParallel: true,
  workers: process.env.CI ? 2 : undefined,
  
  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,
  
  // Retry configuration
  retries: process.env.CI ? 2 : 0,
  
  // Reporter configuration
  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['json', { outputFile: 'test-results/results.json' }],
    ['junit', { outputFile: 'test-results/junit.xml' }],
    ['list'], // Console output
  ],
  
  // Global timeout settings
  timeout: 60_000, // 60s per test
  expect: {
    timeout: 10_000, // 10s for assertions
  },
  
  // Shared settings for all projects
  use: {
    // Base URL for navigation
    baseURL: process.env.STOREFRONT_URL || 'http://localhost:3000',
    
    // Action timeout
    actionTimeout: 15_000, // 15s
    
    // Navigation timeout
    navigationTimeout: 30_000, // 30s
    
    // Collect trace on failure
    trace: 'on-first-retry',
    
    // Screenshot on failure
    screenshot: 'only-on-failure',
    
    // Video on failure
    video: 'on-first-retry',
    
    // Extra HTTP headers for API requests
    extraHTTPHeaders: {
      'Accept': 'application/json',
    },
  },
  
  // Project configurations
  projects: [
    // Desktop browsers
    {
      name: 'chromium',
      use: { 
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
      },
    },
    {
      name: 'firefox',
      use: { 
        ...devices['Desktop Firefox'],
        viewport: { width: 1280, height: 720 },
      },
    },
    {
      name: 'webkit',
      use: { 
        ...devices['Desktop Safari'],
        viewport: { width: 1280, height: 720 },
      },
    },
    
    // Mobile viewports
    {
      name: 'mobile-chrome',
      use: { 
        ...devices['Pixel 5'],
        viewport: { width: 375, height: 667 },
      },
    },
    {
      name: 'mobile-safari',
      use: { 
        ...devices['iPhone 12'],
        viewport: { width: 375, height: 667 },
      },
    },
    
    // API-only tests (no browser)
    {
      name: 'api',
      testMatch: '**/*.api.spec.ts',
      use: {
        // No browser needed for API tests
      },
    },
  ],
  
  // Output directory for test artifacts
  outputDir: 'test-results',
  
  // Web server configuration (optional - for local dev)
  webServer: process.env.CI ? undefined : {
    command: 'pnpm --filter storefront dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
```

### Task 2: Create Environment Config
**File:** `apps/e2e/.env.test.example`

```env
# Storefront URL
STOREFRONT_URL=http://localhost:3000

# Backend API URL
BACKEND_URL=http://localhost:9000

# Stripe Test Keys
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_test_...

# JWT Secret for modification tokens
JWT_SECRET=test-jwt-secret-for-e2e

# Test mode flag
TEST_MODE=true
```

### Task 3: Create Global Setup
**File:** `apps/e2e/global-setup.ts`

```typescript
import { FullConfig } from '@playwright/test';

async function globalSetup(config: FullConfig) {
  console.log('🚀 Starting E2E test suite...');
  
  // Verify required environment variables
  const requiredEnvVars = [
    'STOREFRONT_URL',
    'BACKEND_URL',
    'STRIPE_SECRET_KEY',
  ];
  
  const missing = requiredEnvVars.filter(v => !process.env[v]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  
  // Health check - verify services are running
  const storefrontUrl = process.env.STOREFRONT_URL!;
  const backendUrl = process.env.BACKEND_URL!;
  
  try {
    const [storefrontRes, backendRes] = await Promise.all([
      fetch(storefrontUrl).catch(() => null),
      fetch(`${backendUrl}/health`).catch(() => null),
    ]);
    
    if (!storefrontRes?.ok) {
      console.warn(`⚠️ Storefront not responding at ${storefrontUrl}`);
    }
    if (!backendRes?.ok) {
      console.warn(`⚠️ Backend not responding at ${backendUrl}`);
    }
  } catch (error) {
    console.warn('⚠️ Health check failed:', error);
  }
  
  console.log('✅ Global setup complete');
}

export default globalSetup;
```

### Task 4: Create Global Teardown
**File:** `apps/e2e/global-teardown.ts`

```typescript
import { FullConfig } from '@playwright/test';

async function globalTeardown(config: FullConfig) {
  console.log('🧹 Cleaning up E2E test suite...');
  
  // Any global cleanup can go here
  // e.g., delete test data, close connections
  
  console.log('✅ Global teardown complete');
}

export default globalTeardown;
```

### Task 5: Update Package.json Scripts
**File:** `apps/e2e/package.json` (partial)

```json
{
  "scripts": {
    "test": "playwright test",
    "test:ui": "playwright test --ui",
    "test:headed": "playwright test --headed",
    "test:debug": "playwright test --debug",
    "test:api": "playwright test --project=api",
    "test:chromium": "playwright test --project=chromium",
    "test:firefox": "playwright test --project=firefox",
    "test:webkit": "playwright test --project=webkit",
    "test:mobile": "playwright test --project=mobile-chrome --project=mobile-safari",
    "report": "playwright show-report",
    "codegen": "playwright codegen"
  }
}
```

---

## Dependencies

### NPM Packages
- `@playwright/test` - Test framework
- `dotenv` - Environment variable loading

### Configuration Files
- `playwright.config.ts` - Main config
- `.env.test` - Test environment variables
- `global-setup.ts` - Pre-test setup
- `global-teardown.ts` - Post-test cleanup

---

## Definition of Done

- [ ] Playwright config updated with all timeout settings
- [ ] Retry mechanism configured (2 retries in CI)
- [ ] HTML, JSON, and JUnit reporters configured
- [ ] Screenshots, videos, and traces captured on failure
- [ ] Desktop and mobile viewport projects defined
- [ ] API-only test project configured
- [ ] Global setup verifies environment and services
- [ ] Package.json scripts updated for various test modes
- [ ] Tests run successfully in CI environment

---

## Test Scenarios

### Scenario 1: Verify Timeout Configuration
```typescript
test('timeout configuration is correct', async ({ page }) => {
  // This test should timeout after 60s if it hangs
  // Action timeout is 15s
  // Navigation timeout is 30s
});
```

### Scenario 2: Verify Retry on Failure
```typescript
test('retries on transient failure', async ({ page }) => {
  // In CI, this should retry up to 2 times
  // Locally, no retries
});
```

### Scenario 3: Verify Report Generation
```bash
# After test run, verify reports exist:
# - playwright-report/index.html
# - test-results/results.json
# - test-results/junit.xml
```

---

## Notes

- API tests use a separate project with no browser overhead
- Mobile tests run on both Chrome and Safari mobile emulation
- Traces are only captured on first retry to save storage
- Web server config is disabled in CI (services run separately)

---

## References

- Design Spec: `.kiro/specs/e2e-testing-overhaul/design.md`
- Requirements: `.kiro/specs/e2e-testing-overhaul/requirements.md` (FR6.1-6.5)
- Playwright Config Docs: https://playwright.dev/docs/test-configuration
- Playwright Reporters: https://playwright.dev/docs/test-reporters
