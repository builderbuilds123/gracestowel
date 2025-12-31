# Grace's Towel E2E Test Suite

Comprehensive Playwright test suite for Storefront and Backend APIs.

## Structure

- `tests/storefront/`: UI-based tests for user journeys (Checkout, Auth, Navigation).
- `tests/backend/`: API-based tests for Admin and Service logic.
- `resilience/`: Network chaos and resilience testing.
- `support/`: Fixtures, Factories, and Helpers.

## Running Tests

### Prerequisites
- Backend running at `http://localhost:9000` (or `API_URL`)
- Storefront running at `http://localhost:5173` (or `STOREFRONT_URL`)

### Commands

```bash
# Run all tests
pnpm test

# Run Storefront tests
pnpm test tests/storefront

# Run Backend tests
pnpm test tests/backend

# Run Resilience tests
pnpm test resilience

# Run specific test file
pnpm test tests/storefront/checkout.spec.ts
```

## Configuration

Environment variables in `.env` or passed via CLI:

- `STOREFRONT_URL`: URL of the storefront (default: `https://localhost:5173`)
- `API_URL`: URL of the Medusa backend (default: `http://localhost:9000`)
- `CI`: Set to `true` to enable strict checks and forbid `test.only`.

## Writing Tests

- Use `test` from `../../support/fixtures` to get access to factories and API helpers.
- **Do not** use `page.waitForTimeout()`. Use `expect` with auto-retries or `waitForResponse`.
- Use `data-testid` attributes for selectors where possible.
