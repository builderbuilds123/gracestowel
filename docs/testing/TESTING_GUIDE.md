# Testing Guide for Grace Stowel

**Quick reference guide for writing tests in the Grace Stowel monorepo**

---

## Quick Start

### Running Tests

```bash
# Backend
npm test -w apps/backend

# Storefront
npm test -w apps/storefront
npm test:ui -w apps/storefront          # Interactive UI
npm test:coverage -w apps/storefront    # With coverage

# E2E
npm test -w apps/e2e
npm test:ui -w apps/e2e                 # Playwright UI
npm test:headed -w apps/e2e             # See browser
```

---

## Writing Backend Tests

### Location
Place tests in `apps/backend/integration-tests/http/`

### Pattern
```typescript
import { medusaIntegrationTestRunner } from "@medusajs/test-utils";

jest.setTimeout(60 * 1000);

medusaIntegrationTestRunner({
  inApp: true,
  env: {},
  testSuite: ({ api, getContainer }) => {
    describe("Your Feature", () => {
      it("should do something", async () => {
        const response = await api.get("/your-endpoint");

        expect(response.status).toEqual(200);
        expect(response.data).toHaveProperty("expectedField");
      });
    });
  },
});
```

### Best Practices
- ✅ Use descriptive test names starting with "should"
- ✅ Test both success and error cases
- ✅ Validate authentication requirements
- ✅ Check response shape and data types
- ✅ Test edge cases (empty data, invalid input)
- ❌ Don't test Medusa core functionality
- ❌ Don't make tests depend on each other

---

## Writing Component Tests

### Location
Place tests next to components: `apps/storefront/app/components/YourComponent.test.tsx`

### Pattern
```typescript
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { YourComponent } from "./YourComponent";

describe("YourComponent", () => {
  it("should render correctly", () => {
    render(<YourComponent title="Test" />);

    expect(screen.getByText("Test")).toBeInTheDocument();
  });

  it("should handle user interaction", async () => {
    const user = userEvent.setup();
    render(<YourComponent />);

    await user.click(screen.getByRole("button"));

    expect(screen.getByText("Clicked")).toBeInTheDocument();
  });

  it("should have no accessibility violations", async () => {
    const { container } = render(<YourComponent />);

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
```

### Best Practices
- ✅ Test user behavior, not implementation
- ✅ Use semantic queries (getByRole, getByLabelText)
- ✅ Always include accessibility tests
- ✅ Test error states and loading states
- ✅ Mock external dependencies with MSW
- ❌ Don't test styling (use visual regression)
- ❌ Don't use data-testid unless necessary

---

## Writing E2E Tests

### Location
Place tests in `apps/e2e/tests/`

### Pattern
```typescript
import { test, expect } from "@playwright/test";

test.describe("Your Feature", () => {
  test("should complete user flow", async ({ page }) => {
    // Navigate
    await page.goto("/your-page");

    // Interact
    await page.getByRole("button", { name: /click me/i }).click();

    // Assert
    await expect(page.getByText("Success")).toBeVisible();
    await expect(page).toHaveURL(/\/success/);
  });
});
```

### Best Practices
- ✅ Test critical user journeys end-to-end
- ✅ Use semantic selectors (role, label, text)
- ✅ Wait for elements properly (avoid fixed timeouts)
- ✅ Take screenshots on failure
- ✅ Test across different viewports
- ❌ Don't test implementation details
- ❌ Don't make tests too granular (use component tests)

---

## Mocking with MSW

### Adding New API Handlers

Edit `apps/storefront/tests/mocks/handlers.ts`:

```typescript
import { http, HttpResponse } from "msw";

export const handlers = [
  // ... existing handlers

  // Add your new handler
  http.get("http://localhost:9000/store/your-endpoint", () => {
    return HttpResponse.json({
      data: { /* your mock data */ }
    });
  }),

  // Mock error responses
  http.post("http://localhost:9000/store/your-endpoint", () => {
    return new HttpResponse(null, { status: 500 });
  }),

  // Mock delays
  http.get("http://localhost:9000/store/slow", async () => {
    await delay(5000);
    return HttpResponse.json({ data: "slow response" });
  }),
];
```

### Overriding Handlers in Tests

```typescript
import { server } from "../mocks/server";
import { http, HttpResponse } from "msw";

it("should handle API error", async () => {
  server.use(
    http.get("http://localhost:9000/store/products", () => {
      return new HttpResponse(null, { status: 500 });
    })
  );

  // Your test that expects error handling
});
```

---

## Common Patterns

### Testing Authentication

```typescript
// Backend
it("should require authentication", async () => {
  const response = await api
    .post("/endpoint", data)
    .catch((err) => err.response);

  expect(response.status).toEqual(401);
  expect(response.data.message).toContain("logged in");
});
```

