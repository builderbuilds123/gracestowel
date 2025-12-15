# Requirements Document

## Introduction

This document specifies the requirements for overhauling the Grace Stowel E2E testing suite. The current test suite has significant issues including failing tests, missing test coverage, hardcoded dependencies, and lack of proper test architecture patterns. The overhaul aims to create a robust, maintainable, and comprehensive E2E testing framework using Playwright that provides reliable coverage of critical user journeys.

## Glossary

- **E2E_Test_Suite**: The complete collection of end-to-end tests for the Grace Stowel e-commerce platform
- **Page_Object_Model (POM)**: A design pattern that creates an object repository for web UI elements, improving test maintainability
- **Test_Fixture**: Reusable test setup and teardown logic that provides consistent test state
- **Data_Factory**: A utility that generates test data dynamically to avoid hardcoded dependencies
- **Critical_User_Journey**: A sequence of user interactions that represents a key business flow
- **Visual_Regression_Test**: A test that compares screenshots to detect unintended UI changes
- **Resilience_Test**: A test that verifies application behavior under adverse conditions (network failures, timeouts)
- **Test_Isolation**: The principle that each test runs independently without affecting other tests
- **Storefront**: The customer-facing React Router application at apps/storefront
- **Backend**: The Medusa-based API server at apps/backend
- **Stripe_Test_Card**: Special card numbers provided by Stripe for testing payment flows without real transactions
- **Webhook_Mock**: A simulated webhook payload used to test event handling without relying on actual Stripe callbacks
- **Payment_Intent**: A Stripe object representing a payment attempt, tracking the lifecycle from creation to completion
- **Checkout_Session**: A Stripe-hosted payment page that handles the entire checkout flow
- **Playwright_MCP**: Model Context Protocol server for Playwright that enables AI-assisted test automation
- **Semantic_Assertion**: A test assertion based on meaningful content (text, roles, labels) rather than visual appearance
- **Manual_Capture_Mode**: Stripe payment mode where funds are authorized but not captured until explicitly requested
- **Grace_Period**: The time window (default 1 hour) after order placement during which customers can modify or cancel orders
- **Modification_Token**: A JWT token that authorizes order modifications during the grace period
- **BullMQ**: A Redis-based job queue used for scheduling delayed payment captures
- **Fallback_Capture**: A cron job that captures payments for orders that missed the primary BullMQ capture job
- **Idempotency_Key**: A unique key sent with Stripe API requests to prevent duplicate operations on retry
- **Free_Gift_Threshold**: The cart total amount that triggers automatic addition of a free gift item
- **TDD_Approach**: Test-Driven Development where tests are written before or alongside implementation to drive correct behavior

## Requirements

### Requirement 1: Test Architecture Foundation

**User Story:** As a QA engineer, I want a well-structured test architecture, so that tests are maintainable, reusable, and easy to understand.

#### Acceptance Criteria

1. WHEN a developer creates a new test THEN the E2E_Test_Suite SHALL provide Page_Object_Model classes for all major pages (HomePage, ProductPage, CartPage, CheckoutPage, OrderStatusPage)
2. WHEN tests require common setup THEN the E2E_Test_Suite SHALL provide Test_Fixture utilities for authentication, cart management, and data seeding
3. WHEN tests need test data THEN the E2E_Test_Suite SHALL provide Data_Factory utilities that generate unique, parallel-safe test data
4. WHEN a test file is created THEN the E2E_Test_Suite SHALL enforce a consistent file naming convention using `*.spec.ts` suffix
5. WHEN tests are organized THEN the E2E_Test_Suite SHALL group tests by feature domain in dedicated directories (checkout, product, cart, auth, order)

### Requirement 2: Critical User Journey Coverage

**User Story:** As a product owner, I want comprehensive E2E coverage of critical user journeys, so that I can be confident the core shopping experience works correctly.

#### Acceptance Criteria

1. WHEN a guest user browses products THEN the E2E_Test_Suite SHALL verify product listing, filtering, and search functionality
2. WHEN a guest user adds products to cart THEN the E2E_Test_Suite SHALL verify cart operations (add, update quantity, remove, persistence)
3. WHEN a guest user proceeds to checkout THEN the E2E_Test_Suite SHALL verify the complete checkout flow (shipping, payment, order confirmation)
4. WHEN a user views order status THEN the E2E_Test_Suite SHALL verify order tracking and grace period functionality
5. WHEN a user interacts with the storefront THEN the E2E_Test_Suite SHALL verify responsive behavior on desktop and mobile viewports

