# Story 1-2: Create Stripe Test Card Constants and Payment Helpers

**Epic:** Epic 1 - Test Infrastructure Foundation  
**Status:** done
**Created:** 2025-12-14  
**Requirements:** FR9.1, FR9.2, FR9.3

---

## User Story

As a **QA engineer**,  
I want **Stripe test card constants and payment simulation utilities**,  
So that **I can easily test different payment scenarios without looking up card numbers**.

---

## Acceptance Criteria

### AC1: Success Test Card
**Given** I need to test a successful payment  
**When** I use `TEST_CARDS.SUCCESS`  
**Then** the card number `4242424242424242` is used

### AC2: Decline Test Card
**Given** I need to test a declined payment  
**When** I use `TEST_CARDS.DECLINE_GENERIC`  
**Then** the card number `4000000000000002` is used

### AC3: 3D Secure Test Card
**Given** I need to test 3D Secure  
**When** I use `TEST_CARDS.REQUIRES_3DS`  
**Then** the card number `4000002760003184` is used

### AC4: Payment Simulation
**Given** I need to simulate a payment  
**When** I call `simulatePayment(paymentIntentId, testCard)`  
**Then** the PaymentIntent is confirmed with the specified test card

---

## Technical Context

### Architecture Reference
From `.kiro/specs/e2e-testing-overhaul/design.md`:

```typescript
const TEST_CARDS = {
  SUCCESS: '4242424242424242',
  DECLINE_GENERIC: '4000000000000002',
  DECLINE_INSUFFICIENT_FUNDS: '4000000000009995',
  DECLINE_LOST_CARD: '4000000000009987',
  REQUIRES_3DS: '4000002760003184',
  REQUIRES_3DS_FAIL: '4000008260003178',
} as const;
```

### Payment Simulation Strategy
From design document:
> Instead of automating Stripe's hosted checkout pages, tests will:
> 1. Intercept the PaymentIntent creation API call
> 2. Mock the payment confirmation response
> 3. Simulate webhook delivery by calling the webhook endpoint directly

---

## Implementation Tasks

### Task 1: Create Test Cards Constants
**File:** `apps/e2e/helpers/test-cards.ts`

```typescript
/**
 * Stripe test card numbers for various payment scenarios
 * @see https://stripe.com/docs/testing#cards
 */
export const TEST_CARDS = {
  // Successful payments
  SUCCESS: '4242424242424242',
  SUCCESS_VISA_DEBIT: '4000056655665556',
  SUCCESS_MASTERCARD: '5555555555554444',
  SUCCESS_AMEX: '378282246310005',
  
  // Declined payments
  DECLINE_GENERIC: '4000000000000002',
  DECLINE_INSUFFICIENT_FUNDS: '4000000000009995',
  DECLINE_LOST_CARD: '4000000000009987',
  DECLINE_STOLEN_CARD: '4000000000009979',
  DECLINE_EXPIRED_CARD: '4000000000000069',
  DECLINE_INCORRECT_CVC: '4000000000000127',
  DECLINE_PROCESSING_ERROR: '4000000000000119',
  
  // 3D Secure
  REQUIRES_3DS: '4000002760003184',
  REQUIRES_3DS_FAIL: '4000008260003178',
  REQUIRES_3DS_OPTIONAL: '4000002500003155',
  
  // Special cases
  ATTACH_FAIL: '4000000000000341',
  CHARGE_FAIL: '4000000000000341',
} as const;

export type TestCardKey = keyof typeof TEST_CARDS;
export type TestCardNumber = typeof TEST_CARDS[TestCardKey];
```

### Task 2: Create Test Card Details Helper
**File:** `apps/e2e/helpers/test-cards.ts` (continued)

```typescript
/**
 * Complete card details for form filling
 */
export interface TestCardDetails {
  number: string;
  expiry: string;
  cvc: string;
  zip?: string;
}

/**
 * Get complete card details for a test card
 */
export function getTestCardDetails(card: TestCardKey | TestCardNumber): TestCardDetails {
  const number = typeof card === 'string' && card.length === 16 
    ? card 
    : TEST_CARDS[card as TestCardKey];
  
  return {
    number,
    expiry: '12/30', // Future date
    cvc: number.startsWith('37') ? '1234' : '123', // AMEX uses 4-digit CVC
    zip: '12345',
  };
}

/**
 * Format card number for display (with spaces)
 */
export function formatCardNumber(number: string): string {
  return number.replace(/(.{4})/g, '$1 ').trim();
}
```

### Task 3: Create Payment Simulation Helper
**File:** `apps/e2e/helpers/payment.helper.ts`

