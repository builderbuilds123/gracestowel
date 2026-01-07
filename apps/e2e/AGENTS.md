# E2E Tests AGENTS.md — Playwright

<!-- Inherits from root AGENTS.md. This file contains E2E test-specific guidance. -->

---

## Quick Reference

```bash
pnpm test              # Run all E2E tests
pnpm test:ui           # Run with Playwright UI
pnpm test:headed       # Run in headed mode
pnpm test:resilience   # Run resilience tests only
```

---

## Directory Structure

```
apps/e2e/
├── tests/
│   ├── checkout.spec.ts                  # Guest checkout flow
│   ├── grace-period.spec.ts              # Order modification window tests
│   ├── visual-regression.spec.ts         # Screenshot comparisons
│   ├── backend/
│   │   └── api-workflows.spec.ts         # Admin API tests
│   └── storefront/
│       ├── cart-and-checkout.spec.ts     # Cart operations & checkout
│       ├── storefront-catalog.spec.ts    # Product catalog & search
│       ├── homepage-navigation.spec.ts   # Homepage & navigation flows
│       ├── mobile-experience.spec.ts     # Mobile viewport tests
│       └── error-handling.spec.ts        # Error states & recovery
├── resilience/
│   └── network-failures.spec.ts          # Network failure scenarios
├── support/
│   ├── fixtures/                         # Composable test fixtures
│   ├── helpers/                          # Utility functions
│   └── factories/                        # Data factories with auto-cleanup
└── playwright.config.ts
```

---

## Test Patterns

### Import merged fixtures (recommended)
```typescript
import { test, expect } from "../support/fixtures";

test("user flow", async ({ page, apiRequest, productFactory }) => {
  // Fixtures provide typed helpers and auto-cleanup
});
```

### Network-first pattern (CRITICAL)
```typescript
// GOOD: Wait for content, not network
await page.goto("/products/the-nuzzle");
await page.waitForLoadState("domcontentloaded");
await expect(page.getByRole("heading", { name: /Nuzzle/i })).toBeVisible();

// AVOID: networkidle is flaky
await page.waitForLoadState("networkidle"); // ❌ Flaky
```

### Deterministic waits
```typescript
// GOOD: Wait for specific elements
await expect(page.getByRole("heading", { name: /Best Sellers/i })).toBeVisible();

// AVOID: Hard waits unless absolutely necessary
await page.waitForTimeout(5000); // ❌ Slow and unreliable
```

---

## Running Tests

```bash
# CI mode (Docker required)
pnpm test:e2e:ci

# Local development (requires running storefront + backend)
cd apps/e2e && pnpm test

# Specific project
pnpm test -- --project=chromium
pnpm test -- --project="Mobile Chrome"

# Debug mode
pnpm test:debug
```

---

## Environment

| Service | Local URL | Docker URL |
|---------|-----------|------------|
| Storefront | https://localhost:5173 | http://storefront:5173 |
| Backend | http://localhost:9000 | http://backend:8080 |

---

## Test Categories

| Category | Priority | Description |
|----------|----------|-------------|
| Checkout | Critical | Cart → Checkout → Payment flow |
| Cart | High | Add, update, remove, persist |
| Catalog | High | Product discovery, search |
| Navigation | Medium | Homepage, routing, back button |
| Error Handling | Medium | 404s, API failures, recovery |
| Mobile | Medium | Touch interactions, responsive |
| Resilience | Low | Network failures, offline mode |
| Visual | Low | Screenshot comparisons |

---

## Best Practices

1. **Use fixtures** — Import from `../support/fixtures`
2. **Use factories** — `productFactory.createProduct()` with auto-cleanup
3. **Wait for content** — Use `expect().toBeVisible()` not `networkidle`
4. **Direct navigation** — Go to URLs directly when possible
5. **Flexible selectors** — Use role/text selectors, not CSS
6. **Handle failures gracefully** — Use `try/catch` for expected failures
7. **Mobile-first thinking** — Test touch targets and viewport sizes

---

## Troubleshooting

### Tests fail with timeout
- Check `STOREFRONT_URL` in `.env`
- Verify storefront is running: `pnpm dev:storefront`
- Increase timeout: `test.setTimeout(90000)`

### API seeding fails
- Check `API_URL` or `BACKEND_URL` in `.env`
- Verify backend is running: `pnpm dev:api`
- Factories gracefully fall back if API unavailable

### Flaky tests
- Replace `networkidle` with content waits
- Add explicit `waitForLoadState("domcontentloaded")`
- Increase element timeouts: `{ timeout: 10000 }`
