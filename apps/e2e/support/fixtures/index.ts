import { test as base, mergeTests } from '@playwright/test';
import { test as apiFixture } from './api-fixture';
import { test as dataFactoryFixture } from './data-factory-fixture';
import { test as posthogFixture } from './posthog-fixture';

/**
 * Merged Fixtures
 * Combines all fixtures using mergeTests pattern
 * Tests import this to get all capabilities
 */
export const test = mergeTests(base, apiFixture, dataFactoryFixture, posthogFixture);

export { expect } from '@playwright/test';
