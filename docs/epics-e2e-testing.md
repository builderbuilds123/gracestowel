---
stepsCompleted: [1, 2, 3, 4]
status: complete
inputDocuments:
  - docs/prd/e2e-testing-overhaul.md
  - .kiro/specs/e2e-testing-overhaul/requirements.md
  - .kiro/specs/e2e-testing-overhaul/design.md
  - .kiro/specs/e2e-testing-overhaul/tasks.md
project_name: E2E Testing Overhaul
date: 2025-12-14
---

# E2E Testing Overhaul - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for the E2E Testing Overhaul initiative, decomposing the requirements from the PRD and Kiro spec into implementable stories.

## Requirements Inventory

### Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Test Architecture Foundation - POM classes, fixtures, data factories | P0 |
| FR2 | Critical User Journey Coverage - browse, cart, checkout, order status | P0 |
| FR3 | Test Data Management - dynamic discovery, cleanup, unique IDs | P0 |
| FR4 | Network and Error Handling - API failures, timeouts, validation | P1 |
| FR5 | Visual Regression Testing - screenshots, diff images, baselines | P2 |
| FR6 | Test Execution and Reporting - HTML/JSON/JUnit, traces, retries | P0 |
| FR7 | Cross-Browser and Device Testing - Chromium, Firefox, WebKit, mobile | P1 |
| FR8 | Grace Period Feature Testing - timer, modifications, cancellation | P0 |
| FR9 | Stripe Payment Integration - test cards, webhooks, 3DS | P0 |
| FR10 | Playwright MCP Integration - semantic assertions, locators | P1 |
| FR11 | Test Stability and Flakiness Prevention - deterministic waits, network-first | P0 |
| FR12 | Complete Checkout Flow Testing - cart to order completion | P0 |
| FR13 | Order Lifecycle Testing - creation to capture | P0 |
| FR14 | Payment Failure and Recovery Testing - declines, 3DS, fallback | P0 |
| FR15 | Price Calculation and Discount Testing - totals, shipping | P1 |

### Non-Functional Requirements

| ID | Requirement |
|----|-------------|
| NFR1 | Performance: Test suite completes in <10 minutes |
| NFR2 | Reliability: <5% flakiness rate |
| NFR3 | Reliability: Retry failed tests up to 2 times in CI |
| NFR4 | Timeouts: 60s test, 15s action, 30s navigation |
| NFR5 | Compatibility: Chromium, Firefox, WebKit browsers |
| NFR6 | Compatibility: Desktop (1280×720) and mobile (375×667) viewports |
| NFR7 | Maintainability: Page Object Model for all major pages |
| NFR8 | Maintainability: Consistent file naming (`*.spec.ts`) |

### Additional Requirements (from Design/Architecture)

| Requirement | Source |
|-------------|--------|
| API-first testing approach (not UI testing) | Design Decision |
| Webhook mocking for Stripe (no hosted page automation) | Design Decision |
| fast-check library for property-based testing | Testing Strategy |
| Network-first pattern (intercept before navigate) | Design Decision |
| 15 correctness properties to validate | Design Spec |
| Page Objects: HomePage, ProductPage, CartPage, CheckoutPage, OrderStatusPage | Architecture |
| Fixtures: StripeMock, WebhookMock, DataFactory | Architecture |
| Helpers: TestCards, PriceHelper, APIRequest | Architecture |

### FR Coverage Map

| FR | Epic | Description |
|----|------|-------------|
| FR1 | Epic 1 | Test Architecture Foundation |
| FR2 | Epic 2, 8 | Critical User Journey Coverage |
| FR3 | Epic 1 | Test Data Management |
| FR4 | Epic 7 | Network and Error Handling |
| FR5 | Epic 9 | Visual Regression (deferred) |
| FR6 | Epic 1, 9 | Test Execution and Reporting |
| FR7 | Epic 8 | Cross-Browser and Device Testing |
| FR8 | Epic 5 | Grace Period Feature Testing |
| FR9 | Epic 3, 4, 7 | Stripe Payment Integration |
| FR10 | Epic 8 | Playwright MCP Integration |
| FR11 | Epic 1 | Test Stability and Flakiness Prevention |
| FR12 | Epic 2, 3 | Complete Checkout Flow Testing |
| FR13 | Epic 4, 5, 6 | Order Lifecycle Testing |
| FR14 | Epic 3, 6, 7 | Payment Failure and Recovery |
| FR15 | Epic 2 | Price Calculation and Discount |

