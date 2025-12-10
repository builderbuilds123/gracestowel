# Testing Patterns & Conventions

<!--
INSTRUCTIONS FOR USER:
Populate this file with your project's testing conventions.
Deepak will reference this when writing tests and diagnosing test failures.

Suggested sections:
-->

## Testing Frameworks

<!-- List the testing frameworks used in your project -->
<!-- Example:
- **Unit Tests:** Vitest
- **Integration Tests:** Vitest + Testing Library
- **E2E Tests:** Playwright
- **API Tests:** Supertest
-->

## Test File Naming

<!-- How are test files named? -->
<!-- Example:
- Unit tests: `*.test.ts` or `*.spec.ts`
- E2E tests: `*.e2e.ts`
- Location: Co-located with source files or in `__tests__` folder
-->

## Test Structure Conventions

<!-- How are tests organized internally? -->
<!-- Example:
```typescript
describe('ComponentName', () => {
  describe('methodName', () => {
    it('should do X when Y', () => {
      // Arrange
      // Act
      // Assert
    });
  });
});
```
-->

## Mocking Patterns

<!-- How are mocks, stubs, and fakes handled? -->
<!-- Example:
- Use MSW for API mocking
- Use vi.mock() for module mocking
- Test doubles in `__mocks__` folder
-->

## Test Data Management

<!-- How is test data handled? -->
<!-- Example:
- Factories for generating test objects
- Fixtures for static test data
- Database seeding for integration tests
-->

## Common Test Utilities

<!-- Shared test helpers and utilities -->
<!-- Example:
- `renderWithProviders()` - Renders components with all context providers
- `createMockUser()` - Factory for user objects
- `waitForLoadingToFinish()` - Async utility for loading states
-->

## Coverage Requirements

<!-- What are the coverage expectations? -->
<!-- Example:
- Minimum 80% line coverage
- Critical paths require 100% coverage
- New code must include tests
-->

## Running Tests

<!-- Commands to run tests -->
<!-- Example:
- `npm test` - Run all unit tests
- `npm run test:e2e` - Run E2E tests
- `npm run test:coverage` - Run with coverage report
-->
