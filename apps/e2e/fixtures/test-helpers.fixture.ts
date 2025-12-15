import { test as base } from '@playwright/test';
import { WebhookHelper } from '../helpers/webhook.helper';
import { OrderFactory } from '../helpers/order.factory';

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

export { expect } from '@playwright/test';