## Epic List

### Epic 1: Test Infrastructure Foundation
**Goal:** QA engineers can set up and configure the E2E test environment with all necessary helpers, fixtures, and utilities.
**FRs covered:** FR1, FR3, FR6, FR11

### Epic 2: Cart Flow Testing
**Goal:** Developers can verify cart operations work correctly through comprehensive API tests.
**FRs covered:** FR2 (partial), FR12 (partial), FR15

### Epic 3: Payment Intent Flow Testing
**Goal:** Developers can verify PaymentIntent creation, updates, and stock validation work correctly.
**FRs covered:** FR9 (partial), FR12 (partial), FR14 (partial)

### Epic 4: Order Creation Flow Testing
**Goal:** Developers can verify orders are created correctly from Stripe webhooks with proper modification tokens.
**FRs covered:** FR9 (partial), FR13 (partial)

### Epic 5: Order Modification Flow Testing
**Goal:** Developers can verify the grace period feature works correctly for order modifications and cancellations.
**FRs covered:** FR8, FR13 (partial)

### Epic 6: Payment Capture Flow Testing
**Goal:** Developers can verify payment capture works correctly after grace period expiration, including fallback mechanisms.
**FRs covered:** FR13 (partial), FR14 (partial)

### Epic 7: Payment Error Flow Testing
**Goal:** Developers can verify payment error scenarios are handled correctly (declines, 3DS, network failures).
**FRs covered:** FR4, FR9 (partial), FR14 (partial)

### Epic 8: UI Smoke Tests & Cross-Browser
**Goal:** QA engineers can verify critical pages load correctly across browsers and viewports.
**FRs covered:** FR2 (partial), FR7, FR10

### Epic 9: Cleanup & Documentation
**Goal:** Team can maintain a clean, documented test suite with legacy tests archived.
**FRs covered:** FR5 (deferred), FR6 (partial)


---

## Epic 1: Test Infrastructure Foundation

**Goal:** QA engineers can set up and configure the E2E test environment with all necessary helpers, fixtures, and utilities.

### Story 1.1: Create Test Helper Utilities for Order and Webhook Simulation

As a **QA engineer**,
I want **test helper utilities for creating orders and simulating webhooks**,
So that **I can write tests without manually setting up complex test data**.

**Acceptance Criteria:**

**Given** the E2E test environment is set up
**When** I call `createTestOrder()` with optional overrides
**Then** a test order is created with a valid PaymentIntent in `requires_capture` status
**And** the order has correct items, amounts, and metadata

**Given** a test order exists
**When** I call `simulateWebhook('payment_intent.amount_capturable_updated', payload)`
**Then** the webhook is sent to the backend with a valid Stripe signature
**And** the backend processes the webhook and creates/updates the order

**Given** I need to generate a modification token
**When** I call `generateModificationToken(orderId, paymentIntentId)`
**Then** a valid JWT token is returned with correct claims and expiration

_Requirements: FR1.2, FR3.4, FR11.5_

---

### Story 1.2: Create Stripe Test Card Constants and Payment Helpers

As a **QA engineer**,
I want **Stripe test card constants and payment simulation utilities**,
So that **I can easily test different payment scenarios without looking up card numbers**.

**Acceptance Criteria:**

**Given** I need to test a successful payment
**When** I use `TEST_CARDS.SUCCESS`
**Then** the card number `4242424242424242` is used

**Given** I need to test a declined payment
**When** I use `TEST_CARDS.DECLINE_GENERIC`
**Then** the card number `4000000000000002` is used

**Given** I need to test 3D Secure
**When** I use `TEST_CARDS.REQUIRES_3DS`
**Then** the card number `4000002760003184` is used