### Requirement 3: Test Data Management

**User Story:** As a test automation engineer, I want reliable test data management, so that tests are not dependent on specific database state.

#### Acceptance Criteria

1. WHEN tests require products THEN the E2E_Test_Suite SHALL dynamically discover available products via API rather than hardcoding product handles
2. WHEN tests create data THEN the E2E_Test_Suite SHALL clean up created data after test completion to maintain Test_Isolation
3. WHEN tests run in parallel THEN the E2E_Test_Suite SHALL generate unique identifiers to prevent data collisions
4. WHEN test data is needed THEN the E2E_Test_Suite SHALL provide seed helpers that create required data via API before tests run
5. WHEN environment-specific data is required THEN the E2E_Test_Suite SHALL read configuration from environment variables with sensible defaults

### Requirement 4: Network and Error Handling

**User Story:** As a developer, I want tests that verify error handling and network resilience, so that I can ensure the application handles failures gracefully.

#### Acceptance Criteria

1. WHEN API requests fail THEN the E2E_Test_Suite SHALL verify appropriate error messages are displayed to users
2. WHEN network is slow THEN the E2E_Test_Suite SHALL verify loading states are shown and timeouts are handled
3. WHEN network is interrupted THEN the E2E_Test_Suite SHALL verify cart data persists in local storage
4. WHEN API returns validation errors THEN the E2E_Test_Suite SHALL verify form validation feedback is displayed
5. WHEN tests intercept network requests THEN the E2E_Test_Suite SHALL use network-first pattern (intercept before navigate)

### Requirement 5: Visual Regression Testing

**User Story:** As a UI developer, I want visual regression tests that detect unintended UI changes, so that I can maintain visual consistency.

#### Acceptance Criteria

1. WHEN visual tests run THEN the E2E_Test_Suite SHALL capture screenshots of critical pages (homepage, product page, cart, checkout)
2. WHEN visual tests compare screenshots THEN the E2E_Test_Suite SHALL allow configurable pixel difference thresholds
3. WHEN visual tests fail THEN the E2E_Test_Suite SHALL generate diff images showing the visual differences
4. WHEN baseline screenshots need updating THEN the E2E_Test_Suite SHALL provide a command to regenerate baselines
5. WHEN visual tests run on different browsers THEN the E2E_Test_Suite SHALL maintain separate baseline snapshots per browser

### Requirement 6: Test Execution and Reporting

**User Story:** As a CI/CD engineer, I want reliable test execution with comprehensive reporting, so that I can integrate tests into the deployment pipeline.

#### Acceptance Criteria

1. WHEN tests complete THEN the E2E_Test_Suite SHALL generate HTML, JSON, and JUnit XML reports
2. WHEN tests fail THEN the E2E_Test_Suite SHALL capture screenshots, videos, and traces for debugging
3. WHEN tests run in CI THEN the E2E_Test_Suite SHALL retry failed tests up to 2 times to handle flakiness
4. WHEN tests run locally THEN the E2E_Test_Suite SHALL support headed mode, UI mode, and debug mode
5. WHEN tests timeout THEN the E2E_Test_Suite SHALL use consistent timeout values (60s test, 15s action, 30s navigation)

### Requirement 7: Cross-Browser and Device Testing

**User Story:** As a QA engineer, I want tests that run across multiple browsers and devices, so that I can ensure broad compatibility.

#### Acceptance Criteria

1. WHEN tests execute THEN the E2E_Test_Suite SHALL run on Chromium, Firefox, and WebKit browsers
2. WHEN mobile testing is required THEN the E2E_Test_Suite SHALL run on mobile viewport configurations (Pixel 5, iPhone 12)
3. WHEN browser-specific issues exist THEN the E2E_Test_Suite SHALL allow skipping tests for specific browsers with annotations
4. WHEN tests run across browsers THEN the E2E_Test_Suite SHALL use browser-agnostic selectors (data-testid, roles, labels)
5. WHEN responsive behavior is tested THEN the E2E_Test_Suite SHALL verify critical flows work on both desktop and mobile viewports

