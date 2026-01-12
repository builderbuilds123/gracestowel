# Turborepo Integration for E2E Tests

## Overview

Turborepo is already configured in this monorepo and provides significant benefits for E2E test execution, even though E2E tests can't be fully cached (they need to run against live servers).

## Benefits

### 1. Parallel Execution
Run unit tests and E2E tests simultaneously:

```bash
# Run all tests in parallel (unit + E2E)
pnpm test:all
```

**Speedup**: Unit tests and E2E tests run concurrently instead of sequentially.

### 2. Dependency Management
Turborepo automatically ensures dependencies are built before E2E tests:

```bash
# Turbo ensures backend/storefront are built first
pnpm test:e2e
```

**Benefit**: No manual build steps needed, reduces setup time.

### 3. Caching Test Artifacts
While E2E tests must run, Turborepo caches:
- Test results (`test-results/**`)
- HTML reports (`playwright-report/**`)
- Playwright artifacts (`.playwright/**`)

**Benefit**: Faster report generation and artifact retrieval on subsequent runs.

### 4. Remote Caching (CI)
In CI, Turborepo can share cache across runs:
- If test code hasn't changed, artifacts are restored from cache
- Reduces redundant work in CI pipelines

**Benefit**: Faster CI execution, especially for unchanged test files.

## Configuration

The `turbo.json` configuration:

```json
{
  "test:e2e": {
    "dependsOn": ["^build"],
    "inputs": [
      "$TURBO_DEFAULT$",
      ".env*",
      "tests/**",
      "support/**",
      "playwright.config.ts"
    ],
    "outputs": [
      "test-results/**",
      "playwright-report/**",
      ".playwright/**"
    ],
    "cache": true
  }
}
```

### Key Settings

- **`dependsOn: ["^build"]`**: Ensures backend/storefront are built first
- **`inputs`**: Tracks changes to test files and config
- **`outputs`**: Caches test artifacts
- **`cache: true`**: Enables caching (was `false` before)

## Usage Examples

### Local Development

```bash
# Run E2E tests with Turborepo orchestration
pnpm test:e2e

# Fast mode via Turborepo
pnpm test:e2e:fast

# Run all tests (unit + E2E) in parallel
pnpm test:all
```

### CI/CD

```bash
# In CI, Turborepo automatically:
# 1. Builds dependencies
# 2. Runs tests in parallel
# 3. Caches artifacts
# 4. Shares cache across runs
pnpm test:all
```

## Performance Impact

### Without Turborepo
```
1. Build backend (30s)
2. Build storefront (20s)
3. Run unit tests (60s)
4. Run E2E tests (120s)
Total: ~230s (sequential)
```

### With Turborepo
```
1. Build backend + storefront in parallel (30s)
2. Run unit tests + E2E tests in parallel (120s)
Total: ~150s (parallel)
```

**Speedup**: ~35% faster overall execution

### With Caching (Subsequent Runs)
```
1. Restore cached builds (5s)
2. Run only changed tests (30s)
Total: ~35s
```

**Speedup**: ~85% faster for unchanged code

## Best Practices

1. **Use `pnpm test:all`** for comprehensive testing
2. **Use `pnpm test:e2e:fast`** for quick E2E feedback
3. **Let Turborepo handle dependencies** - don't manually build
4. **Enable remote caching in CI** for maximum benefit
5. **Check cache hits** with `turbo run test:e2e --dry-run`

## Troubleshooting

### Cache Not Working

Check if cache is enabled:
```bash
turbo run test:e2e --dry-run
```

Clear cache if needed:
```bash
turbo run test:e2e --force
```

### Dependencies Not Building

Turborepo should handle this automatically. If not:
```bash
# Force rebuild dependencies
turbo run build --force
pnpm test:e2e
```

## Remote Caching Setup (Optional)

For even faster CI, enable Turborepo remote caching:

1. Sign up at https://turbo.build
2. Link your repo
3. Add token to CI secrets
4. Turborepo will automatically use remote cache

This provides:
- Cache sharing across CI runs
- Cache sharing across team members
- Faster CI execution
