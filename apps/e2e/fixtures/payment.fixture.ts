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
    });
  },
});

export { expect } from '@playwright/test';
