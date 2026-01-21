import path from "path";
import os from "os";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, ".env") });
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config({ path: path.resolve(__dirname, "../backend/.env") }); // Load backend env to get Stripe Secret Key
import { defineConfig, devices } from "@playwright/test";

if (
  process.platform === "darwin" &&
  process.arch === "arm64" &&
  (!os.cpus().length || !os.cpus().some((cpu) => cpu.model.includes("Apple")))
) {
  process.env.PLAYWRIGHT_HOST_PLATFORM_OVERRIDE ??= "mac15-arm64";
}

const isMacArm = process.platform === "darwin" && process.arch === "arm64";
const shouldUseHeadless = process.env.CI ? true : true; // Default to headless even on Mac ARM to avoid popups
const chromiumLaunchArgs: string[] = [];

if (process.env.CI) {
  chromiumLaunchArgs.push("--no-sandbox", "--disable-dev-shm-usage");
}

if (isMacArm) {
  chromiumLaunchArgs.push("--no-crashpad", "--disable-crash-reporter");
}

const chromiumChannel = process.env.E2E_USE_SYSTEM_CHROME === "true" ? "chrome" : undefined;
const chromiumLaunchOptions = chromiumLaunchArgs.length > 0 ? { args: chromiumLaunchArgs } : undefined;

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
  /* Optimized workers: More workers locally for faster execution, more in CI */
  /* Use 50% of CPU cores locally (min 2, max 4), full capacity in CI */
  workers: process.env.CI 
    ? 1 
    : Math.max(2, Math.min(4, Math.floor(require('os').cpus().length * 0.5))),
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
    baseURL: process.env.STOREFRONT_URL || "http://localhost:5173",
    headless: shouldUseHeadless,
    /* Collect trace when retrying the failed test */
    trace: "retain-on-failure",
    /* Capture screenshot on failure */
    screenshot: "only-on-failure",
    /* Record video on failure */
    video: "retain-on-failure",
    /* Ignore HTTPS errors for local development */
    ignoreHTTPSErrors: true,
    /* Optimized timeouts: Reduced for faster failure detection */
    actionTimeout: 10 * 1000, // Reduced from 15s to 10s
    navigationTimeout: 20 * 1000, // Reduced from 30s to 20s
  },

  /* Configure projects for major browsers */
  /* OPTIMIZATION: For faster local runs, use E2E_FAST=true to run only chromium */
  projects: process.env.E2E_FAST === "true" 
    ? [
        // Fast mode: Only Chromium for quick feedback
        {
          name: "chromium",
          use: {
            ...devices["Desktop Chrome"],
            channel: chromiumChannel,
            launchOptions: chromiumLaunchOptions,
          },
        },
      ]
    : [
        // Full mode: All browsers (for CI and comprehensive testing)
        {
          name: "chromium",
          use: {
            ...devices["Desktop Chrome"],
            channel: chromiumChannel,
            launchOptions: chromiumLaunchOptions,
          },
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
          use: {
            ...devices["Pixel 5"],
            channel: chromiumChannel,
            launchOptions: chromiumLaunchOptions,
          },
        },
        {
          name: "Mobile Safari",
          use: { ...devices["iPhone 12"] },
        },
        /* Resilience tests project */
        {
          name: "resilience",
          testDir: "./resilience",
          use: {
            ...devices["Desktop Chrome"],
            channel: chromiumChannel,
            launchOptions: chromiumLaunchOptions,
          },
        },
      ],

  /* Run your local dev server before starting the tests */
  /* In CI, storefront is already running via Docker Compose, so we skip webServer */
  // webServer: process.env.CI
  //   ? undefined
  //   : {
  //       command: `cd ../.. && MEDUSA_PUBLISHABLE_KEY=${process.env.MEDUSA_PUBLISHABLE_KEY} pnpm --filter=apps-storefront dev`,
  //       url: "http://localhost:5173",
  //       reuseExistingServer: true,
  //       ignoreHTTPSErrors: true,
  //       timeout: 120 * 1000,
  //     },

  /* Optimized timeouts: Reduced for faster feedback */
  timeout: 45 * 1000, // Reduced from 60s to 45s

  /* Expect timeout: Reduced for faster failure detection */
  expect: {
    timeout: 10 * 1000, // Reduced from 15s to 10s
  },
});
