# E2E Test Performance Optimization Guide

## Quick Wins for Faster Test Execution

### 1. Use Fast Mode for Local Development

Run tests in fast mode (Chromium only) for quick feedback:

```bash
pnpm test:fast
# or
E2E_FAST=true pnpm test
```

This runs tests **5x faster** by skipping Firefox, WebKit, and mobile browsers.

### 2. Optimized Configuration

The Playwright config now includes:
- **More workers locally**: 2-4 workers (50% of CPU cores) instead of 1
- **Reduced timeouts**: Faster failure detection (10s action, 20s navigation)
- **Fast mode option**: Run only Chromium with `E2E_FAST=true`

### 3. Test Execution Strategies

#### For Quick Feedback (Local Development)
```bash
# Fastest: Single browser, single worker
E2E_FAST=true pnpm test --workers=1

# Fast: Single browser, multiple workers
pnpm test:fast

# Standard: All browsers (for comprehensive testing)
pnpm test
```

#### For CI/Comprehensive Testing
```bash
# Full test suite with all browsers
pnpm test:ci
```

### 4. Performance Improvements Made

1. **Workers**: Increased from 1 to 2-4 locally (50% CPU utilization)
2. **Timeouts**: Reduced action timeout (15s → 10s), navigation (30s → 20s)
3. **Fast Mode**: Added `E2E_FAST=true` to run only Chromium
4. **Test timeout**: Reduced from 60s to 45s per test

### 5. Expected Performance Gains

- **Fast mode**: ~5x faster (1 browser vs 5 browsers)
- **More workers**: ~2-4x faster (parallel execution)
- **Reduced timeouts**: ~20-30% faster failure detection
- **Combined**: Up to **10-20x faster** for local development

### 6. Additional Optimization Tips

#### Skip Visual Regression Tests
Visual regression tests are slow and run in serial mode. They're already skipped by default:

```bash
# Skip visual regression tests
pnpm test --grep-invert "Visual Regression"
```

#### Run Specific Test Files
Focus on the tests you're working on:

```bash
# Run only checkout tests
pnpm test tests/checkout.spec.ts

# Run only storefront tests
pnpm test tests/storefront/
```

#### Use Test Sharding (CI)
For very large test suites, use sharding:

```bash
# Split tests across 4 shards
pnpm test --shard=1/4
pnpm test --shard=2/4
pnpm test --shard=3/4
pnpm test --shard=4/4
```

### 7. Monitoring Performance

Check test execution time:

```bash
# Run with timing info
pnpm test --reporter=list

# Generate HTML report with timing
pnpm test:report
```

### 8. Best Practices

1. **Use fast mode for TDD**: `pnpm test:fast` during development
2. **Run full suite before commit**: `pnpm test` before pushing
3. **Use CI for comprehensive testing**: Let CI run all browsers
4. **Optimize slow tests**: Move heavy setup to `beforeAll` instead of `beforeEach`
5. **Use API seeding**: Prefer API calls over UI interactions for test data

### 9. Troubleshooting

If tests are still slow:

1. **Check dev server**: Ensure storefront is running and responsive
2. **Check database**: Ensure database queries are optimized
3. **Check network**: Slow network can affect API calls
4. **Check workers**: Too many workers can overwhelm the dev server

### 10. Future Optimizations

Potential improvements:
- [ ] Use test sharding for CI
- [ ] Implement test result caching
- [ ] Optimize beforeEach hooks (move to beforeAll where possible)
- [ ] Use test fixtures for shared setup
- [ ] Implement test tagging (smoke, full, etc.)
