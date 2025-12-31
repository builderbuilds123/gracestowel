import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for Grace Stowel E2E tests
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: "./tests",
  /* Output directory for test artifacts */
  outputDir: "./test-results",
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Use single worker to avoid overwhelming the dev server */
  workers: 1,
  /* Reporter to use */
  reporter: [
    ["html", { outputFolder: "playwright-report", open: "never" }],
    ["junit", { outputFile: "test-results/junit.xml" }],
    ["json", { outputFile: "test-results/results.json" }],
    process.env.CI ? ["github"] : ["list"],
  ],
  /* Shared settings for all the projects below */
  use: {
    /* Base URL to use in actions like `await page.goto('/')` */
    baseURL: process.env.STOREFRONT_URL || "https://localhost:5173",
    /* Collect trace when retrying the failed test */
    trace: "retain-on-failure",
    /* Capture screenshot on failure */
    screenshot: "only-on-failure",
    /* Record video on failure */
    video: "retain-on-failure",
    /* Ignore HTTPS errors for local development */
    ignoreHTTPSErrors: true,
    /* Action timeout: 15 seconds (click, fill, etc.) */
    actionTimeout: 15 * 1000,
    /* Navigation timeout: 30 seconds (page.goto, page.reload) */
    navigationTimeout: 30 * 1000,
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },
    /* Test against mobile viewports */
    {
      name: "Mobile Chrome",
      use: { ...devices["Pixel 5"] },
    },
    {
      name: "Mobile Safari",
      use: { ...devices["iPhone 12"] },
    },
    /* Resilience tests project */
    {
      name: "resilience",
      testDir: "./resilience",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  /* Run your local dev server before starting the tests */
  /* In CI, storefront is already running via Docker Compose, so we skip webServer */
  webServer: process.env.CI
    ? undefined
    : {
        command: `cd ../.. && MEDUSA_PUBLISHABLE_KEY=${process.env.MEDUSA_PUBLISHABLE_KEY} CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE='${process.env.CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE}' pnpm --filter apps/storefront dev`,
        url: "https://localhost:5173",
        reuseExistingServer: true,
        ignoreHTTPSErrors: true,
        timeout: 120 * 1000,
      },

  /* Global timeout for each test: 60 seconds */
  timeout: 60 * 1000,

  /* Expect timeout: 15 seconds (all assertions) */
  expect: {
    timeout: 15 * 1000,
  },
});
