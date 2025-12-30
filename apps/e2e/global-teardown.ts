import { FullConfig } from '@playwright/test';

async function globalTeardown(config: FullConfig) {
  console.log('🧹 Cleaning up E2E test suite...');

  // Any global cleanup can go here
  // e.g., delete test data, close connections

  console.log('✅ Global teardown complete');
}

export default globalTeardown;
