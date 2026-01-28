# Testing Strategy

**Date**: 2025-11-26
**Status**: Active
**Scope**: Storefront (React Router v7) & Backend (Medusa v2)

## Overview

This document outlines the testing strategy for the Grace's Towel e-commerce platform. The goal is to ensure high reliability for critical revenue-generating flows (Checkout, Add to Cart) while maintaining developer velocity.

## Technology Stack

| Layer | Tooling |
| :--- | :--- |
| **Storefront Unit/Integration** | **Vitest** + **React Testing Library** |
| **Backend Unit/Integration** | **Jest** + **@medusajs/test-utils** |
| **E2E (End-to-End)** | **Playwright** |

## Testing Pyramid Strategy

### Unit Tests (Fast, Isolated)

**Focus**: Individual functions, hooks, and pure UI components.

**Storefront**:
- `ProductPrice.tsx`: Verify formatting logic
- `Dropdown.tsx`: Verify open/close state
- `lib/medusa.server.ts`: Mock fetch to verify API request construction

**Backend**:
- `src/modules/resend`: Verify email payload construction
- Utility functions

### Integration Tests (Component Interactions)

**Focus**: Components communicating with Contexts or external services.

**Storefront**:
- `CartDrawer.tsx`: Test interaction with `CartContext`
- `CheckoutForm.tsx`: Mock Stripe Elements to verify form submission
- `EmbroideryCustomizer.tsx`: Verify state updates

**Backend**:
- API Routes: Use `@medusajs/test-utils` to hit endpoints
- Workflows: Test business logic flows

### E2E Tests (Critical User Journeys)

**Focus**: Full system verification in a browser-like environment.

**Critical Paths**:
1. **Guest Checkout**: Home → Product → Add to Cart → Checkout → Payment → Success
2. **Search & Filter**: Search for "Towel" → Filter by Color → Verify Results
3. **Cart Management**: Add item → Open Drawer → Increment Quantity → Remove Item

**PR Smoke Suite** (fast-fail):
- `apps/e2e/tests/full-checkout.happy.spec.ts`
- `apps/e2e/tests/storefront/homepage-navigation.spec.ts`
- `apps/e2e/tests/backend/api-workflows.spec.ts`

## Running Tests

```bash
# All tests
pnpm test

# Backend only
cd apps/backend && pnpm test

# Storefront only
cd apps/storefront && pnpm test

# E2E (requires Docker)
pnpm test:e2e:ci

# Type checking
pnpm typecheck
```

## CI/CD Integration

- **Pull Requests**: Run Unit & Integration tests plus E2E smoke tests. Block merge on failure.
- **Nightly/Release**: Run full E2E tests against a staging environment.

## API Contract Testing with Postman

### Overview
- **Collections**: Organized by domain (Store API, Admin API, Custom Endpoints, Stripe Webhooks)
- **Environments**: Pre-configured for Local, Staging, and Production
- **Contract Tests**: JSON schema validation embedded in requests
- **CI Integration**: Newman runs on every pull request

### CI/CD Workflow
The `.github/workflows/api-contract-tests.yml` workflow:
- Runs nightly and on manual dispatch
- Executes Store API, Admin API, and Custom Endpoints collections
- Generates HTML reports as build artifacts
- Fails the workflow on contract test failures