**Given** I need to simulate a payment
**When** I call `simulatePayment(paymentIntentId, testCard)`
**Then** the PaymentIntent is confirmed with the specified test card

_Requirements: FR9.1, FR9.2, FR9.3_

---

### Story 1.3: Update Playwright Config for API-First Testing

As a **CI/CD engineer**,
I want **Playwright configured for API-first testing with proper timeouts and retries**,
So that **tests run reliably in CI with comprehensive reporting**.

**Acceptance Criteria:**

**Given** the Playwright config is updated
**When** tests run in CI
**Then** failed tests are retried up to 2 times

**Given** the Playwright config is updated
**When** tests complete
**Then** HTML, JSON, and JUnit XML reports are generated

**Given** the Playwright config is updated
**When** a test times out
**Then** the timeout values are 60s (test), 15s (action), 30s (navigation)

**Given** the Playwright config is updated
**When** tests fail
**Then** screenshots, videos, and traces are captured for debugging

_Requirements: FR6.1, FR6.2, FR6.3, FR6.5_

---

### Story 1.4: Create Data Factory Fixture for Test Isolation

As a **QA engineer**,
I want **a data factory fixture that generates unique test data**,
So that **tests can run in parallel without data collisions**.

**Acceptance Criteria:**

**Given** I need unique test data
**When** I use the DataFactory fixture
**Then** unique identifiers (timestamps, UUIDs) are generated for each test

**Given** a test creates data
**When** the test completes
**Then** the cleanup function removes created test data

**Given** tests run in parallel
**When** multiple tests use the DataFactory
**Then** no data collisions occur between tests

_Requirements: FR3.2, FR3.3, FR11.3_


---

## Epic 2: Cart Flow Testing

**Goal:** Developers can verify cart operations work correctly through comprehensive API tests.

### Story 2.1: Create Cart API Test Suite

As a **developer**,
I want **API tests that verify cart add, update, and remove operations**,
So that **I can ensure cart functionality works correctly without UI dependencies**.

**Acceptance Criteria:**

**Given** an empty cart
**When** I add a product via the cart API
**Then** the cart contains the product with correct quantity

**Given** a cart with items
**When** I update the quantity of an item
**Then** the cart reflects the new quantity

**Given** a cart with items
**When** I remove an item
**Then** the item is no longer in the cart

**Given** a cart with items
**When** I reload the page
**Then** the cart items are restored from localStorage

_Requirements: FR2.2, FR12.1_

---

### Story 2.2: Create Cart Total Calculation Tests

As a **developer**,
I want **tests that verify cart total calculations are correct**,
So that **customers are never charged incorrect amounts**.

**Acceptance Criteria:**

**Given** a cart with multiple items
**When** I calculate the cart total
**Then** the total equals the sum of (item.price × item.quantity) for all items

**Given** items with discounted prices
**When** I view the cart
**Then** both original and discounted prices are displayed correctly

**Given** a cart total that qualifies for free shipping
**When** I view shipping options
**Then** ground shipping shows $0.00 with original price struck through

_Requirements: FR15.1, FR15.2, FR15.4_

---

### Story 2.3: Write Property Test for Cart State Consistency

As a **QA engineer**,
I want **a property-based test that verifies cart state consistency**,
So that **cart totals are always mathematically correct regardless of operations**.

**Acceptance Criteria:**

**Given** any sequence of cart operations (add, update, remove)
**When** the cart total is calculated
**Then** the total equals the sum of (item.price × item.quantity) for all items

**Given** the property test runs
**When** fast-check generates 100+ random cart operation sequences
**Then** all sequences pass the cart state consistency property

_Requirements: FR12.1, FR15.1 | **Property 1: Cart State Consistency**_

---

## Epic 3: Payment Intent Flow Testing

**Goal:** Developers can verify PaymentIntent creation, updates, and stock validation work correctly.

### Story 3.1: Create PaymentIntent API Test Suite

As a **developer**,
I want **API tests that verify PaymentIntent creation and updates**,
So that **payment amounts are always correct and idempotency is maintained**.

