# E2E Tests AGENTS.md — Playwright

<!-- Inherits from root AGENTS.md. This file contains E2E test-specific guidance. -->

---

## Quick Reference

```bash
npm test              # Run all E2E tests
npm run test:ui       # Run with Playwright UI
npm run test:headed   # Run in headed mode
```

---

## Directory Structure

```
tests/
├── checkout.spec.ts      # Checkout flow tests
├── cart.spec.ts          # Cart operations
├── products.spec.ts      # Product browsing
└── fixtures/             # Test fixtures and helpers
```

---

## Test Patterns

```typescript
import { test, expect } from "@playwright/test"

test.describe("Checkout Flow", () => {
  test("completes purchase successfully", async ({ page }) => {
    // Arrange
    await page.goto("/products/turkish-towel")
    
    // Act
    await page.click("[data-testid='add-to-cart']")
    await page.click("[data-testid='checkout']")
    await page.fill("[name='email']", "test@example.com")
    await page.click("[data-testid='place-order']")
    
    // Assert
    await expect(page).toHaveURL(/\/order-confirmation/)
  })
})
```

---

## Running Tests

```bash
# Full suite (requires Docker)
pnpm test:e2e:ci

# Local development
docker-compose -f docker-compose.test.yml up -d
npm test

# Specific test file
npm test -- checkout.spec.ts

# Debug mode
npm run test:debug
```

---

## Environment

Tests run against Docker Compose environment:
- Backend: `http://localhost:9000`
- Storefront: `http://localhost:5173`
- Database: PostgreSQL (seeded)
- Redis: For sessions/cache

---

## Best Practices

- Use `data-testid` attributes for selectors
- Follow AAA pattern (Arrange, Act, Assert)
- Mock external services (Stripe uses test mode)
- Clean up test data after each test
- Keep tests independent and parallelizable