```typescript
import Stripe from 'stripe';
import { TEST_CARDS, TestCardKey, getTestCardDetails } from './test-cards';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
});

export interface PaymentSimulationResult {
  success: boolean;
  paymentIntentId: string;
  status: Stripe.PaymentIntent.Status;
  error?: string;
  requires3DS?: boolean;
}

/**
 * Simulate a payment by confirming a PaymentIntent with a test card
 */
export async function simulatePayment(
  paymentIntentId: string,
  testCard: TestCardKey | string = 'SUCCESS'
): Promise<PaymentSimulationResult> {
  const cardNumber = testCard in TEST_CARDS 
    ? TEST_CARDS[testCard as TestCardKey] 
    : testCard;
  
  try {
    // Create a test payment method
    const paymentMethod = await stripe.paymentMethods.create({
      type: 'card',
      card: {
        number: cardNumber,
        exp_month: 12,
        exp_year: 2030,
        cvc: cardNumber.startsWith('37') ? '1234' : '123',
      },
    });
    
    // Confirm the PaymentIntent
    const paymentIntent = await stripe.paymentIntents.confirm(paymentIntentId, {
      payment_method: paymentMethod.id,
    });
    
    return {
      success: paymentIntent.status === 'requires_capture' || paymentIntent.status === 'succeeded',
      paymentIntentId: paymentIntent.id,
      status: paymentIntent.status,
      requires3DS: paymentIntent.status === 'requires_action',
    };
  } catch (error) {
    const stripeError = error as Stripe.errors.StripeError;
    return {
      success: false,
      paymentIntentId,
      status: 'canceled',
      error: stripeError.message,
    };
  }
}

/**
 * Create a PaymentIntent for testing
 */
export async function createTestPaymentIntent(
  amount: number,
  options?: {
    currency?: string;
    captureMethod?: 'automatic' | 'manual';
    metadata?: Record<string, string>;
  }
): Promise<Stripe.PaymentIntent> {
  return stripe.paymentIntents.create({
    amount,
    currency: options?.currency || 'usd',
    capture_method: options?.captureMethod || 'manual',
    metadata: options?.metadata,
  });
}

/**
 * Cancel a PaymentIntent
 */
export async function cancelPaymentIntent(
  paymentIntentId: string
): Promise<Stripe.PaymentIntent> {
  return stripe.paymentIntents.cancel(paymentIntentId);
}

/**
 * Capture a PaymentIntent
 */
export async function capturePaymentIntent(
  paymentIntentId: string,
  amount?: number
): Promise<Stripe.PaymentIntent> {
  return stripe.paymentIntents.capture(paymentIntentId, {
    amount_to_capture: amount,
  });
}
```

### Task 4: Create Playwright Fixture for Payment Helpers
**File:** `apps/e2e/fixtures/payment.fixture.ts`

```typescript
import { test as base } from '@playwright/test';
import { 
  simulatePayment, 
  createTestPaymentIntent,
  cancelPaymentIntent,
  capturePaymentIntent,
  PaymentSimulationResult 
} from '../helpers/payment.helper';
import { TEST_CARDS, getTestCardDetails, TestCardKey } from '../helpers/test-cards';

export interface PaymentFixture {
  testCards: typeof TEST_CARDS;
  getCardDetails: typeof getTestCardDetails;
  simulatePayment: typeof simulatePayment;
  createPaymentIntent: typeof createTestPaymentIntent;
  cancelPaymentIntent: typeof cancelPaymentIntent;
  capturePaymentIntent: typeof capturePaymentIntent;
}

export const test = base.extend<{ payment: PaymentFixture }>({
  payment: async ({}, use) => {
    await use({
      testCards: TEST_CARDS,
      getCardDetails: getTestCardDetails,
      simulatePayment,
      createPaymentIntent: createTestPaymentIntent,
      cancelPaymentIntent,
      capturePaymentIntent,
      capturePaymentIntent,
    });
  },
});

export { expect } from '@playwright/test';
```

---

## Dependencies

### Environment Variables Required
```env
STRIPE_SECRET_KEY=sk_test_...
```

### NPM Packages
- `stripe` - Stripe SDK for PaymentIntent operations
- `@playwright/test` - Test framework

---

## Definition of Done

- [x] `TEST_CARDS` constant exported with all standard test card numbers
- [x] `getTestCardDetails()` returns complete card details for form filling
- [x] `simulatePayment()` confirms PaymentIntents with test cards
- [x] `createTestPaymentIntent()` creates PaymentIntents in test mode
- [x] Payment fixture available in Playwright tests
- [x] Unit tests verify card constants match Stripe documentation
- [x] Integration test confirms payment with success card

---

## Test Scenarios

### Scenario 1: Use Success Card
```typescript
test('SUCCESS card confirms payment', async ({ payment }) => {
  const pi = await payment.createPaymentIntent(5000);
  const result = await payment.simulatePayment(pi.id, 'SUCCESS');
  
  expect(result.success).toBe(true);
  expect(result.status).toBe('requires_capture');
});
```

### Scenario 2: Use Decline Card
```typescript
test('DECLINE_GENERIC card fails payment', async ({ payment }) => {
  const pi = await payment.createPaymentIntent(5000);
  const result = await payment.simulatePayment(pi.id, 'DECLINE_GENERIC');
  
  expect(result.success).toBe(false);
  expect(result.error).toContain('declined');
});
```

### Scenario 3: Use 3DS Card
```typescript
test('REQUIRES_3DS card triggers authentication', async ({ payment }) => {
  const pi = await payment.createPaymentIntent(5000);
  const result = await payment.simulatePayment(pi.id, 'REQUIRES_3DS');
  
  expect(result.requires3DS).toBe(true);
  expect(result.status).toBe('requires_action');
});
```

### Scenario 4: Get Card Details for Form
```typescript
test('getTestCardDetails returns complete card info', async ({ payment }) => {
  const details = payment.getCardDetails('SUCCESS');
  
  expect(details.number).toBe('4242424242424242');
  expect(details.expiry).toBe('12/30');
  expect(details.cvc).toBe('123');
});
```

---

## Notes

- All test cards only work in Stripe test mode
- AMEX cards use 4-digit CVC, others use 3-digit
- 3DS cards will return `requires_action` status - actual 3DS flow requires browser automation
- Card numbers are from official Stripe testing documentation

---

## References

- Design Spec: `.kiro/specs/e2e-testing-overhaul/design.md`
- Requirements: `.kiro/specs/e2e-testing-overhaul/requirements.md` (FR9.1, FR9.2, FR9.3)
- Stripe Test Cards: https://stripe.com/docs/testing#cards
- Stripe 3DS Testing: https://stripe.com/docs/testing#regulatory-cards