**Acceptance Criteria:**

**Given** a cart with items
**When** I create a PaymentIntent via the API
**Then** the PaymentIntent amount equals (cartTotal + shippingCost) × 100 cents

**Given** an existing PaymentIntent
**When** I update the cart and call the payment-intent API
**Then** the same PaymentIntent is updated (not recreated)
**And** the clientSecret remains the same

**Given** a PaymentIntent creation request
**When** I send the same idempotency key twice
**Then** Stripe returns the same PaymentIntent without creating a duplicate

_Requirements: FR12.4, FR12.5, FR14.3_

---

### Story 3.2: Create Stock Validation Test Suite

As a **developer**,
I want **tests that verify stock validation errors are handled correctly**,
So that **customers cannot checkout with out-of-stock items**.

**Acceptance Criteria:**

**Given** a cart item with quantity exceeding available inventory
**When** I attempt to checkout
**Then** an error message is displayed listing the item name and available quantity

**Given** multiple items with insufficient stock
**When** I attempt to checkout
**Then** all affected items are listed with their available quantities

**Given** stock changes during checkout
**When** I submit payment
**Then** stock is re-validated and errors are shown if needed

_Requirements: FR12.8_

---

### Story 3.3: Write Property Test for PaymentIntent Amount Consistency

As a **QA engineer**,
I want **a property-based test that verifies PaymentIntent amounts are always correct**,
So that **customers are never overcharged or undercharged**.

**Acceptance Criteria:**

**Given** any cart total and shipping cost
**When** a PaymentIntent is created or updated
**Then** the amount in cents equals (cartTotal + shippingCost) × 100, rounded to nearest integer

**Given** the property test runs
**When** fast-check generates 100+ random cart/shipping combinations
**Then** all combinations pass the PaymentIntent amount consistency property

_Requirements: FR12.4, FR12.5, FR15.5 | **Property 2: PaymentIntent Amount Consistency**_

---

## Epic 4: Order Creation Flow Testing

**Goal:** Developers can verify orders are created correctly from Stripe webhooks with proper modification tokens.

### Story 4.1: Create Webhook Handler Test Suite

As a **developer**,
I want **tests that verify order creation from Stripe webhooks**,
So that **orders are created correctly when payments are authorized**.

**Acceptance Criteria:**

**Given** a PaymentIntent with status `requires_capture`
**When** the `payment_intent.amount_capturable_updated` webhook is received
**Then** an order is created with correct items and amounts

**Given** a webhook event ID that was already processed
**When** the same webhook is received again
**Then** the webhook is handled idempotently (no duplicate order)

**Given** a webhook with an invalid signature
**When** the webhook is received
**Then** the request is rejected with 401 status

_Requirements: FR13.1, FR9.4, FR9.5_

---

### Story 4.2: Create Modification Token Test Suite

As a **developer**,
I want **tests that verify modification token generation and validation**,
So that **only authorized users can modify orders during the grace period**.

**Acceptance Criteria:**

**Given** a newly created order
**When** the order response is returned
**Then** a modification token is included with correct claims

**Given** a valid modification token
**When** I use it to access the order status page
**Then** the order details are displayed

**Given** an expired modification token
**When** I use it to access the order status page
**Then** a "link expired" message is displayed with option to request new link

**Given** a token with invalid signature
**When** I use it to access the order status page
**Then** access is denied with appropriate error

_Requirements: FR13.2, FR8.4_

---

### Story 4.3: Write Property Test for Order Creation from Webhook

As a **QA engineer**,
I want **a property-based test that verifies orders are created correctly from webhooks**,
So that **order data integrity is maintained**.

**Acceptance Criteria:**

**Given** any PaymentIntent with status `requires_capture`
**When** the webhook is processed
**Then** the created order has correct items, amounts, and metadata

**Given** the property test runs
**When** fast-check generates 100+ random PaymentIntent payloads
**Then** all payloads result in correctly created orders

_Requirements: FR13.1 | **Property 5: Order Creation from Webhook**_

---

## Epic 5: Order Modification Flow Testing

