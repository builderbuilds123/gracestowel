# Testing Strategy Design Document

**Date**: 2025-11-26
**Status**: Draft
**Scope**: Storefront (React Router v7) & Backend (Medusa v2)

## 1. Executive Summary
This document outlines the testing strategy for the Grace Stowel e-commerce platform. The goal is to ensure high reliability for critical revenue-generating flows (Checkout, Add to Cart) while maintaining developer velocity. We will adopt a "Testing Pyramid" approach, heavily investing in fast unit/integration tests and using E2E tests for critical user journeys.

## 2. Technology Stack

| Layer | Current Status | Recommended Tooling |
| :--- | :--- | :--- |
| **Storefront Unit/Integration** | None | **Vitest** + **React Testing Library** |
| **Backend Unit/Integration** | Jest (Installed) | **Jest** + **@medusajs/test-utils** |
| **E2E (End-to-End)** | None | **Playwright** |

## 3. Testing Pyramid Strategy

### 3.1. Unit Tests (Fast, Isolated)
**Focus**: Individual functions, hooks, and pure UI components.
*   **Storefront**:
    *   `ProductPrice.tsx`: Verify formatting logic (currency conversion).
    *   `Dropdown.tsx`: Verify open/close state and selection logic.
    *   `AnnouncementBar.tsx`: Verify rendering of text.
    *   `lib/medusa.server.ts`: Mock fetch to verify API request construction.
*   **Backend**:
    *   `src/modules/resend`: Verify email payload construction.
    *   Utility functions.

### 3.2. Integration Tests (Component Interactions)
**Focus**: Components communicating with Contexts or external services.
*   **Storefront**:
    *   `CartDrawer.tsx`: Test interaction with `CartContext` (add/remove items).
    *   `CheckoutForm.tsx`: Mock Stripe Elements to verify form submission handling.
    *   `EmbroideryCustomizer.tsx`: Verify state updates when options are selected.
    *   `ProductFilters.tsx`: Verify URL parameter updates on filter selection.
*   **Backend**:
    *   API Routes (`src/api`): Use `@medusajs/test-utils` to spin up a test server and hit endpoints.
    *   Workflows: Test business logic flows (e.g., "Complete Order").

### 3.3. E2E Tests (Critical User Journeys)
**Focus**: Full system verification in a browser-like environment.
*   **Critical Paths**:
    1.  **Guest Checkout**: Home -> Product -> Add to Cart -> Checkout -> Payment -> Success.
    2.  **Search & Filter**: Search for "Towel" -> Filter by Color -> Verify Results.
    3.  **Cart Management**: Add item -> Open Drawer -> Increment Quantity -> Remove Item.

## 4. Detailed Test Plan

### 4.1. Storefront Components
| Component | Test Type | Scenarios |
| :--- | :--- | :--- |
| `Header.tsx` | Integration | Verify Cart count updates; Verify Link navigation. |
| `ProductCard.tsx` | Unit | Render with/without sale price; Verify image loading. |
| `EmbroideryCustomizer` | Integration | Select text -> Select color -> Verify preview updates. |
| `CheckoutForm` | Integration | Submit empty form (validation); Submit valid form (API call). |

### 4.2. Backend Modules
| Module | Test Type | Scenarios |
| :--- | :--- | :--- |
| `ResendService` | Unit | `sendEmail` calls Resend API with correct template ID. |
| `PaymentIntent API` | Integration | POST `/api/payment-intent` creates Stripe intent. |

## 5. Implementation Roadmap

### Phase 1: Infrastructure Setup
1.  Install Vitest & React Testing Library in `apps/storefront`.
2.  Configure `vitest.config.ts` for React Router v7.
3.  Install Playwright in root or `apps/e2e`.

### Phase 2: Critical Unit Tests
1.  Write tests for `ProductPrice` (high visibility).
2.  Write tests for `CartContext` (high logic complexity).

### Phase 3: Backend Integration
1.  Configure `medusa-test-utils` with a test database.
2.  Write tests for custom API routes.

### Phase 4: E2E Safety Net
1.  Implement "Guest Checkout" E2E test.
2.  Configure CI (GitHub Actions) to run tests on PR.

## 6. CI/CD Integration
*   **Pull Requests**: Run Unit & Integration tests. Block merge on failure.
*   **Nightly/Release**: Run E2E tests against a staging environment.

## 7. API Contract Testing with Postman

In addition to the testing pyramid, we use Postman collections for API contract testing.

### Overview
- **Collections**: Organized by domain (Store API, Admin API, Custom Endpoints, Stripe Webhooks)
- **Environments**: Pre-configured for Local, Staging, and Production
- **Contract Tests**: JSON schema validation embedded in requests
- **CI Integration**: Newman runs on every pull request

### Key Features
- Request chaining for multi-step flows (checkout flow)
- Stripe webhook signature generation for local testing
- Automated variable passing between requests
- HTML report generation

### Documentation
See the [Postman README](../postman/README.md) for:
- Import and setup instructions
- Environment configuration
- Running collections manually and via CLI
- Adding new requests
- Troubleshooting guide

### CI/CD Workflow
The `.github/workflows/api-contract-tests.yml` workflow:
- Runs on pull requests to `main` and `staging`
- Executes Store API, Admin API, and Custom Endpoints collections
- Generates HTML reports as build artifacts
- Blocks PR merge on contract test failures