### Requirement 8: Grace Period Feature Testing

**User Story:** As a product owner, I want comprehensive tests for the order grace period feature, so that I can ensure customers can modify orders within the allowed window.

#### Acceptance Criteria

1. WHEN an order is placed THEN the E2E_Test_Suite SHALL verify the grace period timer is displayed
2. WHEN the grace period is active THEN the E2E_Test_Suite SHALL verify order modification options are available
3. WHEN the grace period expires THEN the E2E_Test_Suite SHALL verify modification options are hidden
4. WHEN a magic link is used THEN the E2E_Test_Suite SHALL verify token validation and cookie persistence
5. WHEN an order is cancelled during grace period THEN the E2E_Test_Suite SHALL verify cancellation succeeds and confirmation is shown

### Requirement 9: Stripe Payment Integration Testing

**User Story:** As a developer, I want comprehensive Stripe payment testing, so that I can ensure payment flows work correctly without relying on UI automation of Stripe's hosted pages.

#### Acceptance Criteria

1. WHEN testing payment flows THEN the E2E_Test_Suite SHALL use Stripe test card numbers (4242424242424242) for successful payments
2. WHEN testing payment failures THEN the E2E_Test_Suite SHALL use Stripe decline test cards (4000000000000002) to verify error handling
3. WHEN testing 3D Secure flows THEN the E2E_Test_Suite SHALL use Stripe 3DS test cards (4000002760003184) to verify authentication handling
4. WHEN testing webhook events THEN the E2E_Test_Suite SHALL mock webhook payloads rather than relying on actual Stripe callbacks
5. WHEN testing checkout completion THEN the E2E_Test_Suite SHALL verify the checkout.session.completed event is handled correctly by mocking the webhook payload
6. WHEN testing payment intent states THEN the E2E_Test_Suite SHALL verify proper handling of succeeded, failed, and requires_action states

### Requirement 10: Playwright MCP Integration

**User Story:** As a test automation engineer, I want to leverage Playwright MCP server capabilities, so that I can reduce reliance on brittle screenshot comparisons and improve test reliability.

#### Acceptance Criteria

1. WHEN verifying page content THEN the E2E_Test_Suite SHALL use semantic assertions (text content, ARIA roles, accessibility attributes) instead of screenshot comparisons
2. WHEN testing UI components THEN the E2E_Test_Suite SHALL use Playwright's built-in locators (getByRole, getByLabel, getByTestId) for reliable element selection
3. WHEN testing dynamic content THEN the E2E_Test_Suite SHALL use Playwright's auto-waiting and web-first assertions instead of explicit waits
4. WHEN testing accessibility THEN the E2E_Test_Suite SHALL use Playwright's accessibility snapshot capabilities to verify ARIA compliance
5. WHEN debugging test failures THEN the E2E_Test_Suite SHALL leverage Playwright's trace viewer and inspector tools for root cause analysis

### Requirement 11: Test Stability and Flakiness Prevention

**User Story:** As a CI/CD engineer, I want stable tests that minimize false failures, so that the test suite provides reliable feedback on code quality.

#### Acceptance Criteria

1. WHEN tests interact with dynamic content THEN the E2E_Test_Suite SHALL use deterministic waits (waitForResponse, waitForSelector) instead of arbitrary timeouts
2. WHEN tests depend on API responses THEN the E2E_Test_Suite SHALL intercept network requests before navigation to prevent race conditions
3. WHEN tests create test data THEN the E2E_Test_Suite SHALL use unique identifiers (timestamps, UUIDs) to prevent data collisions in parallel execution
4. WHEN tests fail intermittently THEN the E2E_Test_Suite SHALL provide detailed trace logs and screenshots for debugging
5. WHEN tests require specific state THEN the E2E_Test_Suite SHALL use API-based setup instead of UI navigation for faster and more reliable test preparation

### Requirement 12: Complete Checkout Flow Testing (TDD Approach)

**User Story:** As a product owner, I want comprehensive TDD-based testing of the entire checkout flow, so that I can ensure every step from cart to order completion works correctly and any implementation bugs are caught early.

#### Acceptance Criteria