### Testing Form Validation

```typescript
// Component test
it("should show validation error for invalid email", async () => {
  const user = userEvent.setup();
  render(<YourForm />);

  await user.type(screen.getByLabelText(/email/i), "invalid-email");
  await user.click(screen.getByRole("button", { name: /submit/i }));

  expect(screen.getByText(/invalid email/i)).toBeInTheDocument();
});
```

### Testing Loading States

```typescript
it("should show loading indicator", async () => {
  server.use(
    http.get("*", async () => {
      await delay(1000);
      return HttpResponse.json({ data: [] });
    })
  );

  render(<YourComponent />);

  expect(screen.getByText(/loading/i)).toBeInTheDocument();

  await waitFor(() => {
    expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
  });
});
```

### Testing Error Boundaries

```typescript
it("should display error boundary on component crash", () => {
  const ThrowError = () => {
    throw new Error("Test error");
  };

  render(
    <ErrorBoundary fallback={<div>Error occurred</div>}>
      <ThrowError />
    </ErrorBoundary>
  );

  expect(screen.getByText("Error occurred")).toBeInTheDocument();
});
```

---

## Query Priorities (Testing Library)

Use queries in this order of preference:

1. **getByRole** - Accessible to all users
   ```typescript
   screen.getByRole("button", { name: /submit/i })
   ```

2. **getByLabelText** - Forms only
   ```typescript
   screen.getByLabelText(/email address/i)
   ```

3. **getByPlaceholderText** - Forms only (if no label)
   ```typescript
   screen.getByPlaceholderText(/search/i)
   ```

4. **getByText** - Non-interactive elements
   ```typescript
   screen.getByText(/welcome/i)
   ```

5. **getByTestId** - Last resort only
   ```typescript
   screen.getByTestId("complex-component")
   ```

---

## Debugging Tests

### Storefront Tests

```typescript
// See what's rendered
import { screen } from "@testing-library/react";
screen.debug();

// See specific element
screen.debug(screen.getByRole("button"));

// Use Vitest UI
npm test:ui -w apps/storefront
```

### E2E Tests

```typescript
// Playwright UI (recommended)
npm test:ui -w apps/e2e

// See browser
npm test:headed -w apps/e2e

// Debug mode (pauses on failure)
npm test:debug -w apps/e2e

// In test code
await page.pause(); // Pauses execution
```

### Backend Tests

```typescript
// Use console.log
console.log("Response:", response.data);

// Use debugger
debugger;

// Run single test
npm test -- your-test.spec.ts
```

---

## CI/CD Integration

### What Runs in CI

1. **Validation**: Lint, TypeScript, Security audit
2. **Backend Tests**: Integration tests with Postgres/Redis
3. **Storefront Tests**: Component tests with MSW
4. **E2E Tests**: Critical flows in Chromium
5. **Resilience Tests**: Only on main/staging branches

### Viewing CI Results

- **GitHub Actions**: Check "Actions" tab in repository
- **Test Reports**: Download artifacts from failed runs
- **Coverage Reports**: View in Codecov (when configured)

### Fixing CI Failures

1. Run tests locally first: `npm test`
2. Check CI logs for specific error
3. Reproduce locally with same environment
4. Fix and push changes
5. CI will re-run automatically

---

## Coverage Goals

| Area | Target | Current |
|------|--------|---------|
| Critical Paths | 100% | 70% |
| Overall Backend | 70% | TBD |
| Overall Storefront | 70% | 50% |
| E2E User Flows | 100% | 60% |

View coverage:
```bash
npm run test:coverage -w apps/storefront
# Open coverage/index.html in browser
```

---

## FAQ

**Q: How do I test authenticated routes?**
A: Use the test auth utilities or mock the auth context in component tests.

**Q: Should I test third-party libraries?**
A: No, only test your code that uses them. Mock external dependencies.

**Q: How do I test Stripe payments?**
A: Use Stripe's test mode with test card numbers in E2E tests.

**Q: Tests are flaky in CI. What do I do?**
A: Add proper waits (`waitFor`), check for race conditions, increase timeouts if needed.

**Q: How do I add a new MSW handler?**
A: Edit `apps/storefront/tests/mocks/handlers.ts` and export the new handler.

**Q: Should I commit test snapshots?**
A: Generally no for this project. Use explicit assertions instead.

---

## Resources

- [Test Automation Strategy](./test_automation_strategy.md)
- [Implementation Summary](./IMPLEMENTATION_SUMMARY.md)
- [Testing Library Docs](https://testing-library.com/)
- [Vitest Docs](https://vitest.dev/)
- [Playwright Docs](https://playwright.dev/)
- [MSW Docs](https://mswjs.io/)

---

**Need Help?**
- Ask in #testing Slack channel
- Review existing test files for examples
- Check CI logs for error details
