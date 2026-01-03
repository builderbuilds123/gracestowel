# Grace Stowel E2E Test Framework

Production-ready end-to-end test framework for the Grace Stowel e-commerce platform, built with Playwright and following best practices for scalable, maintainable test automation.

## Architecture Overview

### Directory Structure

```
apps/e2e/
├── support/              # Framework infrastructure (key pattern)
│   ├── fixtures/         # Test fixtures (composable, mergeTests pattern)
│   ├── helpers/          # Utility functions (pure, framework-agnostic)
│   └── factories/        # Data factories (faker-based, auto-cleanup)
├── tests/
│   ├── storefront/       # Storefront UI + shopper journeys
│   └── backend/          # Admin/API and workflow coverage
├── resilience/           # Resilience/chaos tests
└── playwright.config.ts  # Framework configuration
```

### Suite Map

- **Storefront** (`tests/storefront/*`): navigation, catalog/search/filter/sort/pagination, PDP variants/pricing/stock/images/reviews/related products, cart drawer/operations/persistence, checkout (guest + signed-in), auth session reuse, order status/grace period token flows, edge UX (404/offline), visual regression, and mobile coverage (projects `storefront-mobile-*`).
- **Backend** (`tests/backend/*`): product CRUD (publish/unpublish, pricing), customers (creation, address updates, token issuance), carts/orders with discounts/shipping/tax/payment intents, grace period cancellation gating, webhook/idempotency/negative payload checks.
- **Resilience** (`resilience/*`): chaos and durability checks (unchanged).

### Key Patterns

1. **Fixture Architecture**: Pure functions → fixtures → `mergeTests` composition
2. **Data Factories**: Faker-based factories with auto-cleanup (no test pollution)
3. **Network-First**: Intercept before navigate to prevent race conditions
4. **API-First Setup**: Seed data via API (10-50x faster than UI)

## Setup Instructions

### 1. Install Dependencies

```bash
cd apps/e2e
pnpm install
```

### 2. Configure Environment

Copy `.env.example` to `.env` and fill in environment variables:

```bash
cp .env.example .env
```

Required variables:
- `STOREFRONT_URL`: Base URL for the storefront (default: `https://localhost:5173`)
- `API_URL` or `BACKEND_URL`: Backend API URL (default: `http://localhost:9000`)

### 3. Install Playwright Browsers

```bash
npx playwright install
```

## Running Tests

### Local Execution

```bash
# Run all tests
pnpm test

# Run with UI mode (interactive)
pnpm test:ui

# Run in headed mode (see browser)
pnpm test:headed

# Run specific test file
pnpm test tests/storefront/cart-and-checkout.spec.ts

# Run storefront suite only
pnpm test --project=storefront-chromium

# Run backend/API suite only
ADMIN_TOKEN=<admin jwt> pnpm test --project=backend-api

# Run mobile storefront coverage
pnpm test --project=storefront-mobile-chrome

# Debug mode
pnpm test:debug
```

### CI Execution

```bash
# Run tests in CI (Docker Compose)
pnpm test:ci
```

## Architecture Details

### Fixture Pattern

Tests import merged fixtures to get all capabilities:

```typescript
import { test, expect } from '../support/fixtures';

test('user can checkout', async ({ page, apiRequest, userFactory }) => {
  // Create test user via factory
  const user = await userFactory.createUser({ email: 'test@example.com' });

  // Use API for fast setup
  await apiRequest({
    method: 'POST',
    url: '/admin/customers',
    data: user,
  });

  // Test UI behavior
  await page.goto('/checkout');
  await expect(page.getByText('Checkout')).toBeVisible();
});
```

### Data Factories

Factories generate parallel-safe, unique test data:

```typescript
import { createUser, createProduct } from '../support/factories';

// Default user
const user = createUser();

// Admin user (explicit override shows intent)
const admin = createUser({ role: 'admin' });

// Product with custom price
const product = createProduct({ price: 99.99 });
```

Factories with auto-cleanup (via fixtures):

```typescript
import { test, expect } from '../support/fixtures';

test('user can place order', async ({ userFactory, productFactory }) => {
  const user = await userFactory.createUser();
  const product = await productFactory.createProduct();

  // Test logic...

  // No manual cleanup needed - fixture handles it automatically
});
```

### Network-First Pattern

Always intercept **before** navigation to prevent race conditions:

