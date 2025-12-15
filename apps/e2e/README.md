# E2E Tests

End-to-end tests for Grace Stowel using Playwright with an API-first approach.

## Testing Strategy

### API-First Approach
We test business logic via API calls rather than UI interactions. This provides:
- **Speed**: API tests run faster than UI tests
- **Reliability**: Less flaky than UI-dependent tests
- **Flexibility**: UI can be revamped without breaking tests

### Webhook Mocking
Instead of automating Stripe's hosted checkout pages, we:
1. Create PaymentIntents via API
2. Simulate payment confirmation
3. Send webhooks directly to our backend
4. Verify order creation and state transitions

### Property-Based Testing
We use `fast-check` to verify correctness properties:
- Cart total consistency
- PaymentIntent amount accuracy
- Order creation integrity

## Quick Start

### Prerequisites
- Node.js 18+
- pnpm
- Running backend and storefront

### Install Dependencies
```bash
pnpm install
```

### Run Tests
```bash
# Run all tests
pnpm test

# Run specific test file
pnpm test tests/cart/cart-operations.api.spec.ts

# Run with UI
pnpm test:ui

# Run headed (see browser)
pnpm test:headed
```

### Environment Variables
Copy `.env.test.example` to `.env.test` and configure:
```env
STOREFRONT_URL=http://localhost:3000
BACKEND_URL=http://localhost:9000
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_test_...
JWT_SECRET=your-jwt-secret
```

## Project Structure

```
apps/e2e/
├── fixtures/           # Playwright fixtures
│   ├── index.ts        # Combined fixtures export
│   ├── data-factory.fixture.ts
│   └── payment.fixture.ts
├── helpers/            # Test utilities
│   ├── test-cards.ts   # Stripe test card constants
│   ├── payment.helper.ts
│   ├── webhook.helper.ts
│   └── data-factory.ts
├── tests/
│   ├── cart/           # Cart flow tests
│   ├── checkout/       # Checkout tests
│   ├── orders/         # Order lifecycle tests
│   ├── payment/        # Payment tests
│   ├── webhooks/       # Webhook handler tests
│   └── smoke/          # UI smoke tests
├── playwright.config.ts
└── README.md
```

## Writing Tests

### Using Fixtures
```typescript
import { test, expect } from '../../fixtures';

test('example test', async ({ dataFactory, payment, webhook }) => {
  // Create test data
  const product = await dataFactory.getRandomProduct();
  const cart = await dataFactory.createCart([
    { variant_id: product.variants[0].id, quantity: 1 }
  ]);

  // Create and confirm payment
  const pi = await payment.createPaymentIntent(cart.total);
  await payment.simulatePayment(pi.id, 'SUCCESS');

  // Simulate webhook
  await webhook.mockPaymentIntentAuthorized(pi.id, cart.total);

  // Assertions...
});
```

### Test Cards
```typescript
import { TEST_CARDS } from '../../helpers/test-cards';

// Success
TEST_CARDS.SUCCESS // 4242424242424242

// Decline
TEST_CARDS.DECLINE_GENERIC // 4000000000000002

// 3D Secure
TEST_CARDS.REQUIRES_3DS // 4000002760003184
```

### Property Tests
```typescript
import * as fc from 'fast-check';

/**
 * **Feature: e2e-testing-overhaul, Property 1: Cart State Consistency**
 */
test('cart total property', async () => {
  fc.assert(
    fc.property(cartArbitrary, (cart) => {
      // Property assertion
      return calculateTotal(cart) === expectedTotal(cart);
    }),
    { numRuns: 100 }
  );
});
```

## CI/CD

Tests run automatically on:
- Pull requests
- Merges to main

### CI Configuration
- Retries: 2 (on failure)
- Browsers: Chromium, Firefox, WebKit
- Reports: HTML, JSON, JUnit

### Viewing Reports
After CI run, download artifacts:
- `playwright-report/` - HTML report
- `test-results/` - Screenshots, videos, traces

## Troubleshooting

### Tests Failing Locally
1. Ensure backend and storefront are running
2. Check environment variables
3. Run `pnpm test:headed` to see browser

### Flaky Tests
1. Check for race conditions
2. Use `waitForResponse` for API calls
3. Avoid `page.waitForTimeout`

### Stripe Errors
1. Verify `STRIPE_SECRET_KEY` is test mode
2. Check webhook secret matches
3. Use test cards only