1. WHEN a user adds items to cart THEN the E2E_Test_Suite SHALL verify cart state updates correctly (item count, total, localStorage persistence)
2. WHEN cart total exceeds free gift threshold THEN the E2E_Test_Suite SHALL verify free gift is automatically added to cart
3. WHEN cart total drops below free gift threshold THEN the E2E_Test_Suite SHALL verify free gift is automatically removed
4. WHEN user proceeds to checkout THEN the E2E_Test_Suite SHALL verify PaymentIntent is created with correct amount and metadata
5. WHEN user updates cart during checkout THEN the E2E_Test_Suite SHALL verify PaymentIntent is updated (not recreated) to preserve clientSecret
6. WHEN user enters shipping address THEN the E2E_Test_Suite SHALL verify shipping rates are fetched and displayed correctly
7. WHEN cart total qualifies for free shipping THEN the E2E_Test_Suite SHALL verify ground shipping shows $0.00 with original price struck through
8. WHEN stock validation fails THEN the E2E_Test_Suite SHALL verify appropriate error message is displayed with out-of-stock items listed
9. WHEN payment is submitted THEN the E2E_Test_Suite SHALL verify PaymentIntent status transitions to requires_capture (manual capture mode)
10. WHEN payment succeeds THEN the E2E_Test_Suite SHALL verify redirect to checkout success page with correct order details

### Requirement 13: Order Lifecycle Testing

**User Story:** As a developer, I want comprehensive testing of the order lifecycle from creation to completion, so that I can ensure orders are processed correctly through all states.

#### Acceptance Criteria

1. WHEN payment is authorized THEN the E2E_Test_Suite SHALL verify order is created via Stripe webhook (payment_intent.amount_capturable_updated)
2. WHEN order is created THEN the E2E_Test_Suite SHALL verify modification token is generated and returned to frontend
3. WHEN order is within grace period THEN the E2E_Test_Suite SHALL verify modification options (cancel, edit address, add items) are available
4. WHEN grace period expires THEN the E2E_Test_Suite SHALL verify payment capture job is triggered via BullMQ
5. WHEN payment is captured THEN the E2E_Test_Suite SHALL verify order status updates and confirmation email is sent
6. WHEN order is cancelled during grace period THEN the E2E_Test_Suite SHALL verify PaymentIntent is cancelled and capture job is removed from queue
7. WHEN order address is updated THEN the E2E_Test_Suite SHALL verify shipping address is updated in both order and PaymentIntent metadata
8. WHEN items are added to order THEN the E2E_Test_Suite SHALL verify PaymentIntent amount is updated and order items reflect changes

### Requirement 14: Payment Failure and Recovery Testing

**User Story:** As a developer, I want comprehensive testing of payment failure scenarios and recovery mechanisms, so that I can ensure the system handles edge cases gracefully.

#### Acceptance Criteria

1. WHEN payment is declined THEN the E2E_Test_Suite SHALL verify appropriate error message is displayed and user can retry with different card
2. WHEN 3D Secure authentication is required THEN the E2E_Test_Suite SHALL verify authentication modal appears and handles success/failure
3. WHEN network fails during payment THEN the E2E_Test_Suite SHALL verify idempotency key prevents duplicate charges on retry
4. WHEN webhook delivery fails THEN the E2E_Test_Suite SHALL verify fallback capture job handles uncaptured payments after 65 minutes
5. WHEN Redis is unavailable THEN the E2E_Test_Suite SHALL verify orders are flagged with needs_recovery metadata for fallback processing
6. WHEN payment capture fails THEN the E2E_Test_Suite SHALL verify error is logged and manual intervention alert is triggered

### Requirement 15: Price Calculation and Discount Testing

**User Story:** As a product owner, I want comprehensive testing of price calculations and discounts, so that I can ensure customers are charged correctly.

#### Acceptance Criteria

1. WHEN items are added to cart THEN the E2E_Test_Suite SHALL verify cart total is calculated correctly (sum of item prices × quantities)
2. WHEN items have discounted prices THEN the E2E_Test_Suite SHALL verify both original and discounted prices are displayed correctly
3. WHEN shipping is selected THEN the E2E_Test_Suite SHALL verify final total includes shipping cost
4. WHEN free shipping threshold is met THEN the E2E_Test_Suite SHALL verify shipping cost is $0 and savings are displayed
5. WHEN PaymentIntent is created THEN the E2E_Test_Suite SHALL verify amount matches cart total + shipping (converted to cents correctly)