```typescript
import { waitForApiResponse, mockApiResponse } from '../support/helpers/network-helpers';

test('dashboard loads user data', async ({ page }) => {
  // Step 1: Register interception FIRST
  const responsePromise = waitForApiResponse(page, '**/api/users');

  // Step 2: THEN trigger the request
  await page.goto('/dashboard');

  // Step 3: THEN await the response
  const { body } = await responsePromise;

  // Step 4: Assert on structured data
  expect(body).toHaveLength(10);
  await expect(page.getByText(body[0].name)).toBeVisible();
});
```

### API Request Helper

Pure function for API calls (framework-agnostic):

```typescript
import { test, expect } from '../support/fixtures';

test('can create order via API', async ({ apiRequest }) => {
  const order = await apiRequest({
    method: 'POST',
    url: '/admin/orders',
    data: {
      customer_id: '123',
      items: [{ product_id: '456', quantity: 2 }],
    },
  });

  expect(order.id).toBeDefined();
});
```

## Best Practices

### Selector Strategy

**Always use `data-testid` attributes** for UI elements:

```typescript
// ✅ GOOD
await page.getByTestId('add-to-cart-button').click();

// ❌ BAD - Brittle CSS selector
await page.locator('.product-card > button.btn-primary').click();
```

### Test Isolation

- Each test creates its own data (via factories)
- No shared state between tests
- Auto-cleanup via fixtures prevents test pollution

### Deterministic Waits

**Never use hard waits** (`waitForTimeout`):

```typescript
// ✅ GOOD - Wait for response
const response = await page.waitForResponse('**/api/orders');

// ✅ GOOD - Wait for element state
await expect(page.getByTestId('loading-spinner')).not.toBeVisible();

// ❌ BAD - Hard wait
await page.waitForTimeout(3000);
```

### Timeout Standards

- **Test timeout**: 60 seconds (global)
- **Action timeout**: 15 seconds (click, fill, etc.)
- **Navigation timeout**: 30 seconds (page.goto, page.reload)
- **Expect timeout**: 15 seconds (all assertions)

Override per-test if needed:

```typescript
test('slow operation', async ({ page }) => {
  test.setTimeout(180000); // 3 minutes for this test
  // ...
});
```

## CI Integration

### Artifact Configuration

Tests capture artifacts on failure:
- **Screenshots**: `test-results/` (only on failure)
- **Videos**: `test-results/` (retain on failure)
- **Traces**: `test-results/` (retain on failure)
- **HTML Report**: `test-results/html/`
- **JUnit XML**: `test-results/junit.xml` (for CI integration)

### CI Pipeline

The framework is configured for CI with:
- Retries: 2 (CI only)
- Workers: 1 (CI stability)
- GitHub Actions reporter (CI only)
- JUnit XML output for test result parsing

## Knowledge Base References

This framework follows patterns from the TEA (Test Architecture) knowledge base:

- **Fixture Architecture**: Pure function → fixture → `mergeTests` composition
- **Data Factories**: Faker-based factories with overrides and auto-cleanup
- **Network-First**: Intercept before navigate, deterministic waits
- **Playwright Config**: Environment-based, timeout standards, artifact outputs

## Troubleshooting

### Tests Fail with Timeout

- Check `STOREFRONT_URL` in `.env` matches running app
- Verify app is running: `pnpm dev:storefront`
- Increase timeout if needed (but prefer fixing root cause)

### API Seeding Fails

- Check `API_URL` or `BACKEND_URL` in `.env`
- Verify backend is running: `pnpm dev:api`
- API endpoints may need adjustment based on Medusa API structure
- Factories gracefully fall back to UI-only mode if API fails

### Flaky Tests

- Ensure network interception happens **before** navigation
- Replace hard waits with deterministic waits (response, element state)
- Check for race conditions in parallel test execution

### Browser Not Found

```bash
npx playwright install
```

## Next Steps

1. **Review existing tests**: Update to use new fixture architecture
2. **Add more factories**: Create factories for orders, carts, etc.
3. **Enhance network helpers**: Add more network-first patterns
4. **CI Pipeline**: Configure artifact uploads in CI/CD

## Additional Resources

- [Playwright Documentation](https://playwright.dev)
- [Faker.js Documentation](https://fakerjs.dev)
- [TEA Knowledge Base](../.bmad/bmm/testarch/knowledge/)
