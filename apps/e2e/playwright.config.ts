import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '.env.test') });
// Fallback to .env if .env.test doesn't exist or for other env vars
dotenv.config({ path: path.resolve(__dirname, '.env') });


export default defineConfig({
  // Test directory
  testDir: './tests',

  // Test file pattern
  testMatch: '**/*.spec.ts',
  testIgnore: ['**/archive/**'],

  // Parallel execution
  fullyParallel: true,
  workers: process.env.CI ? 2 : undefined,

  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,

  // Retry configuration
  retries: process.env.CI ? 2 : 0,

  // Global Setup and Teardown
  globalSetup: require.resolve('./global-setup'),
  globalTeardown: require.resolve('./global-teardown'),

  // Reporter configuration
  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['json', { outputFile: 'test-results/results.json' }],
    ['junit', { outputFile: 'test-results/junit.xml' }],
    process.env.CI ? ['github'] : ['list'],
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
  /* Jules: Commenting out webServer as we don't want to auto-start in this env for now */
  /*
  webServer: process.env.CI ? undefined : {
    command: 'pnpm --filter storefront dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 120_000,
  },
  */
});