**Goal:** Developers can verify the grace period feature works correctly for order modifications and cancellations.

### Story 5.1: Create Grace Period Test Suite

As a **developer**,
I want **tests that verify grace period timing and modification availability**,
So that **customers can modify orders within the allowed window**.

**Acceptance Criteria:**

**Given** an order created less than 1 hour ago
**When** I view the order status page with valid token
**Then** modification options (cancel, edit address, add items) are visible

**Given** an order created more than 1 hour ago
**When** I view the order status page
**Then** modification options are hidden
**And** a "being processed" message is displayed

**Given** an order within grace period
**When** I view the order status page
**Then** a countdown timer shows remaining time

_Requirements: FR8.2, FR8.3, FR13.3_

---

### Story 5.2: Create Order Cancellation Test Suite

As a **developer**,
I want **tests that verify order cancellation works correctly**,
So that **customers can cancel orders within the grace period**.

**Acceptance Criteria:**

**Given** an order within grace period
**When** I cancel the order with valid token
**Then** the order status updates to "cancelled"
**And** the PaymentIntent is cancelled in Stripe
**And** the BullMQ capture job is removed

**Given** an order outside grace period
**When** I attempt to cancel the order
**Then** the cancellation is rejected with "grace period expired" error

**Given** an already cancelled order
**When** I attempt to cancel again
**Then** the request is rejected with "already cancelled" error

_Requirements: FR8.5, FR13.6_

---

### Story 5.3: Create Order Update Test Suite

As a **developer**,
I want **tests that verify order address and item updates work correctly**,
So that **customers can modify their orders within the grace period**.

**Acceptance Criteria:**

**Given** an order within grace period
**When** I update the shipping address
**Then** the address is updated in both order and PaymentIntent metadata

**Given** an order within grace period
**When** I add items to the order
**Then** the order items are updated
**And** the PaymentIntent amount is increased accordingly

**Given** concurrent modification attempts
**When** two updates are submitted simultaneously
**Then** optimistic locking prevents data corruption

_Requirements: FR13.7, FR13.8_

---

## Epic 6: Payment Capture Flow Testing

**Goal:** Developers can verify payment capture works correctly after grace period expiration, including fallback mechanisms.

### Story 6.1: Create Payment Capture Test Suite

As a **developer**,
I want **tests that verify payment capture after grace period**,
So that **payments are captured correctly and order status is updated**.

**Acceptance Criteria:**

**Given** an order with grace period expired
**When** the BullMQ capture job runs
**Then** the PaymentIntent is captured
**And** the order status updates to "captured"

**Given** a successful payment capture
**When** the capture completes
**Then** a confirmation email is sent to the customer

**Given** a payment capture failure
**When** the capture fails
**Then** the error is logged
**And** a manual intervention alert is triggered

_Requirements: FR13.4, FR13.5_

---

### Story 6.2: Create Fallback Capture Test Suite

As a **developer**,
I want **tests that verify fallback capture handles missed jobs**,
So that **no payments are left uncaptured**.

**Acceptance Criteria:**

**Given** an order with `needs_recovery` flag
**When** the fallback capture cron runs
**Then** the payment is captured

**Given** an order with PaymentIntent in `requires_capture` for >65 minutes
**When** the fallback capture cron runs
**Then** the payment is captured

**Given** Redis is unavailable during order creation
**When** the order is created
**Then** the order is flagged with `needs_recovery` metadata

_Requirements: FR14.4, FR14.5_

---

## Epic 7: Payment Error Flow Testing

**Goal:** Developers can verify payment error scenarios are handled correctly (declines, 3DS, network failures).

### Story 7.1: Create Payment Decline Test Suite

As a **developer**,
I want **tests that verify payment decline handling**,
So that **customers see appropriate error messages and can retry**.

**Acceptance Criteria:**

**Given** a payment with generic decline test card
**When** the payment is submitted
**Then** "Your card was declined" error is displayed

**Given** a payment with insufficient funds test card
**When** the payment is submitted
**Then** "Your card has insufficient funds" error is displayed

