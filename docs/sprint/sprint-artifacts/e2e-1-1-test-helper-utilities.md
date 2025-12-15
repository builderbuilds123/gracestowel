# Story 1-1: Create Test Helper Utilities for Order and Webhook Simulation

**Epic:** Epic 1 - Test Infrastructure Foundation  
**Status:** drafted  
**Created:** 2025-12-14  
**Requirements:** FR1.2, FR3.4, FR11.5

---

## User Story

As a **QA engineer**,  
I want **test helper utilities for creating orders and simulating webhooks**,  
So that **I can write tests without manually setting up complex test data**.

---

## Acceptance Criteria

### AC1: Test Order Creation Helper
**Given** the E2E test environment is set up  
**When** I call `createTestOrder()` with optional overrides  
**Then** a test order is created with a valid PaymentIntent in `requires_capture` status  
**And** the order has correct items, amounts, and metadata

### AC2: Webhook Simulation Helper
**Given** a test order exists  
**When** I call `simulateWebhook('payment_intent.amount_capturable_updated', payload)`  
**Then** the webhook is sent to the backend with a valid Stripe signature  
**And** the backend processes the webhook and creates/updates the order

### AC3: Modification Token Generator
**Given** I need to generate a modification token  
**When** I call `generateModificationToken(orderId, paymentIntentId)`  
**Then** a valid JWT token is returned with correct claims and expiration

---

## Technical Context

### Architecture Reference
From `.kiro/specs/e2e-testing-overhaul/design.md`:

```
Test Layer → Page Objects → Fixtures → Helpers → External Services
```

### Key Interfaces to Implement

#### Webhook Mock Fixture
```typescript
interface WebhookMockFixture {
  mockWebhookEvent(eventType: string, payload: object): Promise<void>;
  mockPaymentIntentAuthorized(paymentIntentId: string, amount: number): Promise<void>;
  mockPaymentIntentCaptured(paymentIntentId: string): Promise<void>;
  mockPaymentIntentFailed(paymentIntentId: string, error: string): Promise<void>;
}
```

#### Data Factory Fixture
```typescript
interface DataFactoryFixture {
  createProduct(overrides?: Partial<Product>): Promise<Product>;
  createCustomer(overrides?: Partial<Customer>): Promise<Customer>;
  createOrder(overrides?: Partial<Order>): Promise<Order>;
  cleanup(): Promise<void>;
}
```

### Webhook Mocking Strategy
From design document:
> Instead of automating Stripe's hosted checkout pages, tests will:
> 1. Intercept the PaymentIntent creation API call
> 2. Mock the payment confirmation response
> 3. Simulate webhook delivery by calling the webhook endpoint directly with test payloads
> 4. Verify order creation and state transitions

### Stripe Webhook Signature
Webhooks must include a valid `Stripe-Signature` header. Use Stripe's test webhook signing secret from environment variables.

---

## Implementation Tasks

### Task 1: Create Webhook Helper Module
**File:** `apps/e2e/helpers/webhook.helper.ts`

```typescript
// Core functions to implement:
export async function simulateWebhook(
  eventType: string, 
  payload: object,
  options?: { delay?: number }
): Promise<Response>;

export async function createStripeSignature(
  payload: string,
  secret: string
): string;

export async function mockPaymentIntentAuthorized(
  paymentIntentId: string,
  amount: number,
  metadata?: Record<string, string>
): Promise<Response>;
```

### Task 2: Create Order Factory Helper
**File:** `apps/e2e/helpers/order.factory.ts`

```typescript
// Core functions to implement:
export async function createTestOrder(
  overrides?: Partial<TestOrderOptions>
): Promise<TestOrder>;

export async function createTestPaymentIntent(
  amount: number,
  metadata?: Record<string, string>
): Promise<PaymentIntent>;

export function generateModificationToken(
  orderId: string,
  paymentIntentId: string,
  expiresIn?: number
): string;
```

