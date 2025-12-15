import { test as base, expect } from '@playwright/test';
import { DataFactory } from '../helpers/data-factory';
import {
  simulatePayment,
  createTestPaymentIntent,
  cancelPaymentIntent,
  capturePaymentIntent,
} from '../helpers/payment.helper';
import { WebhookHelper } from '../helpers/webhook.helper';
import { OrderFactory } from '../helpers/order.factory';
import { TEST_CARDS, getTestCardDetails } from '../helpers/test-cards';

// Combined fixture type
export interface TestFixtures {
  dataFactory: DataFactory;
  orderFactory: OrderFactory;
  payment: {
    testCards: typeof TEST_CARDS;
    getCardDetails: typeof getTestCardDetails;
    simulatePayment: typeof simulatePayment;
    createPaymentIntent: typeof createTestPaymentIntent;
    cancelPaymentIntent: typeof cancelPaymentIntent;
    capturePaymentIntent: typeof capturePaymentIntent;
  };
  webhook: {
    simulateWebhook: WebhookHelper['simulateWebhook'];
    mockPaymentIntentAuthorized: WebhookHelper['mockPaymentIntentAuthorized'];
  };
}

// Extended test with all fixtures
export const test = base.extend<TestFixtures>({
  dataFactory: async ({}, use) => {
    const factory = new DataFactory();
    await use(factory);
    await factory.cleanup();
  },

  payment: async ({}, use) => {
    await use({
      testCards: TEST_CARDS,
      getCardDetails: getTestCardDetails,
      simulatePayment,
      createPaymentIntent: createTestPaymentIntent,
      cancelPaymentIntent,
      cancelPaymentIntent, // Fix duplicate property if exists in original
      capturePaymentIntent,
    });
  },

  orderFactory: async ({}, use) => {
    const factory = new OrderFactory();
    await use(factory);
    await factory.cleanup();
  },

  webhook: async ({}, use) => {
    const helper = new WebhookHelper();

    await use({
      simulateWebhook: helper.simulateWebhook.bind(helper),
      mockPaymentIntentAuthorized: helper.mockPaymentIntentAuthorized.bind(helper),
    });
  },
});

export { expect };