**Given** a declined payment
**When** the customer enters a different card
**Then** they can retry the payment

_Requirements: FR14.1, FR9.2_

---

### Story 7.2: Create 3D Secure Test Suite

As a **developer**,
I want **tests that verify 3D Secure authentication handling**,
So that **3DS flows work correctly for both success and failure**.

**Acceptance Criteria:**

**Given** a payment with 3DS-required test card
**When** the payment is submitted
**Then** the 3D Secure authentication modal appears

**Given** 3DS authentication succeeds
**When** the customer completes authentication
**Then** the payment proceeds to completion

**Given** 3DS authentication fails
**When** the customer fails authentication
**Then** "Authentication failed" error is displayed
**And** the customer can retry with a different card

_Requirements: FR9.3, FR14.2_

---

### Story 7.3: Create Network Error Test Suite

As a **developer**,
I want **tests that verify network error handling during payment**,
So that **customers don't get double-charged on retry**.

**Acceptance Criteria:**

**Given** a network failure during PaymentIntent creation
**When** the request is retried with the same idempotency key
**Then** no duplicate PaymentIntent is created

**Given** a network timeout during payment submission
**When** the customer retries
**Then** the existing PaymentIntent is used (not recreated)

**Given** API returns validation errors
**When** the error response is received
**Then** field-specific error messages are displayed

_Requirements: FR4.1, FR4.4, FR14.3_

---

## Epic 8: UI Smoke Tests & Cross-Browser

**Goal:** QA engineers can verify critical pages load correctly across browsers and viewports.

### Story 8.1: Create Minimal UI Smoke Test Suite

As a **QA engineer**,
I want **minimal smoke tests that verify critical pages load**,
So that **major UI regressions are caught without full UI testing**.

**Acceptance Criteria:**

**Given** the storefront is running
**When** I navigate to the homepage
**Then** the page loads with product listings visible

**Given** the storefront is running
**When** I navigate to the checkout page
**Then** the checkout form is displayed

**Given** a valid order and modification token
**When** I navigate to the order status page
**Then** the order details are displayed

_Requirements: FR2.1, FR7.1_

---

### Story 8.2: Create Cross-Browser and Viewport Tests

As a **QA engineer**,
I want **tests that verify critical flows work across browsers and viewports**,
So that **customers have a consistent experience**.

**Acceptance Criteria:**

**Given** the smoke tests
**When** they run on Chromium, Firefox, and WebKit
**Then** all tests pass on all browsers

**Given** the smoke tests
**When** they run on desktop (1280×720) viewport
**Then** all tests pass

**Given** the smoke tests
**When** they run on mobile (375×667) viewport
**Then** all tests pass

_Requirements: FR7.1, FR7.5, FR10.2_

---

## Epic 9: Cleanup & Documentation

**Goal:** Team can maintain a clean, documented test suite with legacy tests archived.

### Story 9.1: Archive Legacy Tests

As a **QA engineer**,
I want **legacy failing tests archived**,
So that **the test suite only contains working, relevant tests**.

**Acceptance Criteria:**

**Given** the legacy test files exist
**When** I run the archive script
**Then** `checkout.spec.ts` is moved to `archive/` folder
**And** `grace-period.spec.ts` is moved to `archive/` folder
**And** `visual-regression.spec.ts` is moved to `archive/` folder
**And** `network-failures.spec.ts` is moved to `archive/` folder

**Given** the archive is complete
**When** I run the test suite
**Then** only the new API-first tests run

_Requirements: FR11.1_

---

### Story 9.2: Update README with Testing Documentation

As a **developer**,
I want **updated documentation for the new testing approach**,
So that **team members can understand and run the tests**.

**Acceptance Criteria:**

**Given** the README is updated
**When** a developer reads it
**Then** they understand the API-first testing strategy

**Given** the README is updated
**When** a developer wants to run tests
**Then** they find clear instructions for running tests locally and in CI

**Given** the README is updated
**When** a developer wants to add new tests
**Then** they find guidelines for using test helpers and fixtures

_Requirements: FR6.4_