### Task 3: Create Test Data Types
**File:** `apps/e2e/types/test-data.types.ts`

```typescript
export interface TestOrder {
  id: string;
  displayId: number;
  paymentIntentId: string;
  items: TestOrderItem[];
  total: number;
  status: string;
  modificationToken: string;
  createdAt: Date;
}

export interface TestOrderItem {
  variantId: string;
  quantity: number;
  unitPrice: number;
}

export interface TestOrderOptions {
  items?: TestOrderItem[];
  shippingAddress?: ShippingAddress;
  email?: string;
  metadata?: Record<string, string>;
}
```

### Task 4: Create Playwright Fixture
**File:** `apps/e2e/fixtures/test-helpers.fixture.ts`

```typescript
import { test as base } from '@playwright/test';

export const test = base.extend<{
  webhookHelper: WebhookHelper;
  orderFactory: OrderFactory;
}>({
  webhookHelper: async ({}, use) => {
    const helper = new WebhookHelper();
    await use(helper);
  },
  orderFactory: async ({}, use) => {
    const factory = new OrderFactory();
    await use(factory);
    await factory.cleanup();
  },
});
```

---

## Dependencies

### Environment Variables Required
```env
STRIPE_WEBHOOK_SECRET=whsec_test_...
STRIPE_SECRET_KEY=sk_test_...
BACKEND_URL=http://localhost:9000
JWT_SECRET=test-jwt-secret
```

### NPM Packages
- `stripe` - For PaymentIntent creation and webhook signature
- `jsonwebtoken` - For modification token generation
- `@playwright/test` - Test framework

---

## Definition of Done

- [ ] `simulateWebhook()` function sends webhooks with valid Stripe signatures
- [ ] `createTestOrder()` creates orders with PaymentIntent in `requires_capture` status
- [ ] `generateModificationToken()` creates valid JWT tokens
- [ ] All helpers are exported as Playwright fixtures
- [ ] Unit tests pass for helper functions
- [ ] Integration test verifies webhook → order creation flow
- [ ] Code follows existing project conventions

---

## Test Scenarios

### Scenario 1: Create Test Order
```typescript
test('createTestOrder creates order with valid PaymentIntent', async ({ orderFactory }) => {
  const order = await orderFactory.createTestOrder({
    items: [{ variantId: 'variant_123', quantity: 2, unitPrice: 2500 }]
  });
  
  expect(order.paymentIntentId).toMatch(/^pi_/);
  expect(order.status).toBe('pending');
  expect(order.modificationToken).toBeTruthy();
});
```

### Scenario 2: Simulate Webhook
```typescript
test('simulateWebhook triggers order creation', async ({ webhookHelper, orderFactory }) => {
  const pi = await orderFactory.createTestPaymentIntent(5000);
  
  const response = await webhookHelper.simulateWebhook(
    'payment_intent.amount_capturable_updated',
    { id: pi.id, amount: 5000, status: 'requires_capture' }
  );
  
  expect(response.status).toBe(200);
});
```

### Scenario 3: Modification Token
```typescript
test('generateModificationToken creates valid JWT', async ({ orderFactory }) => {
  const token = orderFactory.generateModificationToken('order_123', 'pi_456');
  
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  expect(decoded.orderId).toBe('order_123');
  expect(decoded.paymentIntentId).toBe('pi_456');
});
```

---

## Notes

- Use Stripe test mode for all PaymentIntent operations
- Webhook endpoint is at `POST /webhooks/stripe`
- Modification tokens expire after 1 hour (grace period duration)
- All test data should use unique identifiers to prevent collisions in parallel runs

---

## References

- Design Spec: `.kiro/specs/e2e-testing-overhaul/design.md`
- Requirements: `.kiro/specs/e2e-testing-overhaul/requirements.md` (FR1.2, FR3.4, FR11.5)
- Stripe Webhook Testing: https://stripe.com/docs/webhooks/test
- Existing Backend Webhook Handler: `apps/backend/src/loaders/stripe-event-worker.ts`
